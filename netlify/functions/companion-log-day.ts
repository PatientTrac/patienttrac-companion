// netlify/functions/companion-log-day.ts
// POST /api/companion-log-day
// Body: { carePlanId, logDate, vitals, meds, prn, bowel, diarrhea }
// Persists one day's entry -> cr.companion_vital (manual vitals) + cr.companion_med_log
// (adherence) via the companion_log_day RPC. Patient resolved server-side; idempotent per day.
//
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
})

export const handler = async (event: {
  httpMethod: string
  headers: Record<string, string>
  body?: string | null
}) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'method_not_allowed' })

  const auth = event.headers.authorization || event.headers.Authorization || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json(401, { error: 'unauthorized' })

  let p: any
  try { p = JSON.parse(event.body || '{}') } catch { return json(400, { error: 'bad_request' }) }
  if (!Number.isInteger(p.carePlanId) || typeof p.logDate !== 'string') {
    return json(400, { error: 'bad_request', detail: 'carePlanId (int) and logDate (YYYY-MM-DD) required' })
  }

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })

  const { data, error } = await user.rpc('companion_log_day', {
    p_care_plan_id: p.carePlanId,
    p_log_date: p.logDate,
    p_vitals: p.vitals ?? {},
    p_meds: p.meds ?? {},
    p_prn: p.prn ?? {},
    p_bowel: p.bowel ?? null,
    p_diarrhea: !!p.diarrhea,
  })
  if (error) return json(500, { error: error.message })

  const state = (data as any)?.state
  if (state === 'unauthorized') return json(401, { error: 'unauthorized' })
  if (state === 'not_found') return json(404, { error: 'not_found' })
  return json(200, data)
}
