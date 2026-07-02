// netlify/functions/companion-log-day.ts
// POST /api/companion-log-day
// Body: { carePlanId, logDate, entry: { vitals, meds, prn, bowel, diarrhea, areas, notes, device } }
// Persists the FULL day entry as a snapshot (cr.companion_day_log) and fans out
// clinical data to cr.companion_vital / cr.companion_med_log via the existing
// companion_log_day RPC — both inside cr.companion_save_day_log (SECURITY INVOKER).
// Patient resolved server-side; idempotent per (patient, plan, day).
//
// Back-compat: legacy flat bodies ({ carePlanId, logDate, vitals, meds, ... })
// are accepted and wrapped into an entry object.
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY!

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_NOTES_CHARS = 4000

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
  if (!Number.isInteger(p.carePlanId) || typeof p.logDate !== 'string' || !DATE_RE.test(p.logDate)) {
    return json(400, { error: 'bad_request', detail: 'carePlanId (int) and logDate (YYYY-MM-DD) required' })
  }

  const src = p.entry && typeof p.entry === 'object' ? p.entry : p
  const notes = typeof src.notes === 'string' ? src.notes.slice(0, MAX_NOTES_CHARS) : ''
  const entry = {
    vitals: src.vitals ?? {},
    meds: src.meds ?? {},
    prn: src.prn ?? {},
    bowel: Number(src.bowel) || 0,
    diarrhea: !!src.diarrhea,
    areas: Array.isArray(src.areas) ? src.areas : [],
    notes,
    device: src.device ?? {},
  }

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })

  const { data, error } = await user.rpc('companion_save_day_log', {
    p_care_plan_id: p.carePlanId,
    p_log_date: p.logDate,
    p_entry: entry,
  })
  if (error) return json(500, { error: error.message })

  const state = (data as any)?.state
  if (state === 'unauthorized') return json(401, { error: 'unauthorized' })
  if (state === 'not_found') return json(404, { error: 'not_found' })
  return json(200, data)
}
