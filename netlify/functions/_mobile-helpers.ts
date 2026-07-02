// _mobile-helpers.ts — shared utilities for Companion Mobile Netlify functions
// Prefix _ prevents Netlify from treating this as a handler endpoint.
//
// Key separation (amendment 5):
//   MOBILE_PAIRING_CODE_SECRET  — hashes invite/pairing codes and IP addresses
//   MOBILE_TOKEN_HASH_SECRET    — hashes access and refresh tokens

import { createHmac, randomBytes } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constants ──────────────────────────────────────────────────────────────────

// 32-char alphabet: A-Z minus ambiguous I,L,O; digits 2-9 (removes 0,1)
// Exactly 5 bits per character — no modulo bias since 2^5 = 32 = alphabet size
const PAIRING_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

// Pairing rate limit: 10 failed attempts per 15 minutes per IP hash
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000
const RATE_LIMIT_MAX_FAILURES = 10

// ── Shared types ───────────────────────────────────────────────────────────────

export type StaffCtx = { userId: string; orgId: string; orgRole: string }
export type MobileSessionCtx = { sessionId: string; tenantId: string; patientExternalId: string }

export type NetlifyEvent = {
  httpMethod: string
  headers: Record<string, string>
  body: string | null
  queryStringParameters?: Record<string, string | null>
}

// ── CORS headers (mobile endpoints need these for native/web clients) ──────────

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': [
    'Content-Type', 'Authorization', 'Idempotency-Key',
    'X-Canonical-Path', 'X-PatientTrac-App', 'X-PatientTrac-Tenant',
  ].join(', '),
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
}

const JSON_HEADERS = { 'Content-Type': 'application/json', ...CORS_HEADERS }

// ── Response helpers ───────────────────────────────────────────────────────────

export function jsonOk(data: unknown, statusCode = 200) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify(data) }
}

export function jsonErr(statusCode: number, code: string, message: string) {
  return { statusCode, headers: JSON_HEADERS, body: JSON.stringify({ error: { code, message } }) }
}

// ── HMAC helper ────────────────────────────────────────────────────────────────

export function hmacHex(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex')
}

// ── Pairing code (amendment 3: 16-char, unbiased bit packing via rejection) ────
//
// Reads random bytes 5 bits at a time. The alphabet is 31 chars (I/L/O excluded
// for human legibility), so a 5-bit group (0–31) can land on 31, which has no
// character. Rather than fold it back in — which would bias char 0 — we REJECT
// value 31 and draw more bits until we have 16 valid chars. This keeps zero
// modulo bias while preserving the exact 31-char human-facing alphabet.
// Display format: PT-XXXXXXXX-XXXXXXXX (prefix + two 8-char groups, 16 code chars)
// Stored format: HMAC-SHA256(16-char normalized code, MOBILE_PAIRING_CODE_SECRET)

export function generatePairingCode(): { raw: string; hash: string; last4: string } {
  const secret = process.env.MOBILE_PAIRING_CODE_SECRET
  if (!secret) throw new Error('MOBILE_PAIRING_CODE_SECRET is not configured')

  const chars: string[] = []
  while (chars.length < 16) {
    const bytes = randomBytes(10) // 80 bits = 16 five-bit groups per draw
    let bitStr = ''
    for (const b of bytes) bitStr += b.toString(2).padStart(8, '0')
    for (let i = 0; i < 16 && chars.length < 16; i++) {
      const idx = parseInt(bitStr.slice(i * 5, i * 5 + 5), 2) // 0–31
      if (idx < PAIRING_CHARSET.length) chars.push(PAIRING_CHARSET[idx]) // reject 31 → no bias
    }
  }

  const raw = `PT-${chars.slice(0, 8).join('')}-${chars.slice(8).join('')}`
  const normalized = chars.join('') // 16 uppercase chars — no prefix, no dashes
  const hash = hmacHex(normalized, secret)
  const last4 = chars.slice(12).join('')
  return { raw, hash, last4 }
}

export function hashPairingCode(code: string): string {
  const secret = process.env.MOBILE_PAIRING_CODE_SECRET
  if (!secret) throw new Error('MOBILE_PAIRING_CODE_SECRET is not configured')
  // Normalize: strip "PT-" prefix, remove dashes, uppercase, trim whitespace
  const normalized = code.trim().toUpperCase().replace(/^PT-?/, '').replace(/-/g, '').replace(/\s+/g, '')
  return hmacHex(normalized, secret)
}

// ── Token generation (amendment 5: separate secret from pairing codes) ─────────

export function generateTokenPair(): {
  accessToken: string; accessHash: string
  refreshToken: string; refreshHash: string
} {
  const secret = process.env.MOBILE_TOKEN_HASH_SECRET
  if (!secret) throw new Error('MOBILE_TOKEN_HASH_SECRET is not configured')

  const accessToken = randomBytes(32).toString('hex')  // 64-char hex, 256 bits
  const refreshToken = randomBytes(32).toString('hex')
  return {
    accessToken,
    accessHash: hmacHex(accessToken, secret),
    refreshToken,
    refreshHash: hmacHex(refreshToken, secret),
  }
}

export function hashToken(token: string): string {
  const secret = process.env.MOBILE_TOKEN_HASH_SECRET
  if (!secret) throw new Error('MOBILE_TOKEN_HASH_SECRET is not configured')
  return hmacHex(token.trim(), secret)
}

// ── Staff JWT verification ─────────────────────────────────────────────────────
// Uses the Supabase service-role client to verify the JWT and look up the
// caller's org membership in saas.org_members (bypasses RLS safely).

export async function verifyStaffJwt(
  headers: Record<string, string>,
  admin: SupabaseClient
): Promise<StaffCtx | null> {
  const jwt = (headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!jwt) return null

  const { data } = await admin.auth.getUser(jwt)
  if (!data?.user) return null

  const { data: member } = await admin.schema('saas').from('org_members')
    .select('org_id, role')
    .eq('id', data.user.id)
    .maybeSingle()

  if (!member?.org_id) return null
  return { userId: data.user.id, orgId: member.org_id as string, orgRole: (member.role as string) || 'member' }
}

// ── Mobile token verification ──────────────────────────────────────────────────

export async function verifyMobileToken(
  headers: Record<string, string>,
  admin: SupabaseClient
): Promise<MobileSessionCtx | null> {
  const bearer = (headers.authorization || headers.Authorization || '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) return null

  const tokenHash = hashToken(bearer)
  const now = new Date().toISOString()

  const { data: session } = await admin.schema('cr').from('companion_mobile_session')
    .select('id, tenant_id, patient_external_id, revoked_at, access_expires_at')
    .eq('access_token_hash', tokenHash)
    .maybeSingle()

  if (!session) return null
  if (session.revoked_at) return null
  if (session.access_expires_at && session.access_expires_at < now) return null

  return {
    sessionId: session.id as string,
    tenantId: session.tenant_id as string,
    patientExternalId: session.patient_external_id as string,
  }
}

// ── Rate limiting (amendment 4) ────────────────────────────────────────────────
// IP addresses are never stored raw — only their HMAC hash.

export async function checkPairingRateLimit(
  headers: Record<string, string>,
  admin: SupabaseClient
): Promise<{ allowed: boolean; ipHash: string; uaHash: string | null }> {
  const secret = process.env.MOBILE_PAIRING_CODE_SECRET || 'dev-fallback'

  const rawIp = (
    headers['x-nf-client-connection-ip'] ||
    headers['x-forwarded-for'] ||
    headers['client-ip'] ||
    'unknown'
  ).split(',')[0].trim()

  const rawUa = headers['user-agent'] || ''
  const ipHash = hmacHex(rawIp, secret)
  const uaHash = rawUa ? hmacHex(rawUa, secret) : null

  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()

  const { count } = await admin.schema('cr').from('companion_mobile_pairing_attempt')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('succeeded', false)
    .gte('attempted_at', windowStart)

  return { allowed: (count || 0) < RATE_LIMIT_MAX_FAILURES, ipHash, uaHash }
}

export async function recordPairingAttempt(
  admin: SupabaseClient,
  ipHash: string,
  uaHash: string | null,
  succeeded: boolean
): Promise<void> {
  try {
    await admin.schema('cr').from('companion_mobile_pairing_attempt').insert({
      ip_hash: ipHash,
      ua_hash: uaHash,
      succeeded,
    })
  } catch {
    // Non-fatal: rate limiting bookkeeping failure should not block the response
  }
}

// ── Audit events ───────────────────────────────────────────────────────────────

type AuditInput = {
  tenantId: string
  patientExternalId?: string | null
  actorId?: string | null
  actorType?: 'user' | 'mobile_session' | 'system'
  eventType: string
  eventPayload?: Record<string, unknown>
}

export async function writeAuditEvent(admin: SupabaseClient, evt: AuditInput): Promise<void> {
  try {
    await admin.schema('cr').from('companion_mobile_audit_event').insert({
      tenant_id: evt.tenantId,
      patient_external_id: evt.patientExternalId ?? null,
      actor_id: evt.actorId ?? null,
      actor_type: evt.actorType ?? 'system',
      event_type: evt.eventType,
      event_payload: evt.eventPayload ?? {},
    })
  } catch (e: any) {
    // Audit write failure must not break the primary operation
    console.error('[audit] write failed:', e?.message)
  }
}

// ── Vital type catalog ─────────────────────────────────────────────────────────
// Canonical types map to cr.companion_vital.type values used throughout the system.

export const VITAL_CATALOG: Record<string, { label: string; defaultUnit: string; healthKitSupported: boolean; healthConnectSupported: boolean }> = {
  heart_rate:           { label: 'Heart Rate',           defaultUnit: 'bpm',    healthKitSupported: true,  healthConnectSupported: true  },
  resting_heart_rate:   { label: 'Resting Heart Rate',   defaultUnit: 'bpm',    healthKitSupported: true,  healthConnectSupported: true  },
  heart_rate_variability:{ label: 'HRV',                 defaultUnit: 'ms',     healthKitSupported: true,  healthConnectSupported: false },
  bp_systolic:          { label: 'Blood Pressure (Sys)', defaultUnit: 'mmHg',   healthKitSupported: true,  healthConnectSupported: true  },
  bp_diastolic:         { label: 'Blood Pressure (Dia)', defaultUnit: 'mmHg',   healthKitSupported: true,  healthConnectSupported: true  },
  blood_pressure:       { label: 'Blood Pressure',       defaultUnit: 'mmHg',   healthKitSupported: true,  healthConnectSupported: true  },
  weight_kg:            { label: 'Weight',               defaultUnit: 'kg',     healthKitSupported: true,  healthConnectSupported: true  },
  weight:               { label: 'Weight',               defaultUnit: 'kg',     healthKitSupported: true,  healthConnectSupported: true  },
  steps:                { label: 'Steps',                defaultUnit: 'count',  healthKitSupported: true,  healthConnectSupported: true  },
  spo2:                 { label: 'SpO₂',                 defaultUnit: '%',      healthKitSupported: true,  healthConnectSupported: true  },
  oxygen_saturation:    { label: 'Oxygen Saturation',    defaultUnit: '%',      healthKitSupported: true,  healthConnectSupported: true  },
  glucose:              { label: 'Blood Glucose',        defaultUnit: 'mg/dL',  healthKitSupported: true,  healthConnectSupported: true  },
  sleep:                { label: 'Sleep',                defaultUnit: 'min',    healthKitSupported: true,  healthConnectSupported: true  },
  respiratory_rate:     { label: 'Respiratory Rate',     defaultUnit: 'br/min', healthKitSupported: true,  healthConnectSupported: false },
  temp_c:               { label: 'Body Temperature',     defaultUnit: '°C',     healthKitSupported: true,  healthConnectSupported: true  },
  body_temperature:     { label: 'Body Temperature',     defaultUnit: '°C',     healthKitSupported: true,  healthConnectSupported: true  },
  active_energy:        { label: 'Active Energy',        defaultUnit: 'kcal',   healthKitSupported: true,  healthConnectSupported: true  },
}

export const VITAL_CATALOG_KEYS = Object.keys(VITAL_CATALOG)

// ── Cursor pagination ──────────────────────────────────────────────────────────

export function decodeCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0
  try {
    const n = parseInt(Buffer.from(cursor, 'base64url').toString(), 10)
    return isNaN(n) ? 0 : Math.max(0, n)
  }
  catch { return 0 }
}

export function encodeCursor(offset: number): string | null {
  return offset > 0 ? Buffer.from(offset.toString()).toString('base64url') : null
}
