// netlify/functions/companion-connect.ts
// Starts a device-provider OAuth connect for the signed-in patient.
// GET /api/companion-connect?provider=fitbit|withings   (Authorization: Bearer <supabase access token>)
// → { authorizeUrl }   (the app sends the browser there)
//
// ENV (server-side, Netlify):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   OAUTH_STATE_SECRET                 — HMAC secret binding state→patient
//   COMPANION_PUBLIC_URL               — e.g. https://patienttraccompanion.com (for redirect_uri)
//   FITBIT_CLIENT_ID
//   WITHINGS_CLIENT_ID
//   WITHINGS_AUTH_BASE (optional)      — default https://account.withings.com
import { createClient } from '@supabase/supabase-js'
import { createHmac } from 'node:crypto'

type Provider = 'fitbit' | 'withings'

const sign = (secret: string, payload: string) =>
  createHmac('sha256', secret).update(payload).digest('base64url')

function authorizeUrl(provider: Provider, clientId: string, redirectUri: string, state: string): string {
  if (provider === 'fitbit') {
    const scope = 'weight heartrate oxygen_saturation respiratory_rate temperature profile'
    const p = new URLSearchParams({
      client_id: clientId, response_type: 'code', scope,
      redirect_uri: redirectUri, state, prompt: 'consent',
    })
    return `https://www.fitbit.com/oauth2/authorize?${p.toString()}`
  }
  // Withings
  const base = process.env.WITHINGS_AUTH_BASE || 'https://account.withings.com'
  const p = new URLSearchParams({
    response_type: 'code', client_id: clientId, scope: 'user.metrics',
    redirect_uri: redirectUri, state,
  })
  return `${base}/oauth2_user/authorize2?${p.toString()}`
}

export const handler = async (event: {
  httpMethod: string
  queryStringParameters: Record<string, string> | null
  headers: Record<string, string>
}) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' }
  try {
    const provider = (event.queryStringParameters?.provider || '') as Provider
    if (provider !== 'fitbit' && provider !== 'withings')
      return { statusCode: 400, body: JSON.stringify({ error: 'unknown provider' }) }

    const stateSecret = process.env.OAUTH_STATE_SECRET
    const publicUrl = process.env.COMPANION_PUBLIC_URL
    const clientId = provider === 'fitbit' ? process.env.FITBIT_CLIENT_ID : process.env.WITHINGS_CLIENT_ID
    if (!stateSecret || !publicUrl || !clientId)
      return { statusCode: 500, body: JSON.stringify({ error: `${provider} sync not configured` }) }

    // Resolve the patient from their Supabase session.
    const auth = event.headers.authorization || event.headers.Authorization || ''
    const jwt = auth.replace(/^Bearer\s+/i, '')
    if (!jwt) return { statusCode: 401, body: JSON.stringify({ error: 'not signed in' }) }

    const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: userRes, error: userErr } = await admin.auth.getUser(jwt)
    if (userErr || !userRes?.user) return { statusCode: 401, body: JSON.stringify({ error: 'invalid session' }) }

    const { data: acct } = await admin.schema('cr').from('patient_account')
      .select('patient_id').eq('auth_user_id', userRes.user.id).maybeSingle()
    if (!acct?.patient_id) return { statusCode: 403, body: JSON.stringify({ error: 'no linked patient' }) }

    // Signed, time-boxed state: patientId.provider.exp.sig
    const exp = Date.now() + 10 * 60 * 1000 // 10 min
    const body = `${acct.patient_id}.${provider}.${exp}`
    const state = `${body}.${sign(stateSecret, body)}`

    const redirectUri = `${publicUrl.replace(/\/$/, '')}/api/companion-oauth-callback`
    const url = authorizeUrl(provider, clientId, redirectUri, state)
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ authorizeUrl: url }) }
  } catch (e: any) {
    return { statusCode: 500, body: JSON.stringify({ error: e?.message || 'error' }) }
  }
}
