import { C, Card, Ico, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { getMyTrends } from '../lib/data'

// ── tiny inline-SVG charts (no chart lib; matches Companion's hand-rolled style)
function Sparkline({ series, color, domain }: { series: { d: string; v: number }[]; color: string; domain?: [number, number] }) {
  if (!series.length) return null
  const w = 320, h = 72, pad = 8
  const vals = series.map(s => s.v)
  const min = domain ? domain[0] : Math.min(...vals)
  const max = domain ? domain[1] : Math.max(...vals)
  const span = (max - min) || 1
  const n = series.length
  const pts = series.map((s, i) => {
    const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - 2 * pad)
    const y = h - pad - ((s.v - min) / span) * (h - 2 * pad)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  const last = series[series.length - 1]
  const lx = n === 1 ? w / 2 : w - pad
  const ly = h - pad - ((last.v - min) / span) * (h - 2 * pad)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={72} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r={3.5} fill={color} />
    </svg>
  )
}
function Bars({ series, color }: { series: { d: string; n: number }[]; color: string }) {
  if (!series.length) return null
  const w = 320, h = 72, pad = 8
  const max = Math.max(...series.map(s => s.n), 1)
  const n = series.length
  const bw = Math.max(2, ((w - 2 * pad) / n) * 0.7)
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={72} preserveAspectRatio="none" style={{ display: 'block' }}>
      {series.map((s, i) => {
        const x = pad + (i / Math.max(n, 1)) * (w - 2 * pad)
        const bh = (s.n / max) * (h - 2 * pad)
        return <rect key={i} x={x} y={h - pad - bh} width={bw} height={bh} rx={1.5} fill={color} opacity={0.85} />
      })}
    </svg>
  )
}

const VITAL_DOMAIN: Record<string, [number, number] | undefined> = {
  spo2: [85, 100], bp_systolic: undefined, bp_diastolic: undefined, heart_rate: undefined, weight_kg: undefined, temp_c: [34, 40], glucose: undefined,
}

export default function Progress() {
  const { t } = useT()
  const auth = useAuth(); ctxOf(auth)
  const { data, loading, error } = useAsync(() => getMyTrends(30), [])
  const A = ACCENTS.progress
  const s = data?.summary

  // Gentle, non-clinical framing for the pain trend.
  const trendCopy = (() => {
    if (!s) return null
    if (s.pain_trend === 'improving') return { text: t('prog.trendEasing'), color: C.mint }
    if (s.pain_trend === 'worsening') return { text: t('prog.trendMention'), color: C.gold }
    if (s.pain_trend === 'stable') return { text: t('prog.trendSteady'), color: C.muted }
    return null
  })()

  const vitalKeys = data ? Object.keys(data.vitals || {}) : []
  const vitalLabel = (k: string) => {
    const key = 'vit.' + k
    const lab = t(key)
    return lab === key ? k.replace('_', ' ') : lab
  }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="chart" title={t('prog.title')} sub={t('prog.subtitle')} color={A.c} />

      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}

      {data && (
        <>
          {/* Summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
            <Card>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{t('prog.adherence')}</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 26, color: C.mint }}>
                {s?.adherence_rate != null ? `${s.adherence_rate}%` : '—'}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{t('prog.avgMood')}</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 26, color: C.gold }}>
                {s?.avg_mood != null ? `${s.avg_mood}/5` : '—'}
              </div>
            </Card>
            <Card>
              <div style={{ fontSize: 13, color: C.muted, marginBottom: 4 }}>{t('prog.avgPain')}</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 26, color: C.text }}>
                {s?.avg_pain != null ? `${s.avg_pain}/10` : '—'}
              </div>
              {trendCopy && <div style={{ fontSize: 12.5, color: trendCopy.color, marginTop: 4 }}>{trendCopy.text}</div>}
            </Card>
          </div>

          {/* Pain & mood */}
          {data.journal.length > 0 && (
            <Card accent={A.c} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text }}>{t('prog.painMood')}</span>
                <span style={{ fontSize: 12, color: C.subtle }}>
                  <span style={{ color: '#f0a0a0' }}>● </span>{t('vit.title') && t('prog.pain')} &nbsp;
                  <span style={{ color: C.gold }}>● </span>{t('prog.mood')}
                </span>
              </div>
              <Sparkline series={data.journal.filter(j => j.pain != null).map(j => ({ d: j.d, v: j.pain as number }))} color="#f0a0a0" domain={[0, 10]} />
              <Sparkline series={data.journal.filter(j => j.mood != null).map(j => ({ d: j.d, v: j.mood as number }))} color={C.gold} domain={[0, 5]} />
            </Card>
          )}

          {/* Doses logged */}
          {data.adherence.length > 0 && (
            <Card accent={A.c} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 8 }}>{t('prog.doses')}</div>
              <Bars series={data.adherence} color={C.mint} />
            </Card>
          )}

          {/* Vitals */}
          {vitalKeys.map(k => (
            <Card accent={A.c} key={k} style={{ marginBottom: 16 }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 8 }}>{vitalLabel(k)}</div>
              <Sparkline series={data.vitals[k]} color={C.cyan} domain={VITAL_DOMAIN[k]} />
            </Card>
          ))}

          {data.journal.length === 0 && data.adherence.length === 0 && vitalKeys.length === 0 && (
            <Card><p style={{ color: C.subtle, fontSize: 14 }}>{t('prog.empty')}</p></Card>
          )}

          <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 8, lineHeight: 1.6 }}>{t('prog.disclaimer')}</p>
        </>
      )}
    </div>
  )
}
