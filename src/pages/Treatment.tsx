import { C, Card, Ico, Spinner, useAsync } from '../lib/ui'
import { useAuth, ctxOf } from '../lib/auth'
import { getActivePlan, logEducation } from '../lib/data'
import AiPanel from '../lib/AiPanel'

const DEFAULT_SUMMARY = 'Your care team will add your plan here. In the meantime you can ask general questions about recovery and what to expect.'

export default function Treatment() {
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data: plan, loading } = useAsync(() => getActivePlan(), [])
  const summary = plan?.plain_language || DEFAULT_SUMMARY

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Treatment & learning</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Understand your plan, and ask anything you're unsure about.</p>

      {loading && <Spinner />}
      <Card accent={C.mint} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Ico name="plan" size={20} color={C.mint} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 18, color: C.text }}>{plan?.title || 'Your care plan'}</span>
        </div>
        {plan?.condition && <div style={{ fontSize: 14, color: C.muted, marginBottom: 6 }}>{plan.condition}</div>}
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.65 }}>{summary}</p>
      </Card>

      <AiPanel topic="treatment" label="Ask about your plan"
        context={summary}
        suggested={['What does my recovery plan involve?', 'What warning signs should I watch for?', 'How long does recovery usually take?']}
        disclaimer="This assistant explains your plan for learning only. It can't diagnose, and it won't change your medications or doses — your care team makes those decisions. In an emergency, call your local emergency number."
        storageKey="cmp_treatment_ai"
        onExchange={(q, a) => { logEducation(ctx, plan?.id ?? null, q, a).catch(() => {}) }} />
    </div>
  )
}
