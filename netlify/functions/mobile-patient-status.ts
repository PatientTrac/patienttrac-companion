// mobile-patient-status.ts — full patient mobile status
// GET /api/mobile-patient-status?patientExternalId=<id>

import { createClient } from '@supabase/supabase-js'
import { verifyStaffJwt, jsonOk, jsonErr, type NetlifyEvent } from './_mobile-helpers'

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (event.httpMethod !== 'GET') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  const patientExternalId = event.queryStringParameters?.patientExternalId as string | null
  if (!patientExternalId) return jsonErr(400, 'INVALID_REQUEST', 'patientExternalId is required')

  const patientId = parseInt(patientExternalId, 10)
  const [invitesRes, sessionsRes, batchesRes, auditRes, vitalsRes] = await Promise.all([
    admin.schema('cr').from('companion_mobile_invite')
      .select('id, code_last4, status, expires_at, max_redemptions, redemption_count, created_at, redeemed_at, revoked_at')
      .eq('tenant_id', staff.orgId)
      .eq('patient_external_id', patientExternalId)
      .order('created_at', { ascending: false })
      .limit(10),

    admin.schema('cr').from('companion_mobile_session')
      .select('id, platform, app_version, device_name, paired_at, last_seen_at, last_sync_at, revoked_at, allowed_vital_types')
      .eq('tenant_id', staff.orgId)
      .eq('patient_external_id', patientExternalId)
      .order('paired_at', { ascending: false })
      .limit(10),

    admin.schema('cr').from('companion_mobile_sync_batch')
      .select('id, session_id, platform, status, record_count, accepted_count, rejected_count, error_code, received_at, completed_at')
      .eq('tenant_id', staff.orgId)
      .eq('patient_external_id', patientExternalId)
      .order('received_at', { ascending: false })
      .limit(20),

    admin.schema('cr').from('companion_mobile_audit_event')
      .select('id, actor_id, actor_type, event_type, event_payload, created_at')
      .eq('tenant_id', staff.orgId)
      .eq('patient_external_id', patientExternalId)
      .order('created_at', { ascending: false })
      .limit(30),

    // Recent vitals from canonical table — limited fields only (no PHI beyond what staff views normally)
    isNaN(patientId) ? Promise.resolve({ data: null }) :
    admin.schema('cr').from('companion_vital')
      .select('id, type, value, unit, source, recorded_at')
      .eq('patient_id', patientId)
      .eq('source', 'companion_mobile')
      .order('recorded_at', { ascending: false })
      .limit(20),
  ])

  return jsonOk({
    tenantId: staff.orgId,
    patientExternalId,
    invites: (invitesRes.data || []).map(r => ({
      inviteId: r.id, codeLast4: r.code_last4, status: r.status,
      expiresAt: r.expires_at, maxRedemptions: r.max_redemptions,
      redemptionCount: r.redemption_count, createdAt: r.created_at,
      redeemedAt: r.redeemed_at, revokedAt: r.revoked_at,
    })),
    sessions: (sessionsRes.data || []).map(r => ({
      sessionId: r.id, platform: r.platform, appVersion: r.app_version,
      deviceName: r.device_name, pairedAt: r.paired_at,
      lastSeenAt: r.last_seen_at, lastSyncAt: r.last_sync_at,
      revokedAt: r.revoked_at, allowedVitalTypes: r.allowed_vital_types,
      status: r.revoked_at ? 'revoked' : 'active',
    })),
    recentBatches: (batchesRes.data || []).map(r => ({
      batchId: r.id, sessionId: r.session_id, platform: r.platform,
      status: r.status, recordCount: r.record_count,
      acceptedCount: r.accepted_count, rejectedCount: r.rejected_count,
      errorCode: r.error_code, receivedAt: r.received_at, completedAt: r.completed_at,
    })),
    recentAuditEvents: (auditRes.data || []).map(r => ({
      id: r.id, actorId: r.actor_id, actorType: r.actor_type,
      eventType: r.event_type, eventPayload: r.event_payload, createdAt: r.created_at,
    })),
    recentVitals: (vitalsRes.data || []).map(r => ({
      id: r.id, type: r.type, value: r.value, unit: r.unit,
      source: r.source, recordedAt: r.recorded_at,
    })),
  })
}
