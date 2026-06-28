// netlify/functions/companion-invoice-mark-payment.ts
// POST /api/companion-invoice-mark-payment
// Patient-facing: forwards the user's own JWT so RLS applies.
// Body: { invoice_id, amount, method, reference?, note? }
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  },
  body: JSON.stringify(body),
})

export const handler = async (event: {
  httpMethod: string
  headers: Record<string, string>
  body: string | null
}) => {
  if (event.httpMethod === 'OPTIONS') return json(204, '')
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' })

  const auth = event.headers.authorization || event.headers.Authorization || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json(401, { error: 'unauthorized' })

  let payload: any
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  const { invoice_id, amount, method, reference, note } = payload
  if (!invoice_id || amount == null || !method) {
    return json(400, { error: 'missing_fields', message: 'invoice_id, amount, and method are required' })
  }

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })

  const { data, error } = await user.schema('cr').rpc('invoice_mark_payment', {
    p_invoice_id: Number(invoice_id),
    p_amount: Number(amount),
    p_method: String(method),
    p_reference: reference ? String(reference) : null,
    p_note: note ? String(note) : null,
  })

  if (error) return json(500, { error: error.message })
  return json(200, { state: 'ok', data })
}
