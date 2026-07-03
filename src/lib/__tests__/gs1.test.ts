import { describe, it, expect } from 'vitest'
import { parseGs1 } from '../gs1'

const GS = String.fromCharCode(29)

describe('parseGs1', () => {
  it('parses human-readable (01)(10)(17) form', () => {
    const r = parseGs1('(01)04046963608989(10)9555798(17)271231')
    expect(r.di).toBe('04046963608989')
    expect(r.lot).toBe('9555798')
    expect(r.expiry).toBe('2027-12-31')
  })

  it('parses a scanned DataMatrix: fixed DI + expiry, variable lot to end', () => {
    const r = parseGs1('010404696360898917271231109555798')
    expect(r.di).toBe('04046963608989')
    expect(r.expiry).toBe('2027-12-31')
    expect(r.lot).toBe('9555798')
  })

  it('splits variable fields on the FNC1/GS separator (lot then serial)', () => {
    const r = parseGs1(`010404696360898910LOT9${GS}21SER5`)
    expect(r.di).toBe('04046963608989')
    expect(r.lot).toBe('LOT9')
    expect(r.serial).toBe('SER5')
  })

  it('strips a leading symbology identifier (]d2)', () => {
    const r = parseGs1(']d2010404696360898921ABC')
    expect(r.di).toBe('04046963608989')
    expect(r.serial).toBe('ABC')
  })

  it('normalizes a DD=00 (end-of-month) date to the 1st', () => {
    const r = parseGs1('(11)240800')
    expect(r.production).toBe('2024-08-01')
  })

  it('keeps the raw string and tolerates junk', () => {
    const r = parseGs1('not-a-barcode')
    expect(r.raw).toBe('not-a-barcode')
    expect(r.di).toBeUndefined()
  })
})
