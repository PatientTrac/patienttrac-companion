import { useMemo, useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listVitalsRange, addVital, type Vital } from '../lib/data'

// Device sync is not live yet. Apple Health / Google Health Connect are
// on-device APIs that require the native mobile app; Fitbit / Withings are
// server-side and pending developer credentials + a signed BAA.
const DEVICES: { label: string; status: 'app' | 'soon' }[] = [
  { label: 'Apple Health', status: 'app' },
  { label: 'Google Health Connect', status: 'app' },
  { label: 'Fitbit', status: 'soon' },
  { label: 'Withings', status: 'soon' },
]
// Manual-entry vocabulary: [db type, unit stored with a hand-typed value].
const TYPES: [string, string][] = [
  ['heart_rate', 'bpm'], ['bp_systolic', 'mmHg'], ['spo2', '%'], ['weight_kg', 'kg'], ['temp_c', '°C'],
]
// Fixed categorical color per vital (identity, not rank — drawn from the app palette).
const VITAL_COLOR: Record<string, string> = {
  resting_heart_rate: C.cyan, heart_rate: C.red, active_energy: C.gold,
  spo2: C.mint, bp_systolic: C.violet, weight_kg: C.mint, temp_c: C.amber,
}
const vColor = (ty: string) => VITAL_COLOR[ty] ?? C.mint
// Period tabs: [i18n suffix, day count].
const PERIODS: [string, number][] = [['today', 1], ['p7', 7], ['p30', 30], ['p90', 90]]

const pad = (n: number) => String(n).padStart(2, '0')
// Patient-LOCAL YYYY-MM-DD bucket (never UTC).
const dayKey = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const round1 = (n: number) => Math.round(n * 10) / 10
const fmtN = (n: number) => Math.abs(n) >= 100 ? Math.round(n) : round1(n)

type Stat = { count: number; avg: number; min: number; max: number; latestIso: string; unit: string | null }
function agg(rs: Vital[]): Stat {
  const v = rs.map(r => r.value)
  return { count: rs.length, avg: v.reduce((a, b) => a + b, 0) / rs.length, min: Math.min(...v), max: Math.max(...v), latestIso: rs[0].recorded_at, unit: rs[0].unit }
}

// Comparison chart: one bar per day for the selected vital's daily average.
function BarRow({ series, color, dateLabel }: { series: { dk: string; stat: Stat }[]; color: string; dateLabel: (dk: string) => string }) {
  const avgs = series.map(s => s.stat.avg)
  const lo = Math.min(...avgs), hi = Math.max(...avgs), span = hi - lo || 1, H = 120
  const many = series.length > 12
  const last = series.length - 1
  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, padding: '12px 6px 2px',
      background: `linear-gradient(180deg, ${color}0a, transparent)`, boxShadow: `inset 0 -1px 0 ${color}33` }}>
      <div style={{
        display: 'flex', gap: 6, alignItems: 'flex-end', minHeight: H + 42, minWidth: series.length * 30,
        backgroundImage: 'repeating-linear-gradient(180deg, transparent 0, transparent 31px, rgba(255,255,255,0.045) 31px, rgba(255,255,255,0.045) 32px)',
        backgroundSize: '100% 32px', backgroundPosition: '0 6px',
      }}>
        {series.map(({ dk, stat }, i) => {
          const h = 16 + Math.round(((stat.avg - lo) / span) * (H - 16))
          const hot = i === last
          return (
            <div key={dk} title={`${dateLabel(dk)} · ${fmtN(stat.avg)} ${stat.unit ?? ''} (${fmtN(stat.min)}–${fmtN(stat.max)}, ${stat.count})`}
              style={{ flex: '1 0 24px', minWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, position: 'relative', zIndex: 1 }}>
              <span style={{ fontSize: 10.5, color: hot ? color : C.muted, fontFamily: 'DM Mono,monospace', fontWeight: hot ? 700 : 400 }}>{fmtN(stat.avg)}</span>
              <div className="cmp-bar" style={{
                position: 'relative', width: '68%', maxWidth: 22, height: h, borderRadius: '6px 6px 2px 2px',
                background: `linear-gradient(180deg, ${color}, ${color}55)`,
                boxShadow: `0 0 ${hot ? 16 : 9}px ${color}${hot ? 'aa' : '55'}, inset 0 1px 0 rgba(255,255,255,0.5)`,
                animationDelay: `${i * 0.03}s`,
              }}>
                <span style={{ position: 'absolute', top: -3, left: '50%', transform: 'translateX(-50%)', width: hot ? 6 : 4, height: hot ? 6 : 4, borderRadius: '50%', background: '#fff', boxShadow: `0 0 8px ${color}` }} />
              </div>
              <span style={{ fontSize: 9.5, color: hot ? C.text : C.subtle, whiteSpace: 'nowrap', transform: many ? 'rotate(-45deg)' : 'none', transformOrigin: 'top center', marginTop: many ? 4 : 0 }}>{dateLabel(dk)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const h2Style: React.CSSProperties = { fontFamily: 'Rajdhani,sans-serif', fontSize: 20, color: C.text, marginBottom: 12 }
const tile = (c: string): React.CSSProperties => ({ position: 'relative', overflow: 'hidden', borderRadius: 16, padding: 16, background: `linear-gradient(150deg, ${c}22, ${c}0a)`, border: `1px solid ${c}33` })

export default function Vitals() {
  const { t, lang } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const [type, setType] = useState(TYPES[0][0]); const [val, setVal] = useState('')
  const [vital, setVital] = useState<string>('all')
  const [days, setDays] = useState(7)
  // Overview: all types over a wide window — feeds the chip list + Today tiles (stable across selection).
  const ov = useAsync(() => listVitalsRange(90), [])
  // View: the actual DB search driven by the current selection (vital + period). Re-queries on change.
  const vw = useAsync(() => listVitalsRange(days, vital === 'all' ? undefined : vital), [days, vital])
  const A = ACCENTS.vitals
  const rows = ov.data ?? []

  const label = (ty: string) => { const k = 'vit.' + ty; const s = t(k); return s === k ? ty.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : s }
  const countLabel = (n: number) => n === 1 ? t('vit.reading1') : t('vit.readingsN', { n })
  const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' })
  const dateLabel = (dk: string) => { const [y, m, d] = dk.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(lang, { month: 'short', day: 'numeric' }) }

  const add = async () => {
    const n = Number(val); if (!val || Number.isNaN(n)) return
    const unit = TYPES.find(x => x[0] === type)?.[1] || ''
    await addVital(ctx, type, n, unit); setVal(''); ov.reload(); vw.reload()
  }

  const todayK = dayKey(new Date().toISOString())
  const dayHeading = (dk: string) => { const [y, m, d] = dk.split('-').map(Number); return dk === todayK ? t('vit.today') : new Date(y, m - 1, d).toLocaleDateString(lang, { weekday: 'short', month: 'short', day: 'numeric' }) }

  const presentTypes = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = []
    for (const r of rows) if (!seen.has(r.type)) { seen.add(r.type); out.push(r.type) }
    return out
  }, [rows])

  // View rows already come back filtered by the DB (period + type) for the current selection.
  const inRange = vw.data ?? []

  const todayByType = useMemo(() => {
    const m: Record<string, Vital[]> = {}
    for (const r of rows) if (dayKey(r.recorded_at) === todayK) (m[r.type] ||= []).push(r)
    return m
  }, [rows, todayK])

  // inRange grouped: day -> type -> readings, days descending
  const byDay = useMemo(() => {
    const m = new Map<string, Map<string, Vital[]>>()
    for (const r of inRange) {
      const dk = dayKey(r.recorded_at)
      if (!m.has(dk)) m.set(dk, new Map())
      const tm = m.get(dk)!; if (!tm.has(r.type)) tm.set(r.type, [])
      tm.get(r.type)!.push(r)
    }
    return [...m.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1)
  }, [inRange])

  // single-vital comparison series, ascending by date
  const series = useMemo(() => (
    vital === 'all' ? [] : byDay.map(([dk, tm]) => ({ dk, stat: agg(tm.get(vital)!) })).sort((a, b) => a.dk < b.dk ? -1 : 1)
  ), [byDay, vital])

  const sel: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '11px 13px', color: C.text, fontSize: 14, minWidth: 160 }
  const chip = (active: boolean, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px', borderRadius: 999, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif', whiteSpace: 'nowrap',
    border: `1px solid ${active ? color : 'rgba(255,255,255,0.10)'}`, background: active ? `${color}1f` : 'transparent', color: active ? C.text : C.muted,
  })

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="vitals" title={t('vit.title')} sub={t('vit.subtitle')} color={A.c} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 18 }}>
        {DEVICES.map(d => (
          <Card key={d.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Ico name="watch" size={22} color={A.c} /><span style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{d.label}</span></div>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.subtle }}>{t(d.status === 'app' ? 'vit.requiresApp' : 'vit.comingSoon')}</span>
          </Card>
        ))}
      </div>

      <Card accent={A.c} style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={e => setType(e.target.value)} style={sel}>
            {TYPES.map(x => <option key={x[0]} value={x[0]}>{label(x[0])}</option>)}
          </select>
          <Input placeholder={t('vit.value')} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ maxWidth: 140 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> {t('vit.add')}</Button>
        </div>
      </Card>

      {ov.loading && <Spinner label={t('common.loading')} />}
      {ov.error && <p style={{ color: C.red, fontSize: 14 }}>{ov.error}</p>}

      {!ov.loading && !ov.error && presentTypes.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>{t('vit.none')}</p>}

      {!ov.loading && !ov.error && presentTypes.length > 0 && (
        <>
          <h2 style={h2Style}>{t('vit.today')}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 22 }}>
            {presentTypes.map(ty => {
              const rs = todayByType[ty]; const c = vColor(ty); const latest = rs?.[0]
              return (
                <div key={ty} style={tile(c)}>
                  <div style={{ position: 'absolute', right: -14, top: -14, width: 64, height: 64, borderRadius: '50%', background: `radial-gradient(circle, ${c}30, transparent 70%)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                    <span style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '.05em', fontFamily: 'DM Mono,monospace' }}>{label(ty)}</span>
                  </div>
                  {latest ? (
                    <>
                      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 25, color: C.text, lineHeight: 1 }}>{fmtN(latest.value)} <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{latest.unit}</span></div>
                      <div style={{ fontSize: 11.5, color: C.subtle, marginTop: 5 }}>{countLabel(rs.length)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 13, color: C.subtle, fontFamily: 'Rajdhani,sans-serif', paddingTop: 4 }}>{t('vit.noneToday')}</div>
                  )}
                </div>
              )
            })}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span onClick={() => setVital('all')} style={chip(vital === 'all', C.mint)}>{t('vit.allVitals')}</span>
              {presentTypes.map(ty => (
                <span key={ty} onClick={() => setVital(ty)} style={chip(vital === ty, vColor(ty))}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: vColor(ty) }} />{label(ty)}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, background: C.navy900, borderRadius: 999, padding: 4, border: '1px solid rgba(255,255,255,0.08)' }}>
              {PERIODS.map(([k, dnum]) => (
                <span key={k} onClick={() => setDays(dnum)} style={{
                  padding: '6px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif',
                  background: days === dnum ? A.c : 'transparent', color: days === dnum ? C.navy950 : C.muted,
                }}>{t('vit.' + k)}</span>
              ))}
            </div>
          </div>

          {vw.error ? (
            <p style={{ color: C.red, fontSize: 14 }}>{vw.error}</p>
          ) : vw.loading && !vw.data ? (
            <Spinner label={t('common.loading')} />
          ) : inRange.length === 0 ? (
            <p style={{ color: C.subtle, fontSize: 14 }}>{t('vit.noneRange')}</p>
          ) : (
            <>
              {vital !== 'all' && series.length > 0 && (
                <Card style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
                    <span style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 17, fontWeight: 700, color: C.text }}>{label(vital)}</span>
                    <span style={{ fontSize: 12, color: C.subtle, fontFamily: 'DM Mono,monospace' }}>{t('vit.byDay')} · {t('vit.avg')}</span>
                  </div>
                  <BarRow series={series} color={vColor(vital)} dateLabel={dateLabel} />
                </Card>
              )}
              {vital === 'all' ? (
            <div style={{ display: 'grid', gap: 12 }}>
              {byDay.map(([dk, tm]) => (
                <Card key={dk}>
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 15, color: C.text, marginBottom: 12 }}>{dayHeading(dk)}</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
                    {[...tm.entries()].map(([ty, rs]) => {
                      const s = agg(rs); const c = vColor(ty)
                      return (
                        <div key={ty} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 12, background: C.navy900, border: `1px solid ${c}22` }}>
                          <span style={{ width: 9, height: 9, borderRadius: '50%', background: c, flexShrink: 0 }} />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ fontSize: 13, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label(ty)}</div>
                            <div style={{ fontSize: 11, color: C.subtle }}>{s.count > 1 ? `${t('vit.avg')} · ${s.count}× · ${fmtN(s.min)}–${fmtN(s.max)}` : timeLabel(s.latestIso)}</div>
                          </div>
                          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 17, color: C.text, whiteSpace: 'nowrap' }}>{fmtN(s.avg)} <span style={{ fontSize: 11, color: C.muted }}>{s.unit}</span></div>
                        </div>
                      )
                    })}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {series.slice().reverse().map(({ dk, stat: s }) => (
                <Card key={dk} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: vColor(vital) }} />
                    <div>
                      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 15, color: C.text }}>{dayHeading(dk)}</div>
                      <div style={{ fontSize: 11.5, color: C.subtle }}>{s.count > 1 ? `${countLabel(s.count)} · ${t('vit.range')} ${fmtN(s.min)}–${fmtN(s.max)}` : `${countLabel(s.count)} · ${timeLabel(s.latestIso)}`}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 20, color: C.text }}>{fmtN(s.avg)} <span style={{ fontSize: 12, color: C.muted }}>{s.unit}</span></div>
                    {s.count > 1 && <div style={{ fontSize: 11, color: C.subtle }}>{t('vit.avg')}</div>}
                  </div>
                </Card>
              ))}
            </div>
          )}
            </>
          )}
        </>
      )}

      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>{t('vit.disclaimer')}</p>
    </div>
  )
}
