// netlify/functions/companion-oauth-callback.ts
// Provider redirect target. Verifies the signed state, exchanges the auth code for
// tokens, stores them (service role only), links the device, and 302s back to the app.
// GET /api/companion-oauth-callback?code=...&state=...
//
// ENV: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OAUTH_STATE_SECRET, COMPANION_PUBLIC_URL,
//      FITBIT_CLIENT_ID, FITBIT_CLIENT_SECRET,
//      WITHINGS_CLIENT_ID, WITHINGS_CLIENT_SECRET, WITHINGS_API_BASE (default public cloud)
import { createClient } from '@supabase/supabase-js'
import { createHmac, timingSafeEqual } from 'node:crypto'

type Provider = 'fitbit' | 'withings'

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url')

function verifyState(secret: string, state: string): { patientId: number; provider: Provider } | null {
  const parts = state.split('.')
  if (parts.length !== 4) return null
  const [pid, provider, exp, sig] = parts
  const expected = sign(secret, `${pid}.${provider}.${exp}`)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  if (Date.now() > Number(exp)) return null
  if (provider !== 'fitbit' && provider !== 'withings') return null
  return { patientId: Number(pid), provider }
}

async function exchangeFitbit(code: string, redirectUri: string) {
  const id = process.env.FITBIT_CLIENT_ID!, secret = process.env.FITBIT_CLIENT_SECRET!
  const basic = Buffer.from(`${id}:${secret}`).toString('base64')
  const res = await fetch('https://api.fitbit.com/oauth2/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: id }),
  })
  const j = await res.json()
  if (!res.ok) throw new Error(`fitbit token: ${j.errors?.[0]?.message || res.status}`)
  return { access: j.access_token, refresh: j.refresh_token, expiresIn: j.expires_in, scope: (j.scope || '').split(' '), externalId: j.user_id }
}

async function exchangeWithings(code: string, redirectUri: string) {
  const id = process.env.WITHINGS_CLIENT_ID!, secret = process.env.WITHINGS_CLIENT_SECRET!
  const base = process.env.WITHINGS_API_BASE || 'https://wbsapi.withings.net'
  const res = await fetch(`${base}/v2/oauth2`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      action: 'requesttoken', grant_type: 'authorization_code',
      client_id: id, client_secret: secret, code, redirect_uri: redirectUri,
    }),
  })
  const j = await res.json()
  if (j.status !== 0) throw new Error(`withings token: status ${j.status} ${j.error || ''}`)
  const b = j.body
  return { access: b.access_token, refresh: b.refresh_token, expiresIn: b.expires_in, scope: (b.scope || '').split(','), externalId: String(b.userid) }
}

export const handler = async (event: {
  httpMethod: string
  queryStringParameters: Record<string, string> | null
}) => {
  const appUrl = (process.env.COMPANION_PUBLIC_URL || '').replace(/\/$/, '')
  const fail = (msg: string) => ({ statusCode: 302, headers: { Location: `${appUrl}/vitals?connect_error=${encodeURIComponent(msg)}` }, body: '' })
  try {
    const code = event.queryStringParameters?.code
    const state = event.queryStringParameters?.state
    const secret = process.env.OAUTH_STATE_SECRET
    if (!code || !state || !secret || !appUrl) return fail('not configured')

    const v = verifyState(secret, state)
    if (!v) return fail('invalid or expired state')

    const redirectUri = `${appUrl}/api/companion-oauth-callback`
    const tok = v.provider === 'fitbit'
      ? await exchangeFitbit(code, redirectUri)
      : await exchangeWithings(code, redirectUri)

    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: acct } = await admin.schema('cr').from('patient_account')
      .select('org_id').eq('patient_id', v.patientId).maybeSingle()
    if (!acct?.org_id) return fail('patient not enrolled')

    const expiresAt = tok.expiresIn ? new Date(Date.now() + tok.expiresIn * 1000).toISOString() : null

    await admin.schema('cr').from('companion_oauth_token').upsert({
      patient_id: v.patientId, org_id: acct.org_id, provider: v.provider,
      external_user_id: tok.externalId ?? null,
      access_token: tok.access, refresh_token: tok.refresh ?? null,
      scopes: tok.scope, expires_at: expiresAt, connected_at: new Date().toISOString(),
    }, { onConflict: 'patient_id,provider' })

    // Reflect the connection on the device roster (informational).
    await admin.schema('cr').from('companion_device').insert({
      patient_id: v.patientId, org_id: acct.org_id, provider: v.provider,
      device_label: v.provider === 'fitbit' ? 'Fitbit' : 'Withings',
      status: 'connected', external_user_id: tok.externalId ?? null,
    })

    return { statusCode: 302, headers: { Location: `${appUrl}/vitals?connected=${v.provider}` }, body: '' }
  } catch (e: any) {
    return fail(e?.message || 'error')
  }
}
