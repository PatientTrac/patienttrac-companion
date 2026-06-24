import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listActivityToday, addActivity } from '../lib/data'
import AiPanel from '../lib/AiPanel'

export default function Exercise() {
  const { t } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listActivityToday(), [])
  const [name, setName] = useState(''); const [detail, setDetail] = useState('')
  const A = ACCENTS.exercise

  const add = async () => { if (!name.trim()) return; await addActivity(ctx, name.trim(), detail.trim()); setName(''); setDetail(''); reload() }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="exercise" title={t('ex.title')} sub={t('ex.subtitle')} color={A.c} />
      <Card accent={A.c} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input placeholder={t('ex.name')} value={name} onChange={e => setName(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <Input placeholder={t('ex.detail')} value={detail} onChange={e => setDetail(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ minWidth: 150 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> {t('ex.log')}</Button>
        </div>
      </Card>
      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 10, marginBottom: 24 }}>
        {data && data.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>{t('ex.empty')}</p>}
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
      <AiPanel topic="exercise" label={t('ex.aiLabel')}
        context="Patient is recovering after surgery with a physical-therapy plan of gentle range-of-motion and strengthening exercises. Reinforce the existing plan only."
        suggested={[t('ex.q1'), t('ex.q2'), t('ex.q3')]}
        disclaimer={t('ex.aiDisclaimer') + ' ' + t('common.emergency')}
        storageKey="cmp_exercise_ai" />
    </div>
  )
}
