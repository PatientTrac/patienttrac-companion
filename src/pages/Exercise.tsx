import { useState } from 'react'
import { C, Card, Ico, Button, useLocal } from '../lib/ui'
import AiPanel from '../lib/AiPanel'

type Move = { id: number; name: string; detail: string; at: string }

export default function Exercise() {
  const [log, setLog] = useLocal<Move[]>('cmp_exercise_today', [
    { id: 1, name: 'Ankle pumps', detail: '2 sets of 15', at: '9:20 AM' },
  ])
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')

  const add = () => {
    if (!name.trim()) return
    setLog([...log, { id: Date.now(), name: name.trim(), detail: detail.trim(), at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }])
    setName(''); setDetail('')
  }
  const inp: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 9, padding: '11px 13px', color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif' }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Exercise & movement</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>
        Track the gentle movement and rehab exercises from your plan, and learn the why behind them.
      </p>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Exercise (e.g. heel slides)" style={{ ...inp, flex: 1, minWidth: 180 }} />
          <input value={detail} onChange={e => setDetail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Sets / reps / minutes" style={{ ...inp, minWidth: 150 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> Log</Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {log.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>Nothing logged yet today.</p>}
        {log.map(m => (
          <Card key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{m.name}</div>
              {m.detail && <div style={{ fontSize: 14, color: C.muted }}>{m.detail}</div>}
            </div>
            <span style={{ fontSize: 12.5, color: C.subtle }}>{m.at}</span>
          </Card>
        ))}
      </div>

      <AiPanel
        topic="exercise"
        label="Learn about your movement plan"
        context="Patient is recovering after total knee replacement and has a physical-therapy plan of gentle range-of-motion and strengthening exercises. Reinforce the existing plan only."
        suggested={['Why are ankle pumps important?', 'What does range of motion mean?', 'How do I know if I am overdoing it?']}
        disclaimer="This explains the kind of movement in your plan in general terms. It won't add new exercises or change your routine — your physical therapist and care team set that. Stop and contact them if movement causes new or worse pain; call your local emergency number in an emergency."
        storageKey="cmp_exercise_ai"
      />
    </div>
  )
}
