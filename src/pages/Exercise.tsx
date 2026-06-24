import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, useAsync } from '../lib/ui'
import { useAuth, ctxOf } from '../lib/auth'
import { listActivityToday, addActivity } from '../lib/data'
import AiPanel from '../lib/AiPanel'

export default function Exercise() {
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listActivityToday(), [])
  const [name, setName] = useState(''); const [detail, setDetail] = useState('')

  const add = async () => {
    if (!name.trim()) return
    await addActivity(ctx, name.trim(), detail.trim()); setName(''); setDetail(''); reload()
  }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Exercise & movement</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Track the gentle movement and rehab exercises from your plan, and learn the why behind them.</p>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input placeholder="Exercise (e.g. heel slides)" value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <Input placeholder="Sets / reps / minutes" value={detail} onChange={e => setDetail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ minWidth: 150 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> Log</Button>
        </div>
      </Card>

      {loading && <Spinner />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {data && data.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>Nothing logged yet today.</p>}
        {data && data.map(m => (
          <Card key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{m.name}</div>
              {m.detail && <div style={{ fontSize: 14, color: C.muted }}>{m.detail}</div>}
            </div>
            <span style={{ fontSize: 12.5, color: C.subtle }}>{new Date(m.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </Card>
        ))}
      </div>

      <AiPanel topic="exercise" label="Learn about your movement plan"
        context="Patient is recovering after surgery with a physical-therapy plan of gentle range-of-motion and strengthening exercises. Reinforce the existing plan only."
        suggested={['Why are ankle pumps important?', 'What does range of motion mean?', 'How do I know if I am overdoing it?']}
        disclaimer="This explains the kind of movement in your plan in general terms. It won't add new exercises or change your routine — your physical therapist and care team set that. Stop and contact them if movement causes new or worse pain; call your local emergency number in an emergency."
        storageKey="cmp_exercise_ai" />
    </div>
  )
}
