// mobile-config.ts — tenant mobile configuration
// GET  /api/mobile-config        → read current config (creates default if none)
// PATCH /api/mobile-config       → update config
//
// RBAC:
//   Any staff member can read.
//   Any staff member can write client-facing fields.
//   Only platform admins (role: super_admin | platform_admin) can toggle 'enabled'.

import { createClient } from '@supabase/supabase-js'
import {
  verifyStaffJwt, writeAuditEvent, jsonOk, jsonErr, VITAL_CATALOG_KEYS,
  type NetlifyEvent,
} from './_mobile-helpers'

const PLATFORM_ADMIN_ROLES = ['super_admin', 'platform_admin']

const getAdmin = () => createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export const handler = async (event: NetlifyEvent) => {
  if (!['GET', 'PATCH'].includes(event.httpMethod))
    return jsonErr(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')

  const admin = getAdmin()
  const staff = await verifyStaffJwt(event.headers, admin)
  if (!staff) return jsonErr(401, 'UNAUTHORIZED', 'Authentication required')

  if (event.httpMethod === 'GET') {
    const { data, error } = await admin.schema('cr').from('companion_mobile_tenant_config')
      .select('*')
      .eq('tenant_id', staff.orgId)
      .maybeSingle()

    if (error) {
      console.error('[mobile-config GET]', error.message)
      return jsonErr(500, 'INTERNAL_ERROR', 'Failed to load config')
    }

    if (!data) {
      // Return a sensible empty config rather than 404
      return jsonOk({
        tenantId: staff.orgId, enabled: false, clientDisplayName: '',
        allowedVitalTypes: [], defaultBackfillDays: 30, inviteExpirationHours: 168,
        supportPhone: null, supportEmail: null, privacyNoticeUrl: null, termsUrl: null,
      })
    }

    return jsonOk(toPublic(data))
  }

  // PATCH
  let body: Record<string, unknown>
  try { body = event.body ? JSON.parse(event.body) : {} }
  catch { return jsonErr(400, 'INVALID_REQUEST', 'Invalid JSON') }

  // Validate
  if ('allowedVitalTypes' in body) {
    const types = body.allowedVitalTypes
    if (!Array.isArray(types) || types.some(t => !VITAL_CATALOG_KEYS.includes(t as string)))
      return jsonErr(400, 'INVALID_VITAL_TYPES', 'allowedVitalTypes contains unknown vital type keys')
  }
  if ('defaultBackfillDays' in body) {
    const d = body.defaultBackfillDays as number
    if (typeof d !== 'number' || d < 0 || d > 365)
      return jsonErr(400, 'INVALID_VALUE', 'defaultBackfillDays must be 0–365')
  }
  if ('inviteExpirationHours' in body) {
    const h = body.inviteExpirationHours as number
    if (typeof h !== 'number' || h < 1 || h > 720)
      return jsonErr(400, 'INVALID_VALUE', 'inviteExpirationHours must be 1–720')
  }

  // Only platform admins can toggle enabled
  if ('enabled' in body && !PLATFORM_ADMIN_ROLES.includes(staff.orgRole)) {
    return jsonErr(403, 'FORBIDDEN', 'Only platform admins can enable or disable Companion Mobile')
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const allowed = [
    'enabled', 'clientDisplayName', 'allowedVitalTypes', 'defaultBackfillDays',
    'inviteExpirationHours', 'supportPhone', 'supportEmail', 'privacyNoticeUrl', 'termsUrl',
  ]
  for (const key of allowed) {
    if (key in body) patch[toSnake(key)] = body[key]
  }

  const { data: existing } = await admin.schema('cr').from('companion_mobile_tenant_config')
    .select('id').eq('tenant_id', staff.orgId).maybeSingle()

  let result: any
  if (!existing) {
    const clientDisplayName = String(body.clientDisplayName ?? '').trim()
    if (!clientDisplayName) {
      return jsonErr(400, 'INVALID_REQUEST', 'clientDisplayName is required when creating config')
    }
    const { data, error } = await admin.schema('cr').from('companion_mobile_tenant_config')
      .insert({ tenant_id: staff.orgId, ...patch })
      .select('*').single()
    if (error) { console.error('[mobile-config PATCH insert]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to save config') }
    result = data
  } else {
    const { data, error } = await admin.schema('cr').from('companion_mobile_tenant_config')
      .update(patch).eq('tenant_id', staff.orgId).select('*').single()
    if (error) { console.error('[mobile-config PATCH update]', error.message); return jsonErr(500, 'INTERNAL_ERROR', 'Failed to save config') }
    result = data
  }

  const eventType = existing ? 'mobile_config_updated' : 'mobile_config_created'
  await writeAuditEvent(admin, {
    tenantId: staff.orgId, actorId: staff.userId, actorType: 'user',
    eventType, eventPayload: { fields: Object.keys(patch).filter(k => k !== 'updated_at') },
  })

  return jsonOk(toPublic(result))
}

function toPublic(row: Record<string, unknown>) {
  return {
    tenantId: row.tenant_id,
    enabled: row.enabled,
    clientDisplayName: row.client_display_name,
    allowedVitalTypes: row.allowed_vital_types,
    defaultBackfillDays: row.default_backfill_days,
    inviteExpirationHours: row.invite_expiration_hours,
    supportPhone: row.support_phone ?? null,
    supportEmail: row.support_email ?? null,
    privacyNoticeUrl: row.privacy_notice_url ?? null,
    termsUrl: row.terms_url ?? null,
  }
}

function toSnake(camel: string): string {
  return camel.replace(/[A-Z]/g, c => `_${c.toLowerCase()}`)
}
