// mobile-sync-monitor.ts — sync monitor feed
// GET /api/mobile-sync-monitor?status=&platform=&patientExternalId=&from=&to=&limit=&cursor=
//
// Returns one row per active session with sync/batch status summary.

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

  // Base sessions query
  let sessionQuery = admin.schema('cr').from('companion_mobile_session')
    .select('id, tenant_id, patient_external_id, platform, app_version, last_seen_at, last_sync_at, revoked_at, allowed_vital_types', { count: 'exact' })
    .eq('tenant_id', staff.orgId)
    .order('last_sync_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (q.patientExternalId) sessionQuery = sessionQuery.eq('patient_external_id', q.patientExternalId)
  if (q.platform) sessionQuery = sessionQuery.eq('platform', q.platform)
  if (q.from) sessionQuery = sessionQuery.gte('last_sync_at', q.from)
  if (q.to) sessionQuery = sessionQuery.lte('last_sync_at', q.to)
  if (q.activeOnly === 'true') sessionQuery = sessionQuery.is('revoked_at', null)
  if (q.noSyncIn7d === 'true') {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    sessionQuery = sessionQuery.or(`last_sync_at.is.null,last_sync_at.lt.${cutoff}`)
  }

  const { data: sessions, count, error: sessErr } = await sessionQuery
  if (sessErr) { console.error('[mobile-sync-monitor]', sessErr.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to load monitor') }

  if (!sessions?.length) return jsonOk({ items: [], nextCursor: null })

  // Fetch latest batch per session
  const sessionIds = sessions.map(s => s.id)
  const { data: batches } = await admin.schema('cr').from('companion_mobile_sync_batch')
    .select('session_id, status, error_code, error_message, received_at, completed_at')
    .in('session_id', sessionIds)
    .order('received_at', { ascending: false })

  const latestBatch: Record<string, any> = {}
  for (const b of batches || []) {
    if (!latestBatch[b.session_id]) latestBatch[b.session_id] = b
  }

  const nextOffset = offset + limit
  const items = sessions.map(s => {
    const batch = latestBatch[s.id]
    return {
      sessionId: s.id,
      patientExternalId: s.patient_external_id,
      tenantId: s.tenant_id,
      platform: s.platform,
      pairedStatus: s.revoked_at ? 'revoked' : 'paired',
      appVersion: s.app_version,
      lastSeenAt: s.last_seen_at,
      lastSyncAt: s.last_sync_at,
      lastVitalReceivedAt: batch?.completed_at ?? null,
      lastBatchStatus: batch?.status ?? null,
      lastErrorCode: batch?.error_code ?? null,
      lastErrorMessage: batch?.error_message ?? null,
      grantedPermissions: s.allowed_vital_types ?? [],
    }
  })

  return jsonOk({
    items,
    nextCursor: (count != null && nextOffset < count) ? encodeCursor(nextOffset) : null,
  })
}
