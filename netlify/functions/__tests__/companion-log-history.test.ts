// Tests for companion-log-history.ts (audit H3) — bearer required, params validated,
// RPC result passed through with server-side patient resolution.
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
import { createClient } from '@supabase/supabase-js'
import { handler } from '../companion-log-history'

const mockRpc = (data: unknown, error: unknown = null) => {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  // client must resolve the RPC in the `cr` schema (function lives in cr, not public)
  const schema = vi.fn().mockReturnValue({ rpc })
  ;(createClient as any).mockReturnValue({ schema, rpc })
  ;(rpc as any).schemaSpy = schema
  return rpc
}

const GET = (qs: Record<string, string>, auth = 'Bearer tok') =>
  handler({ httpMethod: 'GET', headers: auth ? { authorization: auth } : {}, queryStringParameters: qs })

describe('companion-log-history', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
  })

  it('rejects non-GET', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, queryStringParameters: {} })
    expect(res.statusCode).toBe(405)
  })

  it('rejects a missing bearer token', async () => {
    const res = await GET({ carePlanId: '1', from: '2026-06-01', to: '2026-06-30' }, '')
    expect(res.statusCode).toBe(401)
  })

  it('rejects malformed params', async () => {
    mockRpc(null)
    expect((await GET({ carePlanId: 'abc', from: '2026-06-01', to: '2026-06-30' })).statusCode).toBe(400)
    expect((await GET({ carePlanId: '1', from: 'junk', to: '2026-06-30' })).statusCode).toBe(400)
  })

  it('maps RPC unauthorized to 401 (cross-patient access denied server-side)', async () => {
    mockRpc({ state: 'unauthorized' })
    const res = await GET({ carePlanId: '1', from: '2026-06-01', to: '2026-06-30' })
    expect(res.statusCode).toBe(401)
  })

  it('returns hydratable days on success and forwards the bearer to Supabase', async () => {
    const rpc = mockRpc({ state: 'ok', days: { '2026-06-15': { vitals: { temp: '37.1' }, notes: 'ok day' } } })
    const res = await GET({ carePlanId: '7', from: '2026-06-01', to: '2026-06-30' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).days['2026-06-15'].notes).toBe('ok day')
    expect(rpc).toHaveBeenCalledWith('companion_log_history', { p_care_plan_id: 7, p_from: '2026-06-01', p_to: '2026-06-30' })
    expect((rpc as any).schemaSpy).toHaveBeenCalledWith('cr') // RPC must resolve in cr, not public
    const clientArgs = (createClient as any).mock.calls[0]
    expect(clientArgs[2].global.headers.Authorization).toBe('Bearer tok')
  })
})
