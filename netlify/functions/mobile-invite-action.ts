// mobile-invite-action.ts — invite lifecycle actions
// POST /api/mobile-invite-action?action=revoke&inviteId=<uuid>

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
  const inviteId = q.inviteId as string | null

  if (action !== 'revoke') return jsonErr(400, 'INVALID_REQUEST', 'action=revoke is required')
  if (!inviteId) return jsonErr(400, 'INVALID_REQUEST', 'inviteId is required')

  const { data: invite } = await admin.schema('cr').from('companion_mobile_invite')
    .select('id, tenant_id, patient_external_id, status')
    .eq('id', inviteId)
    .eq('tenant_id', staff.orgId)
    .maybeSingle()

  if (!invite) return jsonErr(404, 'NOT_FOUND', 'Invite not found')
  if (invite.status === 'revoked') return jsonOk({ inviteId, status: 'revoked' })
  if (invite.status === 'redeemed') return jsonErr(409, 'ALREADY_REDEEMED', 'Cannot revoke a redeemed invite')

  const { error } = await admin.schema('cr').from('companion_mobile_invite')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: staff.userId })
    .eq('id', inviteId)

  if (error) { console.error('[mobile-invite-action revoke]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to revoke invite') }

  await writeAuditEvent(admin, {
    tenantId: invite.tenant_id as string,
    patientExternalId: invite.patient_external_id as string,
    actorId: staff.userId, actorType: 'user',
    eventType: 'invite_revoked',
    eventPayload: { inviteId },
  })

  return jsonOk({ inviteId, status: 'revoked' })
}
