import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listDietToday, addDiet } from '../lib/data'
import AiPanel from '../lib/AiPanel'

const MEALS = ['Breakfast', 'Lunch', 'Dinner', 'Snack', 'Drink']

export default function Diet() {
  const { t } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listDietToday(), [])
  const [meal, setMeal] = useState('Lunch'); const [desc, setDesc] = useState('')
  const A = ACCENTS.diet

  const add = async () => { if (!desc.trim()) return; await addDiet(ctx, meal, desc.trim()); setDesc(''); reload() }
  const sel: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '11px 13px', color: C.text, fontSize: 14, minWidth: 130 }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="diet" title={t('diet.title')} sub={t('diet.subtitle')} color={A.c} />
      <Card accent={A.c} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={meal} onChange={e => setMeal(e.target.value)} style={sel}>
            {MEALS.map(m => <option key={m} value={m}>{t('meal.' + m)}</option>)}
          </select>
          <Input placeholder={t('diet.placeholder')} value={desc} onChange={e => setDesc(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ flex: 1, minWidth: 200 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> {t('common.add')}</Button>
        </div>
      </Card>
      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {data && data.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>{t('diet.empty')}</p>}
        {data && data.map(e => (
          <Card key={e.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{t('meal.' + (e.meal || 'Snack'))}</div>
              <div style={{ fontSize: 14, color: C.muted }}>{e.description}</div>
            </div>
            <span style={{ fontSize: 12.5, color: C.subtle }}>{new Date(e.logged_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
          </Card>
        ))}
      </div>
      <AiPanel topic="diet" label={t('diet.aiLabel')}
        context="Patient is in post-surgery / treatment recovery. Provide general, encouraging nutrition education only."
        suggested={[t('diet.q1'), t('diet.q2'), t('diet.q3')]}
        disclaimer={t('diet.aiDisclaimer') + ' ' + t('common.emergency')}
        storageKey="cmp_diet_ai" />
    </div>
  )
}
