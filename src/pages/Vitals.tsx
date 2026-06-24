import { C, Card, Ico } from '../lib/ui'

const DEVICES: [string, string][] = [
  ['Apple Health', 'apple_health'],
  ['Google Health Connect', 'health_connect'],
  ['Fitbit', 'fitbit'],
  ['Withings', 'withings'],
]
const READINGS: [string, string, string][] = [
  ['Heart rate', '72 bpm', 'Today 9:05 AM'],
  ['Blood pressure', '118 / 76', 'Today 8:50 AM'],
  ['Weight', '74.2 kg', 'Yesterday'],
  ['Steps', '3,140', 'Today'],
]

export default function Vitals() {
  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Vitals & devices</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Connect a watch or device to record your vitals automatically — or add a reading by hand.</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 12, marginBottom: 26 }}>
        {DEVICES.map(([label]) => (
          <Card key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Ico name="watch" size={22} color={C.cyan} />
              <span style={{ fontSize: 14.5, fontWeight: 600, color: C.text }}>{label}</span>
            </div>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.mint, cursor: 'pointer' }}>Connect</span>
          </Card>
        ))}
      </div>

      <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, color: C.text, marginBottom: 12 }}>Recent readings</h2>
      <div style={{ display: 'grid', gap: 10 }}>
        {READINGS.map(([t, v, when]) => (
          <Card key={t} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Ico name="vitals" size={20} color={C.cyan} />
              <span style={{ fontSize: 15, color: C.text }}>{t}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{v}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{when}</div>
            </div>
          </Card>
        ))}
      </div>
      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>
        Readings from consumer watches and devices are for information only and aren't a medical diagnosis.
        If something doesn't feel right, contact your care team.
      </p>
    </div>
  )
}
