// mobile-invites.ts — patient invite management
// GET  /api/mobile-invites  → list invites (filtered, paginated)
// POST /api/mobile-invites  → generate a new invite
//
// The raw pairing code is returned ONCE in the POST response and never again.
// All subsequent reads (GET list) show only code_last4.

import { createClient } from '@supabase/supabase-js'
import {
  verifyStaffJwt, generatePairingCode, writeAuditEvent,
  decodeCursor, encodeCursor, jsonOk, jsonErr,
  type NetlifyEvent,
} from './_mobile-helpers'

const PAGE_SIZE = 50
const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (!['GET', 'POST'].includes(event.httpMethod))
    return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  if (event.httpMethod === 'GET') {
    const q = event.queryStringParameters || {}
    const offset = decodeCursor(q.cursor as string | null)
    const limit = Math.min(parseInt(q.limit as string || String(PAGE_SIZE), 10), 200)

    let query = admin.schema('cr').from('companion_mobile_invite')
      .select('id, tenant_id, patient_external_id, code_last4, status, expires_at, max_redemptions, redemption_count, created_by, created_at, redeemed_at, revoked_at', { count: 'exact' })
      .eq('tenant_id', staff.orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (q.patientExternalId) query = query.eq('patient_external_id', q.patientExternalId)
    if (q.status) query = query.eq('status', q.status)

    const { data, count, error } = await query
    if (error) { console.error('[mobile-invites GET]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to list invites') }

    const nextOffset = offset + limit
    const items = (data || []).map(row => ({
      inviteId: row.id,
      tenantId: row.tenant_id,
      patientExternalId: row.patient_external_id,
      codeLast4: row.code_last4,
      status: row.status,
      expiresAt: row.expires_at,
      maxRedemptions: row.max_redemptions,
      redemptionCount: row.redemption_count,
      createdBy: row.created_by,
      createdAt: row.created_at,
      redeemedAt: row.redeemed_at,
      revokedAt: row.revoked_at,
    }))

    return jsonOk({
      items,
      nextCursor: (count != null && nextOffset < count) ? encodeCursor(nextOffset) : null,
    })
  }

  // POST — generate invite
  let body: Record<string, unknown>
  try { body = event.body ? JSON.parse(event.body) : {} }
  catch { return jsonErr(400, 'INVALID_REQUEST', 'Invalid JSON') }

  const { patientExternalId, expirationHours, maxRedemptions } = body as {
    patientExternalId?: string; expirationHours?: number; maxRedemptions?: number
  }
  if (!patientExternalId) return jsonErr(400, 'INVALID_REQUEST', 'patientExternalId is required')

  // Load tenant config for default expiration
  const { data: config } = await admin.schema('cr').from('companion_mobile_tenant_config')
    .select('enabled, invite_expiration_hours').eq('tenant_id', staff.orgId).maybeSingle()

  if (!config?.enabled) return jsonErr(403, 'MOBILE_SYNC_DISABLED', 'Companion Mobile is not enabled for this clinic')

  const expHours = typeof expirationHours === 'number' && expirationHours >= 1 && expirationHours <= 720
    ? expirationHours
    : (config.invite_expiration_hours as number) || 168

  const maxR = typeof maxRedemptions === 'number' && maxRedemptions >= 1 ? maxRedemptions : 1
  const expiresAt = new Date(Date.now() + expHours * 3600 * 1000).toISOString()

  const { raw, hash, last4 } = generatePairingCode()

  const { data: invite, error: invErr } = await admin.schema('cr').from('companion_mobile_invite')
    .insert({
      tenant_id: staff.orgId,
      patient_external_id: String(patientExternalId),
      code_hash: hash,
      code_last4: last4,
      status: 'active',
      expires_at: expiresAt,
      max_redemptions: maxR,
      created_by: staff.userId,
    })
    .select('id, expires_at, status')
    .single()

  if (invErr || !invite) {
    console.error('[mobile-invites POST]', invErr?.message)
    return jsonErr(500, 'INTERNAL_ERROR', 'Failed to create invite')
  }

  const baseUrl = (process.env.MOBILE_PAIRING_BASE_URL || 'https://mobile.patienttrac.com/pair').replace(/\/$/, '')
  const pairUrl = `${baseUrl}/${raw}`

  await writeAuditEvent(admin, {
    tenantId: staff.orgId,
    patientExternalId: String(patientExternalId),
    actorId: staff.userId, actorType: 'user',
    eventType: 'invite_created',
    eventPayload: { inviteId: invite.id, expirationHours: expHours, maxRedemptions: maxR },
  })

  // pairingCode is returned ONCE here and never again in any list/detail endpoint
  return jsonOk({
    inviteId: invite.id,
    pairingCode: raw,
    pairUrl,
    qrPayload: pairUrl,
    expiresAt: invite.expires_at,
    status: invite.status,
  }, 201)
}
