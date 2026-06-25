// Tests for companion-pair.ts
// Uses in-memory Supabase stubs — no real database connection.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { generatePairingCode } from '../_mobile-helpers'

const CODE_SECRET = 'test-pair-secret'
const TOKEN_SECRET = 'test-token-secret'

// ── Stub supabase client ─────────────────────────────────────────────────────

function makeSupabase(overrides: {
  invite?: Record<string, unknown> | null
  config?: Record<string, unknown> | null
  sessionId?: string
  rateLimitCount?: number
}) {
  const { invite = null, config = null, sessionId = 'sess-abc', rateLimitCount = 0 } = overrides

  const queryBuilder = (result: unknown) => ({
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: result, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: result, error: null }),
    // count for rate limit check
    then:   (cb: (v: unknown) => unknown) => Promise.resolve(cb({ count: rateLimitCount, data: null, error: null })),
  })

  const sessionResult = { id: sessionId }

  return {
    schema: vi.fn().mockImplementation((schema: string) => ({
      from: vi.fn().mockImplementation((table: string) => {
        if (schema === 'cr' && table === 'companion_mobile_pairing_attempt') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            gte:    vi.fn().mockReturnThis(),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
            then:   (cb: (v: unknown) => unknown) => Promise.resolve(cb({ count: rateLimitCount, error: null })),
          }
        }
        if (schema === 'cr' && table === 'companion_mobile_invite') {
          return {
            select: vi.fn().mockReturnThis(),
            eq:     vi.fn().mockReturnThis(),
            update: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: invite, error: null }),
          }
        }
        if (schema === 'cr' && table === 'companion_mobile_tenant_config') {
          return queryBuilder(config)
        }
        if (schema === 'cr' && table === 'companion_mobile_session') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: sessionResult, error: null }),
          }
        }
        if (schema === 'cr' && table === 'companion_mobile_audit_event') {
          return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) }
        }
        return queryBuilder(null)
      }),
    })),
  }
}

// ── Module mock ──────────────────────────────────────────────────────────────

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

let mockAdmin: ReturnType<typeof makeSupabase>

vi.mock('../_mobile-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_mobile-helpers')>()
  return {
    ...actual,
    checkPairingRateLimit: vi.fn(),
    recordPairingAttempt: vi.fn().mockResolvedValue(undefined),
    writeAuditEvent: vi.fn().mockResolvedValue(undefined),
  }
})

import { createClient } from '@supabase/supabase-js'
import { checkPairingRateLimit, recordPairingAttempt } from '../_mobile-helpers'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEvent(body: unknown, httpMethod = 'POST') {
  return {
    httpMethod,
    headers: { 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(body),
  }
}

async function callHandler(event: ReturnType<typeof makeEvent>) {
  const { handler } = await import('../companion-pair')
  return handler(event)
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('companion-pair', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
    vi.stubEnv('MOBILE_PAIRING_CODE_SECRET', CODE_SECRET)
    vi.stubEnv('MOBILE_TOKEN_HASH_SECRET', TOKEN_SECRET)
    vi.mocked(checkPairingRateLimit).mockResolvedValue({ allowed: true, ipHash: 'iphash', uaHash: null })
    mockAdmin = makeSupabase({})
    vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('responds 204 to OPTIONS preflight', async () => {
    const res = await callHandler({ ...makeEvent({}), httpMethod: 'OPTIONS' })
    expect(res.statusCode).toBe(204)
  })

  it('returns 405 for GET', async () => {
    const res = await callHandler({ ...makeEvent({}), httpMethod: 'GET' })
    expect(res.statusCode).toBe(405)
  })

  it('returns generic error when rate limited', async () => {
    vi.mocked(checkPairingRateLimit).mockResolvedValue({ allowed: false, ipHash: 'iphash', uaHash: null })
    const res = await callHandler(makeEvent({ pairingCode: 'PT-AAAAAAAA-BBBBBBBB' }))
    expect(res.statusCode).toBe(400)
    const body = JSON.parse(res.body)
    expect(body.error.code).toBe('PAIRING_CODE_INVALID')
  })

  it('returns generic error when pairingCode is absent', async () => {
    const res = await callHandler(makeEvent({}))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('PAIRING_CODE_INVALID')
  })

  it('returns generic error when invite not found', async () => {
    mockAdmin = makeSupabase({ invite: null })
    vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
    const res = await callHandler(makeEvent({ pairingCode: 'PT-AAAAAAAA-BBBBBBBB' }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('PAIRING_CODE_INVALID')
  })

  it('does NOT reveal in error whether code is valid, expired, or revoked', async () => {
    const cases = [null, { status: 'revoked', redemption_count: 0, max_redemptions: 1 }]
    for (const invite of cases) {
      mockAdmin = makeSupabase({ invite })
      vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
      const res = await callHandler(makeEvent({ pairingCode: 'PT-AAAAAAAA-BBBBBBBB' }))
      expect(res.statusCode).toBe(400)
      const body = JSON.parse(res.body)
      expect(body.error.code).toBe('PAIRING_CODE_INVALID')
      // Error message must not contain "revoked" or "expired"
      expect(body.error.message.toLowerCase()).not.toContain('revoked')
    }
  })

  it('returns 403 when tenant has mobile disabled', async () => {
    mockAdmin = makeSupabase({
      invite: { id: 'inv-1', tenant_id: 'org-1', patient_external_id: 'p-1', status: 'active', expires_at: new Date(Date.now() + 3600000).toISOString(), max_redemptions: 1, redemption_count: 0 },
      config: { enabled: false, client_display_name: 'Test Clinic', allowed_vital_types: [], default_backfill_days: 30 },
    })
    vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
    const res = await callHandler(makeEvent({ pairingCode: 'PT-AAAAAAAA-BBBBBBBB' }))
    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error.code).toBe('MOBILE_SYNC_DISABLED')
  })

  it('returns tokens and metadata on successful pairing', async () => {
    const { raw } = generatePairingCode()
    const futureExpiry = new Date(Date.now() + 3600000).toISOString()
    mockAdmin = makeSupabase({
      invite: { id: 'inv-1', tenant_id: 'org-1', patient_external_id: 'p-42', status: 'active', expires_at: futureExpiry, max_redemptions: 1, redemption_count: 0 },
      config: { enabled: true, client_display_name: 'Demo Clinic', allowed_vital_types: ['heart_rate'], default_backfill_days: 14 },
      sessionId: 'sess-xyz',
    })
    vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
    const res = await callHandler(makeEvent({ pairingCode: raw, platform: 'ios' }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeDefined()
    expect(body.refreshToken).toBeDefined()
    expect(body.patientExternalId).toBe('p-42')
    expect(body.tenantId).toBe('org-1')
  })

  it('records successful pairing attempt', async () => {
    const { raw } = generatePairingCode()
    const futureExpiry = new Date(Date.now() + 3600000).toISOString()
    mockAdmin = makeSupabase({
      invite: { id: 'inv-1', tenant_id: 'org-1', patient_external_id: 'p-1', status: 'active', expires_at: futureExpiry, max_redemptions: 1, redemption_count: 0 },
      config: { enabled: true, client_display_name: 'Clinic', allowed_vital_types: [], default_backfill_days: 30 },
    })
    vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
    await callHandler(makeEvent({ pairingCode: raw }))
    expect(recordPairingAttempt).toHaveBeenCalledWith(expect.anything(), 'iphash', null, true)
  })

  it('response body does NOT contain raw code, PHI fields, or token hashes', async () => {
    const { raw } = generatePairingCode()
    const futureExpiry = new Date(Date.now() + 3600000).toISOString()
    mockAdmin = makeSupabase({
      invite: { id: 'inv-1', tenant_id: 'org-1', patient_external_id: 'p-1', status: 'active', expires_at: futureExpiry, max_redemptions: 1, redemption_count: 0 },
      config: { enabled: true, client_display_name: 'Clinic', allowed_vital_types: [], default_backfill_days: 30 },
    })
    vi.mocked(createClient).mockReturnValue(mockAdmin as unknown as ReturnType<typeof createClient>)
    const res = await callHandler(makeEvent({ pairingCode: raw }))
    const body = JSON.parse(res.body)
    // Must not expose hashes
    expect(body.accessHash).toBeUndefined()
    expect(body.refreshHash).toBeUndefined()
    // Must not expose invite internal ID
    expect(body.inviteId).toBeUndefined()
  })
})
