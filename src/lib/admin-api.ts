// admin-api.ts — typed fetch wrappers for all Companion Mobile admin endpoints
// All functions require a Supabase session access_token for Authorization.

import { supabase } from './supabase'

async function getToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  const body = await res.json()
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || 'API error'), { code: body?.error?.code, status: res.status })
  return body as T
}

// ── Types ──────────────────────────────────────────────────────────────────────

export type TenantConfig = {
  tenantId: string; enabled: boolean; clientDisplayName: string
  allowedVitalTypes: string[]; defaultBackfillDays: number; inviteExpirationHours: number
  supportPhone: string | null; supportEmail: string | null
  privacyNoticeUrl: string | null; termsUrl: string | null
}

export type InviteItem = {
  inviteId: string; tenantId: string; patientExternalId: string
  codeLast4: string | null; status: string; expiresAt: string
  maxRedemptions: number; redemptionCount: number
  createdBy: string; createdAt: string; redeemedAt: string | null; revokedAt: string | null
}

export type GeneratedInvite = {
  inviteId: string; pairingCode: string; pairUrl: string
  qrPayload: string; expiresAt: string; status: string
}

export type SessionItem = {
  sessionId: string; tenantId: string; patientExternalId: string
  platform: string; appVersion: string | null; deviceName: string | null
  pairedAt: string; lastSeenAt: string | null; lastSyncAt: string | null
  revokedAt: string | null; allowedVitalTypes: string[]; status: string
}

export type SyncMonitorItem = {
  sessionId: string; patientExternalId: string; tenantId: string
  platform: string; pairedStatus: string; appVersion: string | null
  lastSeenAt: string | null; lastSyncAt: string | null; lastVitalReceivedAt: string | null
  lastBatchStatus: string | null; lastErrorCode: string | null; lastErrorMessage: string | null
  grantedPermissions: string[]
}

export type AuditItem = {
  id: string; tenantId: string; patientExternalId: string | null
  actorId: string | null; actorType: string; eventType: string
  eventPayload: Record<string, unknown>; createdAt: string
}

export type PatientStatus = {
  tenantId: string; patientExternalId: string
  invites: InviteItem[]; sessions: SessionItem[]
  recentBatches: unknown[]; recentAuditEvents: AuditItem[]; recentVitals: unknown[]
}

export type OverviewStats = {
  enabled: boolean; clientDisplayName: string; pendingInvites: number
  activeSessions: number; failedBatches24h: number; noSyncIn7d: number
}

type Paginated<T> = { items: T[]; nextCursor: string | null }

// ── Config ─────────────────────────────────────────────────────────────────────

export const getConfig   = ()         => apiFetch<TenantConfig>('/api/mobile-config')
export const updateConfig = (data: Partial<TenantConfig>) =>
  apiFetch<TenantConfig>('/api/mobile-config', { method: 'PATCH', body: JSON.stringify(data) })

// ── Stats ──────────────────────────────────────────────────────────────────────

export const getStats = () => apiFetch<OverviewStats>('/api/mobile-stats')

// ── Invites ────────────────────────────────────────────────────────────────────

export const listInvites = (params: Record<string, string> = {}) =>
  apiFetch<Paginated<InviteItem>>(`/api/mobile-invites?${new URLSearchParams(params)}`)

export const generateInvite = (data: {
  patientExternalId: string; expirationHours?: number; maxRedemptions?: number
}) => apiFetch<GeneratedInvite>('/api/mobile-invites', { method: 'POST', body: JSON.stringify(data) })

export const revokeInvite = (inviteId: string) =>
  apiFetch<{ inviteId: string; status: string }>(`/api/mobile-invite-action?action=revoke&inviteId=${inviteId}`, { method: 'POST' })

// ── Sessions ───────────────────────────────────────────────────────────────────

export const listSessions = (params: Record<string, string> = {}) =>
  apiFetch<Paginated<SessionItem>>(`/api/mobile-sessions?${new URLSearchParams(params)}`)

export const revokeSession = (sessionId: string) =>
  apiFetch<{ sessionId: string; revoked: boolean; revokedAt: string }>(`/api/mobile-session-action?action=revoke&sessionId=${sessionId}`, { method: 'POST' })

// ── Sync monitor ───────────────────────────────────────────────────────────────

export const getSyncMonitor = (params: Record<string, string> = {}) =>
  apiFetch<Paginated<SyncMonitorItem>>(`/api/mobile-sync-monitor?${new URLSearchParams(params)}`)

// ── Patient status ─────────────────────────────────────────────────────────────

export const getPatientStatus = (patientExternalId: string) =>
  apiFetch<PatientStatus>(`/api/mobile-patient-status?patientExternalId=${encodeURIComponent(patientExternalId)}`)

// ── Audit ──────────────────────────────────────────────────────────────────────

export const listAudit = (params: Record<string, string> = {}) =>
  apiFetch<Paginated<AuditItem>>(`/api/mobile-audit?${new URLSearchParams(params)}`)

// ── Patient search ─────────────────────────────────────────────────────────────

export const searchPatients = (q: string) =>
  apiFetch<{ items: { patientExternalId: string; displayName: string }[] }>(`/api/mobile-patient-search?q=${encodeURIComponent(q)}`)
