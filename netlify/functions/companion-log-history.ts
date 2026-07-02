// netlify/functions/companion-log-history.ts
// GET /api/companion-log-history?carePlanId=&from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns saved Daily Log snapshots for the calling patient (audit H3).
// Patient resolved server-side inside cr.companion_log_history (SECURITY INVOKER,
// RLS-enforced). ENV: SUPABASE_URL, SUPABASE_ANON_KEY.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

export const handler = async (event: {
  httpMethod: string
  headers: Record<string, string>
  queryStringParameters?: Record<string, string | null>
}) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' })

  const auth = event.headers.authorization || event.headers.Authorization || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json(401, { error: 'unauthorized' })

  const q = event.queryStringParameters || {}
  const carePlanId = Number(q.carePlanId)
  const from = q.from || ''
  const to = q.to || ''
  if (!Number.isInteger(carePlanId) || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return json(400, { error: 'bad_request', detail: 'carePlanId (int), from and to (YYYY-MM-DD) required' })
  }

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })

  const { data, error } = await user.rpc('companion_log_history', {
    p_care_plan_id: carePlanId,
    p_from: from,
    p_to: to,
  })
  if (error) return json(500, { error: error.message })

  const state = (data as any)?.state
  if (state === 'unauthorized') return json(401, { error: 'unauthorized' })
  if (state === 'bad_range') return json(400, { error: 'bad_range' })
  return json(200, data)
}
