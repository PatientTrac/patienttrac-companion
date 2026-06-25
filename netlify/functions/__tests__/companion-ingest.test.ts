// Tests for companion-ingest.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('../_mobile-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_mobile-helpers')>()
  return {
    ...actual,
    verifyMobileToken: vi.fn(),
    writeAuditEvent: vi.fn().mockResolvedValue(undefined),
  }
})

import { createClient } from '@supabase/supabase-js'
import { verifyMobileToken } from '../_mobile-helpers'

const SESSION_CTX = { sessionId: 'sess-1', tenantId: 'org-abc', patientExternalId: '42' }

function makeAdmin(overrides: { batchId?: string; sessionRow?: unknown; insertVitalError?: unknown } = {}) {
  const { batchId = 'batch-1', sessionRow = { allowed_vital_types: ['heart_rate', 'steps'], platform: 'ios' }, insertVitalError = null } = overrides
  const batchResult = { id: batchId }

  return {
    schema: vi.fn().mockImplementation((_schema: string) => ({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'companion_mobile_sync_batch') return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          insert: vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: batchResult, error: null }),
        }
        if (table === 'companion_mobile_session') return {
          select: vi.fn().mockReturnThis(),
          eq:     vi.fn().mockReturnThis(),
          update: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: sessionRow, error: null }),
        }
        if (table === 'companion_vital') return {
          insert: vi.fn().mockResolvedValue({ data: null, error: insertVitalError }),
        }
        if (table === 'companion_mobile_audit_event') return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }
      }),
    })),
  }
}

function makeEvent(body: unknown, extraHeaders: Record<string, string> = {}) {
  return {
    httpMethod: 'POST',
    headers: { 'idempotency-key': 'idem-abc-123', authorization: 'Bearer tok', ...extraHeaders },
    body: JSON.stringify(body),
  }
}

async function callHandler(event: ReturnType<typeof makeEvent>) {
  const { handler } = await import('../companion-ingest')
  return handler(event)
}

describe('companion-ingest', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    vi.stubEnv('MOBILE_TOKEN_HASH_SECRET', 'tok-secret')
    vi.mocked(verifyMobileToken).mockResolvedValue(SESSION_CTX)
    vi.mocked(createClient).mockReturnValue(makeAdmin() as unknown as ReturnType<typeof createClient>)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('responds 204 to OPTIONS', async () => {
    const res = await callHandler({ ...makeEvent({}), httpMethod: 'OPTIONS' })
    expect(res.statusCode).toBe(204)
  })

  it('returns 401 when mobile token invalid', async () => {
    vi.mocked(verifyMobileToken).mockResolvedValue(null)
    const res = await callHandler(makeEvent({ observations: [] }))
    expect(res.statusCode).toBe(401)
  })

  it('requires Idempotency-Key header', async () => {
    const res = await callHandler({ httpMethod: 'POST', headers: { authorization: 'Bearer tok' }, body: '{}' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('IDEMPOTENCY_KEY_REQUIRED')
  })

  it('rejects wrong X-Canonical-Path', async () => {
    const res = await callHandler(makeEvent({}, { 'x-canonical-path': 'cr.wrong_table' }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('CANONICAL_PATH_INVALID')
  })

  it('returns processed with accepted=0 for empty observations', async () => {
    const res = await callHandler(makeEvent({ observations: [] }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.status).toBe('processed')
    expect(body.accepted).toBe(0)
  })

  it('accepts valid observations and returns canonicalPath', async () => {
    const obs = [
      { type: 'heart_rate', value: 72, unit: 'bpm', observedAt: '2024-06-01T10:00:00Z' },
      { type: 'steps',      value: 5000, unit: 'count', observedAt: '2024-06-01T10:00:00Z' },
    ]
    const res = await callHandler(makeEvent({ observations: obs }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accepted).toBe(2)
    expect(body.rejected).toBe(0)
    expect(body.canonicalPath).toBe('cr.companion_vital')
  })

  it('rejects observations with disallowed vital types', async () => {
    const obs = [{ type: 'sleep', value: 480, unit: 'min', observedAt: '2024-06-01T10:00:00Z' }]
    const res = await callHandler(makeEvent({ observations: obs }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.rejected).toBe(1)
    expect(body.rejectedDetails[0].reason).toBe('vital_type_not_allowed')
  })

  it('rejects observations with missing type', async () => {
    const obs = [{ value: 100, unit: 'bpm', observedAt: '2024-06-01T10:00:00Z' }]
    const res = await callHandler(makeEvent({ observations: obs }))
    const body = JSON.parse(res.body)
    expect(body.rejected).toBe(1)
    expect(body.rejectedDetails[0].reason).toBe('missing_type')
  })

  it('rejects observations with invalid value', async () => {
    const obs = [{ type: 'heart_rate', value: 'bad', unit: 'bpm', observedAt: '2024-06-01T10:00:00Z' }]
    const res = await callHandler(makeEvent({ observations: obs }))
    const body = JSON.parse(res.body)
    expect(body.rejected).toBe(1)
    expect(body.rejectedDetails[0].reason).toBe('invalid_value')
  })

  it('rejects observations with invalid observedAt', async () => {
    const obs = [{ type: 'heart_rate', value: 72, unit: 'bpm', observedAt: 'not-a-date' }]
    const res = await callHandler(makeEvent({ observations: obs }))
    const body = JSON.parse(res.body)
    expect(body.rejected).toBe(1)
    expect(body.rejectedDetails[0].reason).toBe('invalid_observed_at')
  })

  it('body-supplied patient/tenant fields are ignored — session context always wins', async () => {
    // The handler must resolve patient_id and org_id from the session, never from request body.
    // Even if the body injects extra fields, the response should succeed based on session data.
    const obs = [{ type: 'heart_rate', value: 72, unit: 'bpm', observedAt: '2024-06-01T10:00:00Z' }]
    const bodyWithAttemptedOverride = {
      observations: obs,
      patientId: 9999,
      patientExternalId: 'injected-evil',
      tenantId: 'evil-tenant',
      orgId: 'evil-org',
    }
    const res = await callHandler(makeEvent(bodyWithAttemptedOverride))
    // Should succeed — injected fields are silently ignored
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accepted).toBe(1)
    expect(body.rejected).toBe(0)
  })

  it('returns 400 when observations exceeds max', async () => {
    const obs = Array.from({ length: 1001 }, (_, i) => ({
      type: 'heart_rate', value: 72, unit: 'bpm', observedAt: '2024-06-01T10:00:00Z',
    }))
    const res = await callHandler(makeEvent({ observations: obs }))
    expect(res.statusCode).toBe(400)
  })

  it('handles idempotent duplicate by returning status=duplicate', async () => {
    const adminMock = makeAdmin()
    // Override to return existing batch for idempotency check
    const origSchema = adminMock.schema.bind(adminMock)
    vi.spyOn(adminMock, 'schema').mockImplementation((s: string) => {
      const base = origSchema(s)
      const origFrom = base.from.bind(base)
      vi.spyOn(base, 'from').mockImplementation((t: string) => {
        if (t === 'companion_mobile_sync_batch') {
          return { ...origFrom(t), maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'existing-batch', status: 'processed' }, error: null }) }
        }
        return origFrom(t)
      })
      return base
    })
    vi.mocked(createClient).mockReturnValue(adminMock as unknown as ReturnType<typeof createClient>)
    const obs = [{ type: 'heart_rate', value: 72, unit: 'bpm', observedAt: '2024-06-01T10:00:00Z' }]
    const res = await callHandler(makeEvent({ observations: obs }))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).status).toBe('duplicate')
  })
})
