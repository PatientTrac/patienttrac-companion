// companion-pair.ts — mobile device pairing
// POST /api/companion-pair
//
// Unauthenticated route. Validated by possession of a valid pairing code.
// Rate limited by IP hash. Returns generic errors regardless of failure reason
// so the API does not reveal whether a code exists (amendment 4).
//
// Security: raw pairing code is NOT logged. Raw tokens returned once.

import { createClient } from '@supabase/supabase-js'
import {
  hashPairingCode, generateTokenPair, writeAuditEvent,
  checkPairingRateLimit, recordPairingAttempt,
  jsonOk, jsonErr, CORS_HEADERS,
} from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// Generic error used for ALL pairing failures — does not hint at existence of code
const PAIRING_INVALID = 'This pairing code is invalid or has expired. Please request a new invite from your care team.'

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body: string | null }) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
  if (event.httpMethod !== 'POST') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()

  // ── Rate limiting (amendment 4) ─────────────────────────────────────────────
  const { allowed, ipHash, uaHash } = await checkPairingRateLimit(event.headers, admin)
  if (!allowed) {
    // Do not reveal rate limiting — return same generic error
    return jsonErr(400, 'PAIRING_CODE_INVALID', PAIRING_INVALID)
  }

  let body: Record<string, unknown>
  try { body = event.body ? JSON.parse(event.body) : {} }
  catch { return jsonErr(400, 'INVALID_REQUEST', 'Invalid JSON body') }

  const { pairingCode, platform, appVersion, deviceName, deviceIdHash } = body as {
    pairingCode?: string; platform?: string; appVersion?: string
    deviceName?: string; deviceIdHash?: string
  }

  if (!pairingCode || typeof pairingCode !== 'string') {
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(400, 'PAIRING_CODE_INVALID', PAIRING_INVALID)
  }

  // ── Hash and lookup — timing-safe via index lookup only ───────────────────
  let codeHash: string
  try { codeHash = hashPairingCode(pairingCode) }
  catch {
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(400, 'PAIRING_CODE_INVALID', PAIRING_INVALID)
  }

  const { data: invite } = await admin.schema('cr').from('companion_mobile_invite')
    .select('id, tenant_id, patient_external_id, status, expires_at, max_redemptions, redemption_count')
    .eq('code_hash', codeHash)
    .maybeSingle()

  if (!invite) {
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(400, 'PAIRING_CODE_INVALID', PAIRING_INVALID)
  }

  // Expire stale active invites silently
  if (invite.status === 'active' && new Date(invite.expires_at as string) <= new Date()) {
    await admin.schema('cr').from('companion_mobile_invite')
      .update({ status: 'expired' }).eq('id', invite.id)
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(400, 'PAIRING_CODE_INVALID', PAIRING_INVALID)
  }

  if (invite.status !== 'active' || (invite.redemption_count as number) >= (invite.max_redemptions as number)) {
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(400, 'PAIRING_CODE_INVALID', PAIRING_INVALID)
  }

  // ── Tenant config check ───────────────────────────────────────────────────
  const { data: config } = await admin.schema('cr').from('companion_mobile_tenant_config')
    .select('enabled, client_display_name, allowed_vital_types, default_backfill_days, privacy_notice_url, terms_url')
    .eq('tenant_id', invite.tenant_id)
    .maybeSingle()

  if (!config?.enabled) {
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(403, 'MOBILE_SYNC_DISABLED', 'Mobile sync is not enabled for this clinic. Please contact your care team.')
  }

  // ── Create session with hashed tokens (amendment 1: separate secret) ──────
  const { accessToken, accessHash, refreshToken, refreshHash } = generateTokenPair()
  const now = new Date()
  const accessTtl = parseInt(process.env.MOBILE_ACCESS_TOKEN_TTL_SECONDS || '86400', 10)
  const refreshTtl = parseInt(process.env.MOBILE_REFRESH_TOKEN_TTL_SECONDS || '2592000', 10)
  const accessExpiresAt  = new Date(now.getTime() + accessTtl  * 1000).toISOString()
  const refreshExpiresAt = new Date(now.getTime() + refreshTtl * 1000).toISOString()

  const safeplatform = ['ios', 'android'].includes((platform || '') as string) ? platform : 'unknown'
  const allowedTypes: string[] = (config.allowed_vital_types as string[]) || []

  const { data: session, error: sessErr } = await admin.schema('cr').from('companion_mobile_session')
    .insert({
      tenant_id: invite.tenant_id,
      patient_external_id: invite.patient_external_id,
      platform: safeplatform,
      app_version: appVersion || null,
      device_name: deviceName || null,
      device_id_hash: deviceIdHash || null,
      access_token_hash: accessHash,
      refresh_token_hash: refreshHash,
      access_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      allowed_vital_types: allowedTypes,
    })
    .select('id')
    .single()

  if (sessErr || !session) {
    console.error('[companion-pair] session insert:', sessErr?.message)
    await recordPairingAttempt(admin, ipHash, uaHash, false)
    return jsonErr(500, 'INTERNAL_ERROR', 'Pairing failed. Please try again.')
  }

  // ── Update invite redemption count ────────────────────────────────────────
  const newCount = (invite.redemption_count as number) + 1
  const newStatus = newCount >= (invite.max_redemptions as number) ? 'redeemed' : 'active'
  await admin.schema('cr').from('companion_mobile_invite').update({
    redemption_count: newCount,
    status: newStatus,
    redeemed_at: now.toISOString(),
    redeemed_session_id: session.id,
  }).eq('id', invite.id)

  // ── Audit ─────────────────────────────────────────────────────────────────
  await writeAuditEvent(admin, {
    tenantId: invite.tenant_id as string,
    patientExternalId: invite.patient_external_id as string,
    actorType: 'mobile_session', actorId: session.id,
    eventType: 'invite_redeemed',
    eventPayload: { inviteId: invite.id, platform: safeplatform, appVersion: appVersion || null },
  })
  await writeAuditEvent(admin, {
    tenantId: invite.tenant_id as string,
    patientExternalId: invite.patient_external_id as string,
    actorType: 'mobile_session', actorId: session.id,
    eventType: 'session_created',
    eventPayload: { platform: safeplatform, appVersion: appVersion || null, deviceName: deviceName || null },
  })

  await recordPairingAttempt(admin, ipHash, uaHash, true)

  // Both camelCase and snake_case provided so iOS apps using either naming convention
  // can parse the response without needing a mapping layer.
  return jsonOk({
    tenantId:           invite.tenant_id,
    tenant_id:          invite.tenant_id,
    tenantSlug:         invite.tenant_id,
    clientDisplayName:  config.client_display_name,
    client_display_name: config.client_display_name,
    patientExternalId:  invite.patient_external_id,
    patient_external_id: invite.patient_external_id,
    accessToken,
    access_token:       accessToken,
    refreshToken,
    refresh_token:      refreshToken,
    accessExpiresAt,
    access_expires_at:  accessExpiresAt,
    refreshExpiresAt,
    refresh_expires_at: refreshExpiresAt,
    ingestionEndpoint:  process.env.MOBILE_INGESTION_PUBLIC_URL || '/api/companion-ingest',
    ingestion_endpoint: process.env.MOBILE_INGESTION_PUBLIC_URL || '/api/companion-ingest',
    allowedVitalTypes:  allowedTypes,
    allowed_vital_types: allowedTypes,
    defaultBackfillDays: config.default_backfill_days ?? 30,
    default_backfill_days: config.default_backfill_days ?? 30,
    privacyNoticeUrl:   config.privacy_notice_url ?? null,
    privacy_notice_url: config.privacy_notice_url ?? null,
    termsUrl:           config.terms_url ?? null,
    terms_url:          config.terms_url ?? null,
  })
}
