// mobile-stats.ts — dashboard overview stats
// GET /api/mobile-stats

import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, jsonOk, jsonErr, type NetlifyEvent } from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== 'GET') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  const tenantId = staff.orgId
  const h24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const d7  = new Date(Date.now() - 7  * 24 * 3600 * 1000).toISOString()

  const [configRes, pendingInvRes, activeInvRes, activeSessionRes, failedBatchRes, noSyncRes] = await Promise.all([
    admin.schema('cr').from('companion_mobile_tenant_config')
      .select('enabled, client_display_name').eq('tenant_id', tenantId).maybeSingle(),

    admin.schema('cr').from('companion_mobile_invite')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),

    admin.schema('cr').from('companion_mobile_invite')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('status', 'active'),

    admin.schema('cr').from('companion_mobile_session')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).is('revoked_at', null),

    admin.schema('cr').from('companion_mobile_sync_batch')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      .in('status', ['failed', 'partial_failure']).gte('received_at', h24),

    admin.schema('cr').from('companion_mobile_session')
      .select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
      .is('revoked_at', null)
      .or(`last_sync_at.is.null,last_sync_at.lt.${d7}`),
  ])

  return jsonOk({
    enabled: configRes.data?.enabled ?? false,
    clientDisplayName: configRes.data?.client_display_name ?? '',
    pendingInvites: pendingInvRes.count ?? 0,
    activeSessions: activeSessionRes.count ?? 0,
    failedBatches24h: failedBatchRes.count ?? 0,
    noSyncIn7d: noSyncRes.count ?? 0,
  })
}
