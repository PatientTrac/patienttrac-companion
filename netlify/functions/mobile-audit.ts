// mobile-audit.ts — admin audit log
// GET /api/mobile-audit?patientExternalId=&eventType=&from=&to=&limit=&cursor=

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

  let query = admin.schema('cr').from('companion_mobile_audit_event')
    .select('id, tenant_id, patient_external_id, actor_id, actor_type, event_type, event_payload, created_at', { count: 'exact' })
    .eq('tenant_id', staff.orgId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q.patientExternalId) query = query.eq('patient_external_id', q.patientExternalId)
  if (q.eventType) query = query.eq('event_type', q.eventType)
  if (q.actorId) query = query.eq('actor_id', q.actorId)
  if (q.from) query = query.gte('created_at', q.from)
  if (q.to) query = query.lte('created_at', q.to)

  const { data, count, error } = await query
  if (error) { console.error('[mobile-audit]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to load audit log') }

  const nextOffset = offset + limit
  return jsonOk({
    items: (data || []).map(r => ({
      id: r.id, tenantId: r.tenant_id, patientExternalId: r.patient_external_id,
      actorId: r.actor_id, actorType: r.actor_type,
      eventType: r.event_type, eventPayload: r.event_payload, createdAt: r.created_at,
    })),
    nextCursor: (count != null && nextOffset < count) ? encodeCursor(nextOffset) : null,
  })
}
