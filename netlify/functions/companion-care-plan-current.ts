// netlify/functions/companion-care-plan-current.ts
// GET /api/companion-care-plan-current[?carePlanId=2]
// Returns the signed-in patient's active care_plan joined to its template,
// plus a selector list of their active plans. The patient is resolved
// SERVER-SIDE via cr.current_patient_id() (auth.uid() -> cr.patient_account);
// the browser never sends a patient_id. We call the RPC AS THE USER by
// forwarding their Bearer token on an anon-key client, so RLS + auth.uid() apply.
//
// ENV: SUPABASE_URL, SUPABASE_ANON_KEY  (anon key is public; set it in Netlify)
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
  queryStringParameters?: Record<string, string> | null
}) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'method_not_allowed' })

  const auth = event.headers.authorization || event.headers.Authorization || ''
  if (!auth.toLowerCase().startsWith('bearer ')) return json(401, { error: 'unauthorized' })

  const raw = event.queryStringParameters?.carePlanId
  const carePlanId = raw && /^\d+$/.test(raw) ? Number(raw) : null

  const user = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  })

  const { data, error } = await user.rpc('companion_care_plan_current', { p_care_plan_id: carePlanId })
  if (error) return json(500, { error: error.message })

  const state = (data as any)?.state
  if (state === 'unauthorized') return json(401, { error: 'unauthorized' })
  if (state === 'no_active_plan') return json(404, { error: 'no_active_plan', available: (data as any).available ?? [] })
  return json(200, { current: (data as any).current, available: (data as any).available ?? [] })
}
