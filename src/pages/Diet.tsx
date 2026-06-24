import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, useAsync } from '../lib/ui'
import { useAuth, ctxOf } from '../lib/auth'
import { listDietToday, addDiet } from '../lib/data'
import AiPanel from '../lib/AiPanel'

export default function Diet() {
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listDietToday(), [])
  const [meal, setMeal] = useState('Lunch'); const [desc, setDesc] = useState('')

  const add = async () => {
    if (!desc.trim()) return
    await addDiet(ctx, meal, desc.trim()); setDesc(''); reload()
  }
  const sel: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 9, padding: '11px 13px', color: C.text, fontSize: 14, minWidth: 130 }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Diet</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Log what you eat and drink. It helps your team spot patterns in your recovery.</p>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={meal} onChange={e => setMeal(e.target.value)} style={sel}>
            {['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'].map(m => <option key={m}>{m}</option>)}
          </select>
          <Input placeholder="What did you have?" value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1, minWidth: 200 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> Add</Button>
        </div>
      </Card>

      {loading && <Spinner />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {data && data.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>Nothing logged yet today.</p>}
        {data && data.map(e => (
          <Card key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{e.meal}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{e.description}</div>
            </div>
            <span style={{ fontSize: 12.5, color: C.subtle }}>{new Date(e.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </Card>
        ))}
      </div>

      <AiPanel topic="diet" label="Ask about eating well for your recovery"
        context="Patient is in post-surgery / treatment recovery. Provide general, encouraging nutrition education only."
        suggested={['Why does protein matter in recovery?', 'Foods that support healing?', 'Is it okay to have coffee?']}
        disclaimer="General nutrition education only — not a diet plan. For meal plans or restrictions specific to you, your care team or a registered dietitian is the right place. In an emergency, call your local emergency number."
        storageKey="cmp_diet_ai" />
    </div>
  )
}
