// mobile-sessions.ts — list paired mobile sessions
// GET /api/mobile-sessions?patientExternalId=&platform=&activeOnly=&limit=&cursor=

import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, decodeCursor, encodeCursor, jsonOk, jsonErr, type NetlifyEvent } from './_mobile-helpers'

const PAGE_SIZE = 50
const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== 'GET') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  const q = event.queryStringParameters || {}
  const offset = decodeCursor(q.cursor as string | null)
  const limit = Math.min(parseInt(q.limit as string || String(PAGE_SIZE), 10), 200)

  let query = admin.schema('cr').from('companion_mobile_session')
    .select('id, tenant_id, patient_external_id, platform, app_version, device_name, paired_at, last_seen_at, last_sync_at, revoked_at, allowed_vital_types', { count: 'exact' })
    .eq('tenant_id', staff.orgId)
    .order('paired_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q.patientExternalId) query = query.eq('patient_external_id', q.patientExternalId)
  if (q.platform) query = query.eq('platform', q.platform)
  if (q.activeOnly === 'true') query = query.is('revoked_at', null)

  const { data, count, error } = await query
  if (error) { console.error('[mobile-sessions]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to list sessions') }

  const nextOffset = offset + limit
  const items = (data || []).map(r => ({
    sessionId: r.id,
    tenantId: r.tenant_id,
    patientExternalId: r.patient_external_id,
    platform: r.platform,
    appVersion: r.app_version,
    deviceName: r.device_name,
    pairedAt: r.paired_at,
    lastSeenAt: r.last_seen_at,
    lastSyncAt: r.last_sync_at,
    revokedAt: r.revoked_at,
    allowedVitalTypes: r.allowed_vital_types,
    status: r.revoked_at ? 'revoked' : 'active',
  }))

  return jsonOk({
    items,
    nextCursor: (count != null && nextOffset < count) ? encodeCursor(nextOffset) : null,
  })
}
