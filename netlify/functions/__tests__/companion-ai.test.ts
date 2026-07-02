// Tests for companion-ai.ts — the endpoint must reject unauthenticated calls (audit C1)
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'hello' }] }) },
  })),
}))

import { createClient } from '@supabase/supabase-js'
import { handler } from '../companion-ai'

const mockGetUser = (result: { user: unknown } | null, error: unknown = null) => {
  ;(createClient as any).mockReturnValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: result, error }) } })
}

describe('companion-ai auth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://x.supabase.co'
    process.env.SUPABASE_ANON_KEY = 'anon'
    process.env.ANTHROPIC_API_KEY = 'k'
  })

  it('rejects non-POST', async () => {
    const res = await handler({ httpMethod: 'GET', headers: {}, body: null })
    expect(res.statusCode).toBe(405)
  })

  it('rejects missing bearer token', async () => {
    const res = await handler({ httpMethod: 'POST', headers: {}, body: JSON.stringify({ question: 'hi' }) })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an invalid token', async () => {
    mockGetUser(null, { message: 'invalid JWT' })
    const res = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer bad' }, body: JSON.stringify({ question: 'hi' }) })
    expect(res.statusCode).toBe(401)
  })

  it('rejects an oversized question even when authenticated', async () => {
    mockGetUser({ user: { id: 'u1' } })
    const res = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ question: 'x'.repeat(2001) }) })
    expect(res.statusCode).toBe(400)
  })

  it('answers for a valid session', async () => {
    mockGetUser({ user: { id: 'u1' } })
    const res = await handler({ httpMethod: 'POST', headers: { authorization: 'Bearer good' }, body: JSON.stringify({ topic: 'diet', question: 'what should I know?' }) })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).text).toBe('hello')
  })
})
