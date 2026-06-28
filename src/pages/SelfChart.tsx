import { useState, useMemo } from 'react'
import { C, Card, Ico, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { Glow, Pulse } from '../lib/art'
import { useT } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import {
  getActivePlan,
  listSelfChartMeds,
  listEducationEntries,
  listVitals,
  listLabResults,
  translateBlock,
} from '../lib/data'
import type { SelfChartMed, LabResult, TranslateResult } from '../lib/data'
import { supabase } from '../lib/supabase'

// ── Translation wrapper ───────────────────────────────────────────────────────
// Shows English immediately; swaps to translated text for ES/FR once resolved.
// Falls back silently to English on any edge function error.

function TranslatedText({
  table, id, col, text, style,
}: {
  table: string; id: number | null; col: string; text: string
  style?: React.CSSProperties
}) {
  const { lang, t } = useT()
  const { data: result, loading } = useAsync<TranslateResult | null>(
    () => (lang !== 'en' && id != null)
      ? translateBlock(table, id, col, lang as Exclude<Lang, 'en'>)
      : Promise.resolve(null),
    [table, id, col, lang]
  )
  const displayText = (lang !== 'en' && !loading && result?.translated_text) ? result.translated_text : text
  const badge = lang !== 'en' && !loading && result?.is_machine_translated && !result?.reviewed_by

  return (
    <span style={style}>
      {displayText}
      {badge && (
        <span style={{
          display: 'inline-block', marginLeft: 7, fontSize: 10, color: C.subtle,
          fontFamily: 'DM Mono,monospace', border: `1px solid ${C.subtle}`,
          borderRadius: 4, padding: '1px 5px', verticalAlign: 'middle', lineHeight: 1.4,
        }}>
          {t('sc.autoTranslated')}
        </span>
      )}
    </span>
  )
}

// ── Localized drug info from RPC ──────────────────────────────────────────────

type LocalizedDrug = {
  name: string
  role?: string
  dose?: string
  route?: string
  schedule?: string
  routeLabel?: string
  scheduleLabel?: string
  instruction?: string
}

async function fetchLocalizedCarePlan(lang: string, carePlanId?: number | null): Promise<{ drugs: LocalizedDrug[]; planName?: string; conditionLabel?: string }> {
  try {
    const sess = await supabase.auth.getSession()
    const token = sess.data.session?.access_token
    if (!token) return { drugs: [] }
    const params = new URLSearchParams({ locale: lang })
    if (carePlanId) params.set('carePlanId', String(carePlanId))
    const res = await fetch(`/api/companion-care-plan-current?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return { drugs: [] }
    const body = await res.json()
    return {
      drugs: body.current?.drugs ?? [],
      planName: body.current?.planName,
      conditionLabel: body.current?.conditionLabel,
    }
  } catch {
    return { drugs: [] }
  }
}

// ── Medication card ───────────────────────────────────────────────────────────

function MedCard({ med, localizedDrug }: { med: SelfChartMed; localizedDrug?: LocalizedDrug }) {
  const routeDisplay = localizedDrug?.routeLabel || med.route
  const scheduleDisplay = localizedDrug?.scheduleLabel || med.frequency
  const instructionDisplay = localizedDrug?.instruction || med.instructions

  return (
    <div>
      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>
        {med.name}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: instructionDisplay ? 8 : 0 }}>
        {med.dose && (
          <span style={{ fontSize: 12.5, color: C.muted, fontFamily: 'DM Mono,monospace' }}>{med.dose}</span>
        )}
        {routeDisplay && (
          <span style={{ fontSize: 12.5, color: C.subtle, fontFamily: 'DM Mono,monospace' }}>{routeDisplay}</span>
        )}
        {scheduleDisplay && (
          <span style={{ fontSize: 12.5, color: C.cyan, fontFamily: 'DM Mono,monospace' }}>{scheduleDisplay}</span>
        )}
      </div>
      {instructionDisplay && (
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.65, margin: 0 }}>
          {instructionDisplay}
        </p>
      )}
    </div>
  )
}

// ── Sparkline (inline SVG) ────────────────────────────────────────────────────

function Sparkline({ values, color = C.cyan }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const w = 60, h = 20, pad = 2
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad)
    const y = h - pad - ((v - min) / range) * (h - 2 * pad)
    return `${x},${y}`
  })
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── Labs flowsheet grid ──────────────────────────────────────────────────────

function LabsFlowsheet({ labs }: { labs: LabResult[] }) {
  const { t } = useT()
  const [mode, setMode] = useState<'grid' | 'list'>('grid')

  const { dates, tests, matrix } = useMemo(() => {
    const dateSet = new Set<string>()
    const testMap = new Map<string, { unit: string | null; rows: Map<string, { value: string | null; abnormal: boolean | null; ref: string | null }> }>()
    for (const lab of labs) {
      dateSet.add(lab.lab_date)
      const key = lab.lab_name
      if (!testMap.has(key)) testMap.set(key, { unit: lab.result_unit, rows: new Map() })
      testMap.get(key)!.rows.set(lab.lab_date, { value: lab.result_value, abnormal: lab.is_abnormal, ref: lab.reference_range })
    }
    const dates = Array.from(dateSet).sort()
    const tests = Array.from(testMap.entries()).map(([name, info]) => ({ name, unit: info.unit, rows: info.rows }))
    return { dates, tests, matrix: testMap }
  }, [labs])

  const fmtDate = (s: string) => {
    const d = new Date(s + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (labs.length === 0) {
    return (
      <Card style={{ marginBottom: 22 }}>
        <p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('sc.labsEmpty')}</p>
      </Card>
    )
  }

  return (
    <div style={{ marginBottom: 22 }}>
      {/* toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button onClick={() => setMode('grid')} style={{
          fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
          color: mode === 'grid' ? C.navy950 : C.muted,
          background: mode === 'grid' ? C.cyan : 'transparent',
          border: `1px solid ${mode === 'grid' ? C.cyan : C.subtle}`,
        }}>{t('sc.labsGrid')}</button>
        <button onClick={() => setMode('list')} style={{
          fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
          color: mode === 'list' ? C.navy950 : C.muted,
          background: mode === 'list' ? C.cyan : 'transparent',
          border: `1px solid ${mode === 'list' ? C.cyan : C.subtle}`,
        }}>{t('sc.labsList')}</button>
      </div>

      {mode === 'list' ? (
        /* List view — one card per result */
        <div>
          {labs.slice().reverse().map(lab => (
            <Card key={lab.id} style={{ marginBottom: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{lab.lab_name}</span>
                  {lab.result_unit && <span style={{ fontSize: 12, color: C.subtle, marginLeft: 6 }}>{lab.result_unit}</span>}
                </div>
                <span style={{ fontSize: 12, color: C.muted, fontFamily: 'DM Mono,monospace' }}>{fmtDate(lab.lab_date)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
                <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: lab.is_abnormal ? C.red : C.text }}>
                  {lab.result_value ?? '—'}
                </span>
                {lab.is_abnormal && <span style={{ fontSize: 10, fontWeight: 700, color: C.red, textTransform: 'uppercase' }}>{t('sc.abnormal')}</span>}
                {lab.reference_range && <span style={{ fontSize: 11, color: C.subtle }}>{t('sc.refRange')} {lab.reference_range}</span>}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        /* Grid view — test x date matrix */
        <div style={{ overflowX: 'auto', borderRadius: 14, border: `1px solid rgba(255,255,255,0.07)` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: 'DM Mono,monospace' }}>
            <thead>
              <tr style={{ background: C.navy800 }}>
                <th style={{ position: 'sticky', left: 0, zIndex: 2, background: C.navy800, padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: C.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `1px solid ${C.subtle}33`, minWidth: 160 }}>
                  Test
                </th>
                {dates.map(d => (
                  <th key={d} style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: C.muted, fontSize: 11, borderBottom: `1px solid ${C.subtle}33`, whiteSpace: 'nowrap' }}>
                    {fmtDate(d)}
                  </th>
                ))}
                <th style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 600, color: C.muted, fontSize: 11, borderBottom: `1px solid ${C.subtle}33`, whiteSpace: 'nowrap' }}>
                  Trend
                </th>
              </tr>
            </thead>
            <tbody>
              {tests.map(test => {
                const numericValues: number[] = []
                for (const d of dates) {
                  const cell = test.rows.get(d)
                  if (cell?.value) { const n = parseFloat(cell.value); if (!isNaN(n)) numericValues.push(n) }
                }
                return (
                  <tr key={test.name} style={{ borderBottom: `1px solid ${C.subtle}1a` }}>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: C.navy900, padding: '8px 14px', fontWeight: 600, color: C.text, fontSize: 13 }}>
                      {test.name}
                      {test.unit && <span style={{ display: 'block', fontSize: 10, color: C.subtle, fontWeight: 400 }}>{test.unit}</span>}
                    </td>
                    {dates.map(d => {
                      const cell = test.rows.get(d)
                      const abn = cell?.abnormal
                      return (
                        <td key={d} style={{
                          padding: '8px 10px', textAlign: 'center', color: abn ? C.red : C.text,
                          background: abn ? `${C.red}12` : 'transparent', fontWeight: abn ? 700 : 400,
                        }} title={cell?.ref ? `${t('sc.refRange')} ${cell.ref}` : undefined}>
                          {cell?.value ?? ''}
                        </td>
                      )
                    })}
                    <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                      <Sparkline values={numericValues} color={numericValues.length > 1 ? C.cyan : C.subtle} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const CORE_CHEMO = ['oxaliplatin', 'capecitabine', 'xelox', 'xeloda', 'eloxatin', 'folfox', 'folfiri']
const isCoreChemo = (name: string) => CORE_CHEMO.some(k => name.toLowerCase().includes(k))

export default function SelfChart() {
  const { lang, t } = useT()
  const A = ACCENTS.selfchart
  const [openEdu, setOpenEdu] = useState<number | null>(null)

  const { data: plan,   loading: planLoading   } = useAsync(() => getActivePlan(), [])
  const { data: meds,   loading: medsLoading   } = useAsync(() => listSelfChartMeds(), [])
  const { data: labs,   loading: labsLoading   } = useAsync(() => listLabResults(), [])
  const { data: edu,    loading: eduLoading    } = useAsync(() => listEducationEntries(), [])
  const { data: vitals, loading: vitalsLoading } = useAsync(() => listVitals(), [])
  const { data: localizedPlan } = useAsync(() => fetchLocalizedCarePlan(lang), [lang])

  const drugMap = useMemo(() => {
    const map = new Map<string, LocalizedDrug>()
    for (const d of localizedPlan?.drugs ?? []) {
      map.set(d.name.toLowerCase(), d)
    }
    return map
  }, [localizedPlan])

  const coreMeds = (meds ?? []).filter(m => isCoreChemo(m.name))
  const otherMeds = (meds ?? []).filter(m => !isCoreChemo(m.name))

  return (
    <div className="cmp-fade-up" style={{ position: 'relative' }}>
      <Glow color={A.c} size={340} opacity={0.08} style={{ top: -100, right: -80 }} />
      <SectionHeader icon="flask" title={t('sc.title')} sub={t('sc.subtitle')} color={A.c} />

      {/* ── Care plan ──────────────────────────────────────────────────────── */}
      {planLoading && <Spinner label={t('common.loading')} />}
      {plan && (
        <Card accent={A.c} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
            <Ico name="plan" size={17} color={A.c} />
            <span style={{ fontFamily: 'DM Mono,monospace', fontWeight: 600, fontSize: 13, color: A.c, textTransform: 'uppercase', letterSpacing: '.07em' }}>
              {t('sc.carePlan')}
            </span>
          </div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 21, color: C.text, marginBottom: 4 }}>
            {localizedPlan?.planName || plan.title}
          </div>
          {(localizedPlan?.conditionLabel || plan.condition) && (
            <div style={{ fontSize: 13, color: C.gold, fontFamily: 'DM Mono,monospace', marginBottom: 12 }}>
              {localizedPlan?.conditionLabel || plan.condition}
            </div>
          )}
          {plan.plain_language && (
            <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.72, margin: 0 }}>
              <TranslatedText table="care_plan" id={plan.id} col="plain_language" text={plan.plain_language} />
            </p>
          )}
        </Card>
      )}

      {/* ── Medications ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13, marginTop: 6 }}>
        <Ico name="pill" size={16} color={ACCENTS.medications.c} />
        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>
          {t('sc.meds')}
        </span>
      </div>
      {medsLoading && <Spinner label={t('common.loading')} />}
      {!medsLoading && (!meds || meds.length === 0) && (
        <Card style={{ marginBottom: 22 }}>
          <p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('sc.medsEmpty')}</p>
        </Card>
      )}
      {!medsLoading && meds && meds.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          {coreMeds.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono,monospace', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>
                {t('sc.medsCore')}
              </div>
              {coreMeds.map(med => (
                <Card key={med.id} accent={ACCENTS.medications.c} style={{ marginBottom: 10 }}>
                  <MedCard med={med} localizedDrug={drugMap.get(med.name.toLowerCase())} />
                </Card>
              ))}
            </div>
          )}
          {otherMeds.length > 0 && (
            <div>
              {coreMeds.length > 0 && (
                <div style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono,monospace', letterSpacing: '.07em', textTransform: 'uppercase', marginBottom: 8 }}>
                  {t('sc.medsActive')}
                </div>
              )}
              {otherMeds.map(med => (
                <Card key={med.id} style={{ marginBottom: 10 }}>
                  <MedCard med={med} localizedDrug={drugMap.get(med.name.toLowerCase())} />
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lab results ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13, marginTop: 6 }}>
        <Ico name="flask" size={16} color={A.c} />
        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>
          {t('sc.labs')}
        </span>
      </div>
      {labsLoading && <Spinner label={t('common.loading')} />}
      {!labsLoading && <LabsFlowsheet labs={labs ?? []} />}

      {/* ── Education accordion ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13, marginTop: 4 }}>
        <Ico name="sparkle" size={16} color={ACCENTS.treatment.c} />
        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>
          {t('sc.edu')}
        </span>
      </div>
      {eduLoading && <Spinner label={t('common.loading')} />}
      {!eduLoading && (!edu || edu.length === 0) && (
        <Card style={{ marginBottom: 22 }}>
          <p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('sc.eduEmpty')}</p>
        </Card>
      )}
      {!eduLoading && edu && edu.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          {edu.map(entry => (
            <div key={entry.id} style={{
              background: `linear-gradient(160deg, ${C.navy800}, ${C.navy900})`,
              border: `1px solid rgba(255,255,255,0.07)`,
              borderRadius: 18, marginBottom: 10, overflow: 'hidden',
            }}>
              <button
                onClick={() => setOpenEdu(openEdu === entry.id ? null : entry.id)}
                style={{
                  width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
                  padding: '16px 20px', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 12, textAlign: 'left',
                }}
              >
                <span style={{ fontSize: 14.5, fontWeight: 600, color: C.text, lineHeight: 1.45, flex: 1 }}>
                  <TranslatedText table="companion_education" id={entry.id} col="question" text={entry.question} />
                </span>
                <span style={{ flexShrink: 0, marginTop: 2, transform: openEdu === entry.id ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>
                  <Ico name="chevron" size={16} color={C.muted} stroke={2} />
                </span>
              </button>
              {openEdu === entry.id && (
                <div style={{ padding: '0 20px 18px', borderTop: `1px solid ${C.subtle}` }}>
                  <p style={{ fontSize: 14, color: C.muted, lineHeight: 1.72, margin: '14px 0 10px' }}>
                    <TranslatedText table="companion_education" id={entry.id} col="ai_answer" text={entry.ai_answer} />
                  </p>
                  <Pulse color={ACCENTS.treatment.c} style={{ opacity: 0.35 }} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Vitals (device readings) ────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13, marginTop: 4 }}>
        <Ico name="watch" size={16} color={ACCENTS.vitals.c} />
        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>
          {t('sc.vitalsTitle')}
        </span>
      </div>
      {vitalsLoading && <Spinner label={t('common.loading')} />}
      {!vitalsLoading && (!vitals || vitals.length === 0) && (
        <Card style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 0', gap: 12 }}>
            <Ico name="watch" size={34} color={C.subtle} />
            <p style={{ color: C.subtle, fontSize: 14, margin: 0, textAlign: 'center', maxWidth: 340 }}>
              {t('sc.vitalsEmpty')}
            </p>
          </div>
        </Card>
      )}
      {!vitalsLoading && vitals && vitals.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 22 }}>
          {vitals.map(v => (
            <Card key={v.id} style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: C.muted, fontFamily: 'DM Mono,monospace', marginBottom: 4 }}>{v.type}</div>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 22, color: C.text }}>
                {v.value} <span style={{ fontSize: 13, color: C.subtle }}>{v.unit}</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
