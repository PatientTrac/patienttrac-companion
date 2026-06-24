import { C, Card, Ico, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { getActivePlan, logEducation } from '../lib/data'
import AiPanel from '../lib/AiPanel'

export default function Treatment() {
  const { t } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data: plan, loading } = useAsync(() => getActivePlan(), [])
  const summary = plan?.plain_language || t('tr.planDefault')
  const A = ACCENTS.treatment

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="plan" title={t('tr.title')} sub={t('tr.subtitle')} color={A.c} />
      {loading && <Spinner label={t('common.loading')} />}
      <Card accent={A.c} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Ico name="heart" size={20} color={A.c} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{plan?.title || t('tr.planFallbackTitle')}</span>
        </div>
        {plan?.condition && <div style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>{plan.condition}</div>}
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.65 }}>{summary}</p>
      </Card>
      <AiPanel topic="treatment" label={t('tr.aiLabel')}
        context={summary}
        suggested={[t('tr.q1'), t('tr.q2'), t('tr.q3')]}
        disclaimer={t('tr.aiDisclaimer') + ' ' + t('common.emergency')}
        storageKey="cmp_treatment_ai"
        onExchange={(q, a) => { logEducation(ctx, plan?.id ?? null, q, a).catch(() => {}) }} />
    </div>
  )
}
