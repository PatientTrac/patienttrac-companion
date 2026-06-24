// netlify/functions/companion-sync.ts
// Pulls recent readings from connected providers and normalizes them into
// cr.companion_vital. Two trigger modes:
//   • Patient on-demand:  POST /api/companion-sync   (Authorization: Bearer <token>)
//   • Scheduled/cron:     POST /api/companion-sync   header  x-sync-secret: <SYNC_CRON_SECRET>
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET,
//      WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET, WITHINGS_API_BASE,
//      WITHINGS_MEDICAL_GRADE = "true"   → flag Withings readings is_medical_grade
//      SYNC_CRON_SECRET                  → for the scheduled sweep
//
// NOTE: provider endpoints/units below follow each vendor's documented behavior but
// have not been exercised against live credentials yet — smoke-test on first connect.
import { createClient, SupabaseClient } from '@supabase/supabase-js'

type Provider = 'fitbit' | 'withings'
type Reading = { type: string; value: number; unit: string | null; recorded_at: string }

const ymd = (d: Date) => d.toISOString().slice(0, 10)

// ── Token refresh ───────────────────────────────────────────
async function refresh(provider: Provider, refreshToken: string) {
  if (provider === 'fitbit') {
    const id = process.env.FITBIT_CLIENT_ID!, secret = process.env.FITBIT_CLIENT_SECRET!
    const basic = Buffer.from(`${id}:${secret}`).toString('base64')
    const res = await fetch('https://api.fitbit.com/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    const j = await res.json()
    if (!res.ok) throw new Error(`fitbit refresh: ${res.status}`)
    return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in }
  }
  const id = process.env.WITHINGS_CLIENT_ID!, secret = process.env.WITHINGS_CLIENT_SECRET!
  const base = process.env.WITHINGS_API_BASE || 'https://wbsapi.withings.net'
  const res = await fetch(`${base}/v2/oauth2`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'requesttoken', grant_type: 'refresh_token', client_id: id, client_secret: secret, refresh_token: refreshToken }),
  })
  const j = await res.json()
  if (j.status !== 0) throw new Error(`withings refresh: status ${j.status}`)
  return { access: j.body.access_token, refresh: j.body.refresh_token, expiresIn: j.body.expires_in }
}

// ── Provider fetch + normalize (initial mapped metric set; extensible) ──────
async function fetchFitbit(access: string, since: Date): Promise<Reading[]> {
  const start = ymd(since), end = ymd(new Date())
  const h = { Authorization: `Bearer ${access}` } // no Accept-Language → metric units
  const out: Reading[] = []

  const weight = await (await fetch(`https://api.fitbit.com/1/user/-/body/log/weight/date/${start}/${end}.json`, { headers: h })).json()
  for (const w of weight.weight || []) out.push({ type: 'weight_kg', value: Number(w.weight), unit: 'kg', recorded_at: new Date(`${w.date}T${w.time || '12:00:00'}`).toISOString() })

  const hr = await (await fetch(`https://api.fitbit.com/1/user/-/activities/heart/date/${start}/${end}.json`, { headers: h })).json()
  for (const d of hr['activities-heart'] || []) {
    const rhr = d.value?.restingHeartRate
    if (rhr) out.push({ type: 'heart_rate', value: Number(rhr), unit: 'bpm', recorded_at: new Date(`${d.dateTime}T12:00:00`).toISOString() })
  }

  const spo2 = await (await fetch(`https://api.fitbit.com/1/user/-/spo2/date/${start}/${end}.json`, { headers: h })).json()
  for (const d of (Array.isArray(spo2) ? spo2 : [])) {
    const avg = d.value?.avg
    if (avg) out.push({ type: 'spo2', value: Number(avg), unit: '%', recorded_at: new Date(`${d.dateTime}T12:00:00`).toISOString() })
  }
  return out
}

async function fetchWithings(access: string, since: Date): Promise<Reading[]> {
  const base = process.env.WITHINGS_API_BASE || 'https://wbsapi.withings.net'
  const res = await fetch(`${base}/measure`, {
    method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ action: 'getmeas', meastypes: '1,9,10,11,54', category: '1', startdate: String(Math.floor(since.getTime() / 1000)), enddate: String(Math.floor(Date.now() / 1000)) }),
  })
  const j = await res.json()
  if (j.status !== 0) throw new Error(`withings getmeas: status ${j.status}`)
  const MAP: Record<number, { type: string; unit: string | null }> = {
    1: { type: 'weight_kg', unit: 'kg' }, 9: { type: 'bp_diastolic', unit: 'mmHg' },
    10: { type: 'bp_systolic', unit: 'mmHg' }, 11: { type: 'heart_rate', unit: 'bpm' }, 54: { type: 'spo2', unit: '%' },
  }
  const out: Reading[] = []
  for (const grp of j.body?.measuregrps || []) {
    const at = new Date(grp.date * 1000).toISOString()
    for (const m of grp.measures || []) {
      const map = MAP[m.type]; if (!map) continue
      out.push({ type: map.type, value: m.value * Math.pow(10, m.unit), unit: map.unit, recorded_at: at })
    }
  }
  return out
}

// ── Sync one connected token ────────────────────────────────
async function syncToken(admin: SupabaseClient, tok: any): Promise<number> {
  const provider = tok.provider as Provider
  let access = tok.access_token
  const expired = tok.expires_at && new Date(tok.expires_at).getTime() < Date.now() + 60_000
  if (expired && tok.refresh_token) {
    const r = await refresh(provider, tok.refresh_token)
    access = r.access
    await admin.schema('cr').from('companion_oauth_token').update({
      access_token: r.access, refresh_token: r.refresh ?? tok.refresh_token,
      expires_at: r.expiresIn ? new Date(Date.now() + r.expiresIn * 1000).toISOString() : null,
    }).eq('id', tok.id)
  }

  const since = tok.last_sync_at ? new Date(tok.last_sync_at) : new Date(Date.now() - 7 * 86400_000)
  const readings = provider === 'fitbit' ? await fetchFitbit(access, since) : await fetchWithings(access, since)

  // Dedup against what's already stored in the window (no unique constraint on companion_vital).
  const { data: existing } = await admin.schema('cr').from('companion_vital')
    .select('type,recorded_at').eq('patient_id', tok.patient_id).eq('source', provider)
    .gte('recorded_at', since.toISOString())
  const seen = new Set((existing || []).map((r: any) => `${r.type}|${new Date(r.recorded_at).toISOString()}`))
  const medical = provider === 'withings' && process.env.WITHINGS_MEDICAL_GRADE === 'true'

  const rows = readings
    .filter(r => !seen.has(`${r.type}|${r.recorded_at}`))
    .map(r => ({ patient_id: tok.patient_id, org_id: tok.org_id, type: r.type, value: r.value, unit: r.unit, source: provider, recorded_at: r.recorded_at, is_medical_grade: medical }))

  if (rows.length) {
    const { error } = await admin.schema('cr').from('companion_vital').insert(rows)
    if (error) throw error
  }
  await admin.schema('cr').from('companion_oauth_token').update({ last_sync_at: new Date().toISOString() }).eq('id', tok.id)
  await admin.schema('cr').from('companion_device').update({ last_sync_at: new Date().toISOString() })
    .eq('patient_id', tok.patient_id).eq('provider', provider)
  return rows.length
}

export const handler = async (event: { httpMethod: string; headers: Record<string, string> }) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }
  try {
    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const cronSecret = event.headers['x-sync-secret'] || event.headers['X-Sync-Secret']

    let tokens: any[] = []
    if (cronSecret && cronSecret === process.env.SYNC_CRON_SECRET) {
      // Scheduled sweep: every connected token.
      const { data } = await admin.schema('cr').from('companion_oauth_token').select('*')
      tokens = data || []
    } else {
      // Patient on-demand.
      const jwt = (event.headers.authorization || event.headers.Authorization || '').replace(/^Bearer\s+/i, '')
      if (!jwt) return { statusCode: 401, body: JSON.stringify({ error: 'not signed in' }) }
      const { data: userRes } = await admin.auth.getUser(jwt)
      if (!userRes?.user) return { statusCode: 401, body: JSON.stringify({ error: 'invalid session' }) }
      const { data: acct } = await admin.schema('cr').from('patient_account').select('patient_id').eq('auth_user_id', userRes.user.id).maybeSingle()
      if (!acct?.patient_id) return { statusCode: 403, body: JSON.stringify({ error: 'no linked patient' }) }
      const { data } = await admin.schema('cr').from('companion_oauth_token').select('*').eq('patient_id', acct.patient_id)
      tokens = data || []
    }

    let inserted = 0, synced = 0, errors: string[] = []
    for (const t of tokens) {
      try { inserted += await syncToken(admin, t); synced++ }
      catch (e: any) { errors.push(`${t.provider}#${t.patient_id}: ${e?.message || 'error'}`) }
    }
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ synced, inserted, errors }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || 'error' }) }
  }
}
