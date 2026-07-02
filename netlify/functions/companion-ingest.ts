// companion-ingest.ts — mobile vitals ingestion
// POST /api/companion-ingest
// Authorization: Bearer <mobile access token>
// Idempotency-Key: <batch uuid>
// X-Canonical-Path: cr.companion_vital  (optional but validated when present)
//
// Tenant and patient are resolved from the mobile session — NEVER from body fields.
// Writes through cr.companion_vital using the EXACT same columns as the existing
// Fitbit/Withings sync (companion-sync.ts): patient_id, org_id, type, value, unit,
// recorded_at, source, is_medical_grade.

import { createClient } from '@supabase/supabase-js'
import {
  verifyMobileToken, writeAuditEvent, jsonOk, jsonErr,
  CORS_HEADERS, VITAL_CATALOG_KEYS,
} from './_mobile-helpers'

const CANONICAL_PATH = 'cr.companion_vital'
const MAX_OBSERVATIONS = 1000

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: { httpMethod: string; headers: Record<string, string>; body: string | null }) => {
  try {
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    if (event.httpMethod !== 'POST') return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

    const admin = getAdmin()

    // ── Auth ──────────────────────────────────────────────────────────────────
    const sessionCtx = await verifyMobileToken(event.headers, admin)
    if (!sessionCtx) return jsonErr(401, 'MOBILE_TOKEN_INVALID', 'Authentication required. Pair your device to obtain a token.')

    // ── Canonical path (optional header; reject if supplied and wrong) ────────
    const suppliedPath = event.headers['x-canonical-path'] || event.headers['X-Canonical-Path']
    if (suppliedPath && suppliedPath !== CANONICAL_PATH) {
      return jsonErr(400, 'CANONICAL_PATH_INVALID', `Invalid canonical path. Use X-Canonical-Path: ${CANONICAL_PATH}`)
    }

    // ── Idempotency ───────────────────────────────────────────────────────────
    // REQUIRED: mobile clients retry on flaky networks; without a stable key,
    // retries would insert duplicate clinical rows. (Aligned with the test
    // contract — previously the handler silently auto-generated a key.)
    const idempotencyKey = (event.headers['idempotency-key'] || event.headers['Idempotency-Key'] || '').trim()
    if (!idempotencyKey) return jsonErr(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required')

    const { data: existing } = await admin.schema('cr').from('companion_mobile_sync_batch')
      .select('id, status')
      .eq('tenant_id', sessionCtx.tenantId)
      .eq('session_id', sessionCtx.sessionId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existing) return jsonOk({ status: 'duplicate', batchId: existing.id, canonicalPath: CANONICAL_PATH })

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>
    try { body = event.body ? JSON.parse(event.body) : {} }
    catch { return jsonErr(400, 'INVALID_REQUEST', 'Invalid JSON body') }

    const observations = (body.observations || []) as unknown[]
    if (!Array.isArray(observations)) return jsonErr(400, 'INVALID_REQUEST', 'observations must be an array')
    if (observations.length === 0) return jsonOk({ status: 'processed', accepted: 0, rejected: 0, batchId: null, canonicalPath: CANONICAL_PATH })
    if (observations.length > MAX_OBSERVATIONS) return jsonErr(400, 'INVALID_REQUEST', `Maximum ${MAX_OBSERVATIONS} observations per batch`)

    // ── Resolve patient from session (never from body) ────────────────────────
    const patientId = parseInt(sessionCtx.patientExternalId, 10)
    const orgId = sessionCtx.tenantId  // stored as org_id UUID in text form

    if (isNaN(patientId)) {
      console.error('[companion-ingest] invalid patient_external_id in session:', sessionCtx.patientExternalId)
      return jsonErr(500, 'INTERNAL_ERROR', 'Session has invalid patient reference')
    }

    // ── Load allowed vital types from session ──────────────────────────────────
    const { data: sessionRow } = await admin.schema('cr').from('companion_mobile_session')
      .select('allowed_vital_types, platform').eq('id', sessionCtx.sessionId).maybeSingle()

    // An empty array [] is truthy in JS — use length check so an empty
    // allowed_vital_types falls back to the full catalog rather than rejecting everything.
    const rawTypes = sessionRow?.allowed_vital_types as string[] | null
    const allowedTypes: string[] = (Array.isArray(rawTypes) && rawTypes.length > 0) ? rawTypes : VITAL_CATALOG_KEYS

    // ── Create sync batch (received) ──────────────────────────────────────────
    const { data: batch, error: batchErr } = await admin.schema('cr').from('companion_mobile_sync_batch')
      .insert({
        session_id: sessionCtx.sessionId,
        tenant_id: sessionCtx.tenantId,
        patient_external_id: sessionCtx.patientExternalId,
        platform: sessionRow?.platform || null,
        canonical_path: CANONICAL_PATH,
        idempotency_key: idempotencyKey,
        status: 'received',
        record_count: observations.length,
      })
      .select('id')
      .single()

    if (batchErr || !batch) {
      console.error('[companion-ingest] batch insert:', batchErr?.message)
      return jsonErr(500, 'INTERNAL_ERROR', 'Failed to record batch')
    }

    // ── Validate and map observations ─────────────────────────────────────────
    const accepted: {
      patient_id: number; org_id: string; type: string; value: number
      unit: string | null; recorded_at: string; source: string; is_medical_grade: boolean
    }[] = []
    const rejected: { idx: number; reason: string }[] = []

    for (let i = 0; i < observations.length; i++) {
      const obs = observations[i] as Record<string, unknown>
      if (!obs || typeof obs !== 'object') { rejected.push({ idx: i, reason: 'invalid_shape' }); continue }

      const { type, value, unit, observedAt } = obs
      if (!type || typeof type !== 'string')                              { rejected.push({ idx: i, reason: 'missing_type' }); continue }
      if (!allowedTypes.includes(type))                                   { rejected.push({ idx: i, reason: 'vital_type_not_allowed' }); continue }
      if (value === undefined || typeof value !== 'number' || isNaN(value as number)) { rejected.push({ idx: i, reason: 'invalid_value' }); continue }
      if (!observedAt || isNaN(Date.parse(observedAt as string)))         { rejected.push({ idx: i, reason: 'invalid_observed_at' }); continue }

      accepted.push({
        patient_id: patientId,
        org_id: orgId,
        type: type as string,
        value: value as number,
        unit: (unit as string | null | undefined) || null,
        recorded_at: new Date(observedAt as string).toISOString(),
        source: 'companion_mobile',
        is_medical_grade: false,   // mobile wearables are never medical-grade (matches Fitbit/Withings pattern)
      })
    }

    // ── Write to cr.companion_vital (same table, same columns as companion-sync.ts) ──
    let finalStatus = 'processed'
    if (accepted.length > 0) {
      const { error: insertErr } = await admin.schema('cr').from('companion_vital').insert(accepted)
      if (insertErr) {
        console.error('[companion-ingest] vital insert:', insertErr.message)
        await admin.schema('cr').from('companion_mobile_sync_batch').update({
          status: 'failed', error_code: 'INGESTION_FAILED',
          error_message: 'Failed to write vital records',
          completed_at: new Date().toISOString(),
        }).eq('id', batch.id)

        await writeAuditEvent(admin, {
          tenantId: sessionCtx.tenantId, patientExternalId: sessionCtx.patientExternalId,
          actorType: 'mobile_session', actorId: sessionCtx.sessionId,
          eventType: 'vital_batch_failed',
          eventPayload: { batchId: batch.id, errorCode: 'INGESTION_FAILED' },
        })
        return jsonErr(500, 'INGESTION_FAILED', 'Failed to write vital records')
      }
    }

    if (rejected.length > 0) finalStatus = accepted.length === 0 ? 'failed' : 'partial_failure'

    const completedAt = new Date().toISOString()
    await admin.schema('cr').from('companion_mobile_sync_batch').update({
      status: finalStatus,
      accepted_count: accepted.length,
      rejected_count: rejected.length,
      completed_at: completedAt,
    }).eq('id', batch.id)

    // ── Update session timestamps ──────────────────────────────────────────────
    await admin.schema('cr').from('companion_mobile_session').update({
      last_seen_at: completedAt,
      last_sync_at: completedAt,
    }).eq('id', sessionCtx.sessionId)

    // ── Audit ──────────────────────────────────────────────────────────────────
    const auditEvent = finalStatus === 'processed' || finalStatus === 'partial_failure'
      ? 'vital_batch_processed' : 'vital_batch_failed'
    await writeAuditEvent(admin, {
      tenantId: sessionCtx.tenantId, patientExternalId: sessionCtx.patientExternalId,
      actorType: 'mobile_session', actorId: sessionCtx.sessionId,
      eventType: auditEvent,
      eventPayload: { batchId: batch.id, accepted: accepted.length, rejected: rejected.length, canonicalPath: CANONICAL_PATH },
    })

    return jsonOk({
      status: finalStatus,
      batchId: batch.id,
      canonicalPath: CANONICAL_PATH,
      accepted: accepted.length,
      rejected: rejected.length,
      rejectedDetails: rejected.slice(0, 10),
    })
  } catch (err: unknown) {
    console.error('[companion-ingest] unhandled error:', err)
    return jsonErr(500, 'INTERNAL_ERROR', err instanceof Error ? err.message : 'Unexpected server error')
  }
}
