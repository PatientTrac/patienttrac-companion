// mobile-session-action.ts — session lifecycle actions
// POST /api/mobile-session-action?action=revoke&sessionId=<uuid>

import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, writeAuditEvent, jsonOk, jsonErr, type NetlifyEvent } from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== 'POST') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  const q = event.queryStringParameters || {}
  const action = q.action as string | null
  const sessionId = q.sessionId as string | null

  if (action !== 'revoke') return jsonErr(400, 'INVALID_REQUEST', 'action=revoke is required')
  if (!sessionId) return jsonErr(400, 'INVALID_REQUEST', 'sessionId is required')

  const { data: session } = await admin.schema('cr').from('companion_mobile_session')
    .select('id, tenant_id, patient_external_id, revoked_at')
    .eq('id', sessionId)
    .eq('tenant_id', staff.orgId)
    .maybeSingle()

  if (!session) return jsonErr(404, 'NOT_FOUND', 'Session not found')

  const revokedAt = new Date().toISOString()
  if (!session.revoked_at) {
    const { error } = await admin.schema('cr').from('companion_mobile_session')
      .update({ revoked_at: revokedAt, revoked_by: staff.userId })
      .eq('id', sessionId)

    if (error) { console.error('[mobile-session-action revoke]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to revoke session') }

    await writeAuditEvent(admin, {
      tenantId: session.tenant_id as string,
      patientExternalId: session.patient_external_id as string,
      actorId: staff.userId, actorType: 'user',
      eventType: 'session_revoked',
      eventPayload: { sessionId },
    })
  }

  return jsonOk({ sessionId, revoked: true, revokedAt: session.revoked_at || revokedAt })
}
