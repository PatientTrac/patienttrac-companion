// Tests for companion-refresh.ts — token rotation with optimistic locking
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('../_mobile-helpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_mobile-helpers')>()
  return {
    ...actual,
    writeAuditEvent: vi.fn().mockResolvedValue(undefined),
  }
})

import { createClient } from '@supabase/supabase-js'

const TOKEN_SECRET = 'test-token-secret-xyz'
const futureExpiry = new Date(Date.now() + 3600000).toISOString()

// Build a query builder that chains correctly.
// select() returns `this` unless called after update() (terminal → Promise).
function makeQueryBuilder(opts: {
  sessionData: unknown
  updateRows: unknown[]
  updateError?: unknown
}) {
  let afterUpdate = false

  const builder: Record<string, unknown> = {}
  builder.select = vi.fn().mockImplementation(() => {
    if (afterUpdate) {
      return Promise.resolve({ data: opts.updateRows, error: opts.updateError ?? null })
    }
    return builder
  })
  builder.eq          = vi.fn().mockReturnValue(builder)
  builder.update      = vi.fn().mockImplementation(() => { afterUpdate = true; return builder })
  builder.maybeSingle = vi.fn().mockResolvedValue({ data: opts.sessionData, error: null })
  return builder
}

function makeAdmin(opts: {
  sessionData?: unknown
  updateRows?: unknown[]
  updateError?: unknown
} = {}) {
  const { sessionData = null, updateRows = [], updateError = undefined } = opts
  const builder = makeQueryBuilder({ sessionData, updateRows, updateError })

  return {
    schema: vi.fn().mockImplementation((_: string) => ({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'companion_mobile_session') return builder
        if (table === 'companion_mobile_audit_event') return {
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }
        return builder
      }),
    })),
  }
}

async function callHandler(body: unknown) {
  const { handler } = await import('../companion-refresh')
  return handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify(body) })
}

describe('companion-refresh', () => {
  beforeEach(() => {
    vi.stubEnv('SUPABASE_URL', 'https://test.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'key')
    vi.stubEnv('MOBILE_TOKEN_HASH_SECRET', TOKEN_SECRET)
    vi.mocked(createClient).mockReturnValue(makeAdmin({ updateRows: [{ id: 'sess-1' }] }) as unknown as ReturnType<typeof createClient>)
  })
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

  it('responds 204 to OPTIONS', async () => {
    const { handler } = await import('../companion-refresh')
    const res = await handler({ httpMethod: 'OPTIONS', headers: {}, body: null })
    expect(res.statusCode).toBe(204)
  })

  it('returns 401 when refreshToken missing', async () => {
    const res = await callHandler({})
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when session not found', async () => {
    vi.mocked(createClient).mockReturnValue(
      makeAdmin({ sessionData: null }) as unknown as ReturnType<typeof createClient>
    )
    const res = await callHandler({ refreshToken: 'nonexistent' })
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error.code).toBe('MOBILE_TOKEN_INVALID')
  })

  it('returns 401 when session is revoked', async () => {
    vi.mocked(createClient).mockReturnValue(makeAdmin({
      sessionData: { id: 's1', tenant_id: 'org', patient_external_id: '1', revoked_at: '2024-01-01', refresh_expires_at: futureExpiry },
    }) as unknown as ReturnType<typeof createClient>)
    const res = await callHandler({ refreshToken: 'sometoken' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when refresh token is expired', async () => {
    const pastExpiry = new Date(Date.now() - 1000).toISOString()
    vi.mocked(createClient).mockReturnValue(makeAdmin({
      sessionData: { id: 's1', tenant_id: 'org', patient_external_id: '1', revoked_at: null, refresh_expires_at: pastExpiry },
    }) as unknown as ReturnType<typeof createClient>)
    const res = await callHandler({ refreshToken: 'sometoken' })
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when optimistic lock detects concurrent reuse (0 rows updated)', async () => {
    vi.mocked(createClient).mockReturnValue(makeAdmin({
      sessionData: { id: 's1', tenant_id: 'org', patient_external_id: '1', revoked_at: null, refresh_expires_at: futureExpiry },
      updateRows: [],  // 0 rows — concurrent refresh already rotated the token
    }) as unknown as ReturnType<typeof createClient>)
    const res = await callHandler({ refreshToken: 'sometoken' })
    expect(res.statusCode).toBe(401)
    // Generic error — must not expose concurrent/theft info
    expect(JSON.parse(res.body).error.message.toLowerCase()).not.toContain('concurrent')
  })

  it('returns new tokens on successful refresh', async () => {
    vi.mocked(createClient).mockReturnValue(makeAdmin({
      sessionData: { id: 's1', tenant_id: 'org', patient_external_id: '1', revoked_at: null, refresh_expires_at: futureExpiry },
      updateRows: [{ id: 's1' }],
    }) as unknown as ReturnType<typeof createClient>)
    const res = await callHandler({ refreshToken: 'sometoken' })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.accessToken).toBeDefined()
    expect(body.refreshToken).toBeDefined()
    expect(body.accessExpiresAt).toBeDefined()
    expect(body.refreshExpiresAt).toBeDefined()
    // Hashes must NOT appear in response
    expect(body.accessHash).toBeUndefined()
    expect(body.refreshHash).toBeUndefined()
  })

  it('issues different tokens on each successful refresh call', async () => {
    vi.mocked(createClient).mockReturnValue(makeAdmin({
      sessionData: { id: 's1', tenant_id: 'org', patient_external_id: '1', revoked_at: null, refresh_expires_at: futureExpiry },
      updateRows: [{ id: 's1' }],
    }) as unknown as ReturnType<typeof createClient>)
    const r1 = await callHandler({ refreshToken: 'token-a' })
    vi.resetModules()
    vi.mocked(createClient).mockReturnValue(makeAdmin({
      sessionData: { id: 's1', tenant_id: 'org', patient_external_id: '1', revoked_at: null, refresh_expires_at: futureExpiry },
      updateRows: [{ id: 's1' }],
    }) as unknown as ReturnType<typeof createClient>)
    const r2 = await callHandler({ refreshToken: 'token-b' })
    const b1 = JSON.parse(r1.body)
    const b2 = JSON.parse(r2.body)
    expect(b1.accessToken).not.toBe(b2.accessToken)
    expect(b1.refreshToken).not.toBe(b2.refreshToken)
  })
})
