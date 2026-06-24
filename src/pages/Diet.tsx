import { useState } from 'react'
import { C, Card, Ico, Button, useLocal } from '../lib/ui'
import AiPanel from '../lib/AiPanel'

type Meal = { id: number; meal: string; desc: string; at: string }

export default function Diet() {
  const [entries, setEntries] = useLocal<Meal[]>('cmp_diet_today', [
    { id: 1, meal: 'Breakfast', desc: 'Oatmeal, banana, water', at: '8:10 AM' },
  ])
  const [meal, setMeal] = useState('Lunch')
  const [desc, setDesc] = useState('')

  const add = () => {
    if (!desc.trim()) return
    setEntries([...entries, { id: Date.now(), meal, desc: desc.trim(), at: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }])
    setDesc('')
  }
  const inp: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 9, padding: '11px 13px', color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif' }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Diet</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Log what you eat and drink. It helps your team spot patterns in your recovery.</p>

      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={meal} onChange={e => setMeal(e.target.value)} style={{ ...inp, minWidth: 130 }}>
            {['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink'].map(m => <option key={m}>{m}</option>)}
          </select>
          <input value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="What did you have?" style={{ ...inp, flex: 1, minWidth: 200 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> Add</Button>
        </div>
      </Card>

      <div style={{ display: 'grid', gap: 10 }}>
        {entries.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>Nothing logged yet today.</p>}
        {entries.map(e => (
          <Card key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{e.meal}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{e.desc}</div>
            </div>
            <span style={{ fontSize: 12.5, color: C.subtle }}>{e.at}</span>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <AiPanel
          topic="diet"
          label="Ask about eating well for your recovery"
          context="Patient is in post-surgery / treatment recovery. Provide general, encouraging nutrition education only."
          suggested={['Why does protein matter in recovery?', 'Foods that support healing?', 'Is it okay to have coffee?']}
          disclaimer="General nutrition education only — not a diet plan. For meal plans or restrictions specific to you, your care team or a registered dietitian is the right place. In an emergency, call your local emergency number."
          storageKey="cmp_diet_ai"
        />
      </div>
    </div>
  )
}
