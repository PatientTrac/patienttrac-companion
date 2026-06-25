// companion-refresh.ts — mobile token refresh (amendment 1)
// POST /api/companion-refresh
//
// Rotates the refresh token on every use (refresh token rotation).
// A reused refresh token is rejected — the old hash no longer matches,
// which detects concurrent refresh attempts (possible token theft).
// Does NOT require the current access token — only the refresh token.
//
// Security: no raw tokens are logged anywhere in this function.

import { createClient } from '@supabase/supabase-js'
import {
  hashToken, generateTokenPair, writeAuditEvent,
  jsonOk, jsonErr, CORS_HEADERS,
} from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body: string | null }) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  let body: Record<string, unknown>
  try { body = event.body ? JSON.parse(event.body) : {} }
  catch { return jsonErr(400, 'INVALID_REQUEST', 'Invalid JSON body') }

  const { refreshToken } = body
  if (!refreshToken || typeof refreshToken !== 'string') {
    return jsonErr(401, 'MOBILE_TOKEN_INVALID', 'refreshToken is required')
  }

  const admin = getAdmin()
  let refreshHash: string
  try { refreshHash = hashToken(refreshToken) }
  catch {
    return jsonErr(500, 'INTERNAL_ERROR', 'Token hashing failed')
  }

  const now = new Date()

  const { data: session } = await admin.schema('cr').from('companion_mobile_session')
    .select('id, tenant_id, patient_external_id, revoked_at, refresh_expires_at, refresh_token_hash')
    .eq('refresh_token_hash', refreshHash)
    .maybeSingle()

  // Generic error — does not hint at whether the token exists
  const invalid = () => jsonErr(401, 'MOBILE_TOKEN_INVALID', 'Invalid or expired refresh token. Please re-pair your device.')

  if (!session)                                                         return invalid()
  if (session.revoked_at)                                               return invalid()
  if (session.refresh_expires_at && new Date(session.refresh_expires_at as string) <= now) return invalid()

  // ── Generate new token pair (amendment 1: rotates both tokens) ────────────
  const accessTtl  = parseInt(process.env.MOBILE_ACCESS_TOKEN_TTL_SECONDS  || '86400',  10)
  const refreshTtl = parseInt(process.env.MOBILE_REFRESH_TOKEN_TTL_SECONDS || '2592000', 10)

  const { accessToken: newAccess, accessHash: newAccessHash, refreshToken: newRefresh, refreshHash: newRefreshHash } = generateTokenPair()
  const accessExpiresAt  = new Date(now.getTime() + accessTtl  * 1000).toISOString()
  const refreshExpiresAt = new Date(now.getTime() + refreshTtl * 1000).toISOString()

  // Update atomically: filter on both id AND the old refresh hash.
  // If a concurrent refresh already rotated this token, the WHERE clause
  // won't match and we return 0 rows — treated as an invalid/reused token.
  const { data: updated, error: updateErr } = await admin.schema('cr').from('companion_mobile_session')
    .update({
      access_token_hash:  newAccessHash,
      refresh_token_hash: newRefreshHash,
      access_expires_at:  accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      last_seen_at: now.toISOString(),
    })
    .eq('id', session.id)
    .eq('refresh_token_hash', refreshHash)  // optimistic lock: reject concurrent reuse
    .select('id')

  if (updateErr || !updated?.length) {
    // Token was already rotated by a concurrent request (possible theft)
    console.warn('[companion-refresh] concurrent refresh detected for session', session.id)
    return invalid()
  }

  await writeAuditEvent(admin, {
    tenantId: session.tenant_id as string,
    patientExternalId: session.patient_external_id as string,
    actorType: 'mobile_session', actorId: session.id as string,
    eventType: 'session_token_refreshed',
    eventPayload: {},  // intentionally empty — no token data in audit
  })

  return jsonOk({ accessToken: newAccess, refreshToken: newRefresh, accessExpiresAt, refreshExpiresAt })
}
