// Unit tests for _mobile-helpers.ts pure functions
// These tests do not require a database connection.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  generatePairingCode,
  hashPairingCode,
  generateTokenPair,
  hashToken,
  hmacHex,
  decodeCursor,
  encodeCursor,
  VITAL_CATALOG_KEYS,
} from '../_mobile-helpers'

const CODE_SECRET = 'test-pairing-code-secret-abc123'
const TOKEN_SECRET = 'test-token-hash-secret-xyz789'

describe('_mobile-helpers', () => {
  beforeEach(() => {
    vi.stubEnv('MOBILE_PAIRING_CODE_SECRET', CODE_SECRET)
    vi.stubEnv('MOBILE_TOKEN_HASH_SECRET', TOKEN_SECRET)
  })
  afterEach(() => vi.unstubAllEnvs())

  // ── generatePairingCode ────────────────────────────────────────────────────

  describe('generatePairingCode', () => {
    it('returns raw in PT-XXXXXXXX-XXXXXXXX format', () => {
      const { raw } = generatePairingCode()
      expect(raw).toMatch(/^PT-[A-Z2-9]{8}-[A-Z2-9]{8}$/)
    })

    it('returns 64-char hex hash', () => {
      const { hash } = generatePairingCode()
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns 4-char last4', () => {
      const { last4 } = generatePairingCode()
      expect(last4).toHaveLength(4)
      expect(last4).toMatch(/^[A-Z2-9]{4}$/)
    })

    it('last4 matches end of raw code', () => {
      const { raw, last4 } = generatePairingCode()
      expect(raw.endsWith(last4)).toBe(true)
    })

    it('generates unique codes', () => {
      const codes = Array.from({ length: 20 }, () => generatePairingCode().raw)
      const unique = new Set(codes)
      expect(unique.size).toBe(20)
    })

    it('hash is deterministic for same input via hashPairingCode round-trip', () => {
      const { raw, hash } = generatePairingCode()
      expect(hashPairingCode(raw)).toBe(hash)
    })

    it('throws when MOBILE_PAIRING_CODE_SECRET is absent', () => {
      vi.stubEnv('MOBILE_PAIRING_CODE_SECRET', '')
      expect(() => generatePairingCode()).toThrow('MOBILE_PAIRING_CODE_SECRET')
    })

    it('character distribution does not include I, L, O, 0, 1', () => {
      const codes = Array.from({ length: 50 }, () => generatePairingCode().raw.replace(/^PT-|-/g, ''))
      const allChars = codes.join('')
      expect(allChars).not.toMatch(/[ILO01]/)
    })
  })

  // ── hashPairingCode ────────────────────────────────────────────────────────

  describe('hashPairingCode', () => {
    it('normalizes lowercase input to same hash', () => {
      const { raw, hash } = generatePairingCode()
      expect(hashPairingCode(raw.toLowerCase())).toBe(hash)
    })

    it('normalizes whitespace', () => {
      const { raw, hash } = generatePairingCode()
      expect(hashPairingCode(`  ${raw}  `)).toBe(hash)
    })

    it('different codes produce different hashes', () => {
      const a = generatePairingCode()
      const b = generatePairingCode()
      expect(a.hash).not.toBe(b.hash)
    })
  })

  // ── generateTokenPair ──────────────────────────────────────────────────────

  describe('generateTokenPair', () => {
    it('returns 64-char hex tokens', () => {
      const { accessToken, refreshToken } = generateTokenPair()
      expect(accessToken).toMatch(/^[0-9a-f]{64}$/)
      expect(refreshToken).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns 64-char hex hashes', () => {
      const { accessHash, refreshHash } = generateTokenPair()
      expect(accessHash).toMatch(/^[0-9a-f]{64}$/)
      expect(refreshHash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('hashes are consistent with hashToken', () => {
      const { accessToken, accessHash, refreshToken, refreshHash } = generateTokenPair()
      expect(hashToken(accessToken)).toBe(accessHash)
      expect(hashToken(refreshToken)).toBe(refreshHash)
    })

    it('access and refresh tokens are different', () => {
      const { accessToken, refreshToken } = generateTokenPair()
      expect(accessToken).not.toBe(refreshToken)
    })

    it('throws when MOBILE_TOKEN_HASH_SECRET is absent', () => {
      vi.stubEnv('MOBILE_TOKEN_HASH_SECRET', '')
      expect(() => generateTokenPair()).toThrow('MOBILE_TOKEN_HASH_SECRET')
    })

    it('token hashes differ from pairing code hashes for same input', () => {
      // Key separation: same raw value hashed with different secrets must differ
      const raw = 'ABCDEFGHIJKLMNOP'
      const codeHash = hmacHex(raw, CODE_SECRET)
      const tokenHash = hmacHex(raw, TOKEN_SECRET)
      expect(codeHash).not.toBe(tokenHash)
    })
  })

  // ── cursor helpers ─────────────────────────────────────────────────────────

  describe('encodeCursor / decodeCursor', () => {
    it('encodes offset > 0 to a non-null string', () => {
      expect(encodeCursor(25)).not.toBeNull()
    })

    it('encodes offset 0 to null', () => {
      expect(encodeCursor(0)).toBeNull()
    })

    it('round-trips correctly', () => {
      const cursor = encodeCursor(50)
      expect(decodeCursor(cursor)).toBe(50)
    })

    it('decodeCursor on null returns 0', () => {
      expect(decodeCursor(null)).toBe(0)
      expect(decodeCursor(undefined)).toBe(0)
    })

    it('decodeCursor on invalid input returns 0', () => {
      expect(decodeCursor('!!!')).toBe(0)
    })
  })

  // ── VITAL_CATALOG_KEYS ─────────────────────────────────────────────────────

  describe('VITAL_CATALOG_KEYS', () => {
    it('is non-empty', () => {
      expect(VITAL_CATALOG_KEYS.length).toBeGreaterThan(0)
    })

    it('includes expected types', () => {
      expect(VITAL_CATALOG_KEYS).toContain('heart_rate')
      expect(VITAL_CATALOG_KEYS).toContain('bp_systolic')
      expect(VITAL_CATALOG_KEYS).toContain('weight_kg')
    })
  })
})
