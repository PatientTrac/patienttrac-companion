import { useState } from 'react'
import { C, Card, Ico, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { Glow, Pulse } from '../lib/art'
import { useT } from '../lib/i18n'
import type { Lang } from '../lib/i18n'
import {
  getActivePlan,
  listSelfChartMeds,
  listEducationEntries,
  listVitals,
  translateBlock,
} from '../lib/data'
import type { SelfChartMed, TranslateResult } from '../lib/data'
import { LabsPanel, ClinicalViewerProvider } from '@patienttrac/clinical-viewer'
import { useAuth } from '../lib/auth'
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

// ── Medication card ───────────────────────────────────────────────────────────

function MedCard({ med }: { med: SelfChartMed }) {
  return (
    <div>
      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>
        {med.name}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: med.instructions ? 8 : 0 }}>
        {med.dose && (
          <span style={{ fontSize: 12.5, color: C.muted, fontFamily: 'DM Mono,monospace' }}>{med.dose}</span>
        )}
        {med.route && (
          <span style={{ fontSize: 12.5, color: C.subtle, fontFamily: 'DM Mono,monospace' }}>{med.route}</span>
        )}
        {med.frequency && (
          <span style={{ fontSize: 12.5, color: C.cyan, fontFamily: 'DM Mono,monospace' }}>{med.frequency}</span>
        )}
      </div>
      {med.instructions && (
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.65, margin: 0 }}>
          <TranslatedText table="companion_medication" id={med.id} col="instructions" text={med.instructions} />
        </p>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const CORE_CHEMO = ['oxaliplatin', 'capecitabine', 'xelox', 'xeloda', 'eloxatin', 'folfox', 'folfiri']
const isCoreChemo = (name: string) => CORE_CHEMO.some(k => name.toLowerCase().includes(k))

export default function SelfChart() {
  const { t } = useT()
  const { patientId } = useAuth()
  const A = ACCENTS.selfchart
  const [openEdu, setOpenEdu] = useState<number | null>(null)

  const { data: plan,   loading: planLoading   } = useAsync(() => getActivePlan(), [])
  const { data: meds,   loading: medsLoading   } = useAsync(() => listSelfChartMeds(), [])
  const { data: edu,    loading: eduLoading    } = useAsync(() => listEducationEntries(), [])
  const { data: vitals, loading: vitalsLoading } = useAsync(() => listVitals(), [])

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
            {plan.title}
          </div>
          {plan.condition && (
            <div style={{ fontSize: 13, color: C.gold, fontFamily: 'DM Mono,monospace', marginBottom: 12 }}>
              {plan.condition}
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
                  <MedCard med={med} />
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
                  <MedCard med={med} />
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lab results (LabsPanel from @patienttrac/clinical-viewer) ─── */}
      {patientId != null && (
        <ClinicalViewerProvider client={supabase}>
          <LabsPanel patientId={patientId} />
        </ClinicalViewerProvider>
      )}

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
