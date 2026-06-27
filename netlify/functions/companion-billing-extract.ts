// netlify/functions/companion-billing-extract.ts
// AI extraction for Companion billing uploads. Given an upload_id, downloads the
// file from the 'billing-uploads' bucket, asks Claude to extract structured
// billing fields, stores the result on cr.companion_billing_upload, and (when
// confident and amounts are present) posts the matching billing rows linked
// back to the upload via source_upload_id. Idempotent per upload.
//
// ENV: ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const MODEL = 'claude-sonnet-4-6'
const ORG_PLACEHOLDER = '' // org/patient come from the upload row

const SYSTEM = `You extract structured billing data from ONE uploaded healthcare document — an invoice, a payment receipt, or an insurance Explanation of Benefits / claim settlement (EOB).
Return ONLY a JSON object. No prose, no markdown fences.

Schema:
{
  "kind": "invoice" | "receipt" | "insurance_eob" | "unknown",
  "provider_or_payer": string|null,   // provider/clinic for invoice/receipt; insurer for EOB
  "invoice_number": string|null,
  "service_date": "YYYY-MM-DD"|null,
  "currency": string|null,            // ISO 4217 detected from the document (e.g. "USD", "COP"); pesos/COP$ => "COP"
  "total_amount": number|null,        // invoice total, or amount paid on a receipt
  "patient_paid": number|null,        // patient's payment if shown
  "insurance_paid": number|null,      // EOB: amount the insurer paid (its own currency if different — see insurance_currency)
  "insurance_currency": string|null,
  "payment_method": string|null,
  "reference_number": string|null,
  "description": string|null,
  "confidence": number                // 0..1
}

Rules:
- Numbers are plain: no thousands separators, no currency symbols (1339000 not "1,339,000.00 COP").
- Detect currency from symbols/words. "COP", "pesos", "$X.XXX.XXX" with dot-thousands => COP. "USD", "US$" => USD.
- If a value is a template placeholder (e.g. %total_order%, %total_pedido%) or missing, use null and LOWER confidence.
- NEVER invent an amount. Unsure => null + low confidence.`

const json = (b: unknown, s = 200) => ({ statusCode: s, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) })

export const handler = async (event: { httpMethod: string; body: string | null; headers: Record<string, string> }) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  const auth = event.headers['authorization'] || event.headers['Authorization']
  if (!auth) return json({ error: 'Unauthorized' }, 401)

  let upload_id: string
  try { upload_id = JSON.parse(event.body || '{}').upload_id } catch { return json({ error: 'Invalid JSON' }, 400) }
  if (!upload_id) return json({ error: 'upload_id required' }, 400)

  const URL = process.env.SUPABASE_URL!
  const ANON = process.env.SUPABASE_ANON_KEY!
  const SVC = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return json({ error: 'AI not configured' }, 500)

  // RLS-scoped client confirms the caller owns this upload.
  const userClient = createClient(URL, ANON, { global: { headers: { Authorization: auth } } })
  const admin = createClient(URL, SVC)

  const { data: up, error: upErr } = await userClient.schema('cr')
    .from('companion_billing_upload')
    .select('upload_id, patient_id, org_id, doc_type, file_path, mime_type')
    .eq('upload_id', upload_id).maybeSingle()
  if (upErr || !up) return json({ error: 'Upload not found' }, 404)

  try {
    await admin.schema('cr').from('companion_billing_upload')
      .update({ extraction_status: 'processing', updated_at: new Date().toISOString() }).eq('upload_id', upload_id)

    // Download bytes (service role bypasses storage RLS)
    const dl = await admin.storage.from('billing-uploads').download(up.file_path)
    if (dl.error || !dl.data) throw new Error('download failed: ' + (dl.error?.message || 'no data'))
    const buf = Buffer.from(await dl.data.arrayBuffer())
    const b64 = buf.toString('base64')
    const mime = up.mime_type || 'application/pdf'

    const block = mime === 'application/pdf'
      ? { type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: b64 } }
      : { type: 'image' as const, source: { type: 'base64' as const, media_type: mime as any, data: b64 } }

    const client = new Anthropic({ apiKey })
    const msg = await client.messages.create({
      model: MODEL, max_tokens: 700, system: SYSTEM,
      messages: [{ role: 'user', content: [block, { type: 'text', text: `Document category hint: ${up.doc_type}. Extract the billing data as JSON only.` }] }],
    })
    const raw = msg.content.filter(b => b.type === 'text').map((b: any) => b.text).join('\n').replace(/```json|```/g, '').trim()
    let ex: any
    try { ex = JSON.parse(raw) } catch { throw new Error('model did not return JSON') }

    const confident = typeof ex.total_amount === 'number' && (ex.confidence ?? 0) >= 0.6 && ex.kind !== 'unknown'

    // Idempotency: only post once per upload
    const { count } = await admin.schema('cr').from('patient_invoice')
      .select('invoice_id', { count: 'exact', head: true }).eq('source_upload_id', upload_id)
    const already = (count ?? 0) > 0

    if (confident && !already) {
      const base = { patient_id: up.patient_id, org_id: up.org_id, source_upload_id: upload_id }
      if (ex.kind === 'invoice' || ex.kind === 'receipt_and_invoice') {
        await admin.schema('cr').from('patient_invoice').insert({
          ...base, invoice_number: ex.invoice_number, invoice_date: ex.service_date, currency: ex.currency || 'USD',
          total_charges: ex.total_amount, amount_paid: ex.patient_paid ?? 0,
          balance_due: Math.max(0, (ex.total_amount ?? 0) - (ex.patient_paid ?? 0)),
          amount_due: Math.max(0, (ex.total_amount ?? 0) - (ex.patient_paid ?? 0)),
          status: (ex.patient_paid ?? 0) >= (ex.total_amount ?? 0) ? 'paid' : 'open',
          notes: ex.provider_or_payer ? `${ex.provider_or_payer}${ex.description ? ' — ' + ex.description : ''}` : ex.description,
        })
      }
      if (ex.kind === 'receipt' || ex.kind === 'receipt_and_invoice') {
        await admin.schema('cr').from('patient_payments').insert({
          ...base, payment_date: ex.service_date, payment_amount: ex.patient_paid ?? ex.total_amount,
          currency: ex.currency || 'USD', payment_method: ex.payment_method, reference_number: ex.reference_number,
          notes: ex.provider_or_payer || ex.description,
        })
      }
      if (ex.kind === 'insurance_eob' && typeof ex.insurance_paid === 'number') {
        await admin.schema('cr').from('era_payments').insert({
          ...base, payer_name: ex.provider_or_payer || 'Insurer', payer_id: ex.invoice_number,
          check_date: ex.service_date, total_payment: ex.insurance_paid,
          currency: ex.insurance_currency || ex.currency || 'USD', status: 'paid',
          posted_at: new Date().toISOString(), payment_method: ex.payment_method,
        })
      }
    }

    const status = already ? 'committed' : confident ? 'committed' : 'needs_review'
    await admin.schema('cr').from('companion_billing_upload').update({
      extracted: ex, extraction_status: status, extracted_at: new Date().toISOString(),
      committed_at: status === 'committed' ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq('upload_id', upload_id)

    return json({ status, extracted: ex })
  } catch (e: any) {
    await admin.schema('cr').from('companion_billing_upload').update({
      extraction_status: 'failed', extraction_error: e?.message || 'error', updated_at: new Date().toISOString(),
    }).eq('upload_id', upload_id)
    return json({ error: e?.message || 'extraction failed' }, 500)
  }
}
