import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listVitals, addVital } from '../lib/data'

const DEVICES = ['Apple Health', 'Google Health Connect', 'Fitbit', 'Withings']
const TYPES: [string, string][] = [
  ['heart_rate', 'bpm'], ['bp_systolic', 'mmHg'], ['spo2', '%'], ['weight_kg', 'kg'], ['temp_c', '°C'],
]

export default function Vitals() {
  const { t, lang } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listVitals(), [])
  const [type, setType] = useState(TYPES[0][0]); const [val, setVal] = useState('')
  const A = ACCENTS.vitals

  const add = async () => {
    const n = Number(val); if (!val || Number.isNaN(n)) return
    const unit = TYPES.find(x => x[0] === type)?.[1] || ''
    await addVital(ctx, type, n, unit); setVal(''); reload()
  }
  const sel: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '11px 13px', color: C.text, fontSize: 14, minWidth: 160 }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="vitals" title={t('vit.title')} sub={t('vit.subtitle')} color={A.c} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 22 }}>
        {DEVICES.map(label => (
          <Card key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Ico name="watch" size={22} color={A.c} /><span style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{label}</span></div>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.mint, cursor: 'pointer' }}>{t('vit.connect')}</span>
          </Card>
        ))}
      </div>
      <Card accent={A.c} style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={e => setType(e.target.value)} style={sel}>
            {TYPES.map(x => <option key={x[0]} value={x[0]}>{t('vit.' + x[0])}</option>)}
          </select>
          <Input placeholder={t('vit.value')} value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ maxWidth: 140 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> {t('vit.add')}</Button>
        </div>
      </Card>
      <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, color: C.text, marginBottom: 12 }}>{t('vit.recent')}</h2>
      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {data && data.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>{t('vit.none')}</p>}
        {data && data.map(r => (
          <Card key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Ico name="vitals" size={20} color={A.c} /><span style={{ fontSize: 15, color: C.text }}>{t('vit.' + r.type)}</span></div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{r.value} {r.unit}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{new Date(r.recorded_at).toLocaleString(lang, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          </Card>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>{t('vit.disclaimer')}</p>
    </div>
  )
}
