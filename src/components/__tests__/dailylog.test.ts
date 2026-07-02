// Daily Log helpers — patient-local date bucketing (audit M7/M8) and
// server-entry hydration (audit H3).
import { describe, it, expect } from 'vitest'
import { ISO, dayDiff, fromServerEntry, emptyEntry, timeline, redFlags, buildPlan } from '../CompanionDailyLog'

const t = (k: string) => k // identity translator for pure-logic tests

describe('patient-local date bucketing', () => {
  it('buckets a 23:30 local entry to that local date, not the UTC date', () => {
    // In Bogotá (UTC-5) 2026-07-01 23:30 local is 2026-07-02 04:30 UTC.
    // ISO() must use LOCAL date parts regardless of the runtime TZ.
    const lateNight = new Date(2026, 6, 1, 23, 30, 0)
    expect(ISO(lateNight)).toBe('2026-07-01')
  })

  it('buckets a 00:10 local entry to the new local day', () => {
    expect(ISO(new Date(2026, 6, 2, 0, 10, 0))).toBe('2026-07-02')
  })

  it('dayDiff counts calendar days and is stable across DST-style offsets', () => {
    expect(dayDiff(new Date(2026, 6, 2), new Date(2026, 6, 1))).toBe(1)
    expect(dayDiff(new Date(2026, 6, 1, 23, 59), new Date(2026, 6, 1, 0, 1))).toBe(0)
    // US spring-forward window (Mar 8 2026): still exactly 7 calendar days
    expect(dayDiff(new Date(2026, 2, 12), new Date(2026, 2, 5))).toBe(7)
  })
})

describe('cycle timeline', () => {
  const plan = buildPlan({
    carePlanId: 1, planName: 'Test', planKind: 'cyclical', anchorDate: '2026-06-01',
    cycleLength: 21, coldCare: true, coldWindowDays: 6,
    blocks: { phases: [{ phase: 'infusion', day: 1, label: 'Infusion', mark: 'infusion' }], vitals: ['temp'] },
  })!

  it('maps the anchor date to Cycle 1 Day 1', () => {
    const info = timeline(new Date(2026, 5, 1), plan, t)
    expect(info.cycle).toBe(1); expect(info.day).toBe(1)
    expect(info.mark).toBe('infusion'); expect(info.cold).toBe(true)
  })

  it('wraps into the next cycle after cycleLength days', () => {
    const info = timeline(new Date(2026, 5, 22), plan, t) // day 22 → cycle 2 day 1
    expect(info.cycle).toBe(2); expect(info.day).toBe(1)
  })

  it('flags days before the anchor as pre-treatment', () => {
    expect(timeline(new Date(2026, 4, 20), plan, t).phase).toBe('pre')
  })
})

describe('server entry hydration', () => {
  it('maps a snapshot back into a full client entry marked synced', () => {
    const e = fromServerEntry({
      vitals: { temp: '38.6', sys: '128', pain: '6' },
      meds: { m1: true }, prn: { p1: 2 }, bowel: 3, diarrhea: true,
      areas: ['hands'], notes: 'rough evening',
      device: { synced: true, steps: '4200' },
    })
    expect(e.temp).toBe('38.6'); expect(e.sys).toBe('128'); expect(e.pain).toBe(6)
    expect(e.meds.m1).toBe(true); expect(e.prn.p1).toBe(2)
    expect(e.bowel).toBe(3); expect(e.diarrhea).toBe(true)
    expect(e.areas).toEqual(['hands']); expect(e.notes).toBe('rough evening')
    expect(e.device.steps).toBe('4200')
    expect(e._sync).toBe('ok')
  })

  it('tolerates malformed snapshots', () => {
    expect(fromServerEntry(null)).toEqual(emptyEntry())
    expect(fromServerEntry({ vitals: null, areas: 'nope' }).areas).toEqual([])
  })
})

describe('red flags', () => {
  const plan = buildPlan({
    carePlanId: 1, planName: 'Test', planKind: 'cyclical', anchorDate: '2026-06-01',
    blocks: { red_flag_rules: [{ metric: 'temp', op: '>=', value: 38.3, msg: 'Call your team', k: 'Fever' }], vitals: ['temp'] },
  })!

  it('fires on threshold and stays quiet on empty input', () => {
    expect(redFlags({ ...emptyEntry(), temp: '38.4' }, plan)).toHaveLength(1)
    expect(redFlags({ ...emptyEntry(), temp: '37.2' }, plan)).toHaveLength(0)
    expect(redFlags(emptyEntry(), plan)).toHaveLength(0)
  })
})
