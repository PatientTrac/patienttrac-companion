// netlify/functions/companion-invoice-approve-payment.ts
// POST /api/companion-invoice-approve-payment
// Staff-only: verifies the caller is a staff member via verifyStaffJwt.
// Body: { invoice_id, approve: boolean, reason?: string }
import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, jsonOk, jsonErr, CORS_HEADERS } from './_mobile-helpers'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const handler = async (event: {
  httpMethod: string
  headers: Record<string, string>
  body: string | null
}) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  }
  if (event.httpMethod !== 'POST') return jsonErr(405, 'method_not_allowed', 'POST only')

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false },
  })

  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'unauthorized', 'Staff authentication required')

  let payload: any
  try {
    payload = JSON.parse(event.body || '{}')
  } catch {
    return jsonErr(400, 'invalid_json', 'Could not parse request body')
  }

  const { invoice_id, approve, reason } = payload
  if (!invoice_id || approve == null) {
    return jsonErr(400, 'missing_fields', 'invoice_id and approve are required')
  }

  const { data, error } = await admin.schema('cr').rpc('invoice_approve_payment', {
    p_invoice_id: Number(invoice_id),
    p_approve: Boolean(approve),
    p_reason: reason ? String(reason) : null,
  })

  if (error) return jsonErr(500, 'rpc_error', error.message)
  return jsonOk({ state: 'ok', data })
}
