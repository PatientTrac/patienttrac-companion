import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, useAsync } from '../lib/ui'
import { useAuth, ctxOf } from '../lib/auth'
import { listVitals, addVital } from '../lib/data'

const DEVICES = ['Apple Health', 'Google Health Connect', 'Fitbit', 'Withings']
const TYPES: [string, string, string][] = [
  ['heart_rate', 'Heart rate', 'bpm'],
  ['bp_systolic', 'BP systolic', 'mmHg'],
  ['spo2', 'SpO₂', '%'],
  ['weight_kg', 'Weight', 'kg'],
  ['temp_c', 'Temperature', '°C'],
]
const LABEL: Record<string, string> = Object.fromEntries(TYPES.map(t => [t[0], t[1]]))

export default function Vitals() {
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listVitals(), [])
  const [type, setType] = useState(TYPES[0][0]); const [val, setVal] = useState('')

  const add = async () => {
    const n = Number(val); if (!val || Number.isNaN(n)) return
    const unit = TYPES.find(t => t[0] === type)?.[2] || ''
    await addVital(ctx, type, n, unit); setVal(''); reload()
  }
  const sel: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 9, padding: '11px 13px', color: C.text, fontSize: 14, minWidth: 150 }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Vitals & devices</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Connect a watch or device to record your vitals automatically — or add a reading by hand.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 22 }}>
        {DEVICES.map(label => (
          <Card key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><Ico name="watch" size={22} color={C.cyan} /><span style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{label}</span></div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.mint, cursor: 'pointer' }}>Connect</span>
          </Card>
        ))}
      </div>

      <Card style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={type} onChange={e => setType(e.target.value)} style={sel}>
            {TYPES.map(t => <option key={t[0]} value={t[0]}>{t[1]}</option>)}
          </select>
          <Input placeholder="Value" value={val} onChange={e => setVal(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} style={{ maxWidth: 140 }} />
          <Button onClick={add}><Ico name="plus" size={16} color={C.navy950} /> Add reading</Button>
        </div>
      </Card>

      <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, color: C.text, marginBottom: 12 }}>Recent readings</h2>
      {loading && <Spinner />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {data && data.length === 0 && <p style={{ color: C.subtle, fontSize: 14 }}>No readings yet.</p>}
        {data && data.map(r => (
          <Card key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><Ico name="vitals" size={20} color={C.cyan} /><span style={{ fontSize: 15, color: C.text }}>{LABEL[r.type] || r.type}</span></div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{r.value} {r.unit}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{new Date(r.recorded_at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          </Card>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>
        Readings from consumer watches and devices are for information only and aren't a medical diagnosis. If something doesn't feel right, contact your care team.
      </p>
    </div>
  )
}
