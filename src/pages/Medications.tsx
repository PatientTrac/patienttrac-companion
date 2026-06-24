import { C, Card, Ico, Button, useLocal } from '../lib/ui'

type Med = { id: number; name: string; dose: string; freq: string }
const MEDS: Med[] = [
  { id: 1, name: 'Apixaban', dose: '2.5 mg', freq: 'Twice daily' },
  { id: 2, name: 'Acetaminophen', dose: '500 mg', freq: 'Every 6 hours as needed' },
  { id: 3, name: 'Docusate', dose: '100 mg', freq: 'Once daily' },
]

export default function Medications() {
  const [taken, setTaken] = useLocal<number[]>('cmp_med_taken_ids', [1, 3])
  const toggle = (id: number) =>
    setTaken(taken.includes(id) ? taken.filter(x => x !== id) : [...taken, id])

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Medications</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>
        Tap a medication when you take it. {taken.length} of {MEDS.length} logged today.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {MEDS.map(m => {
          const done = taken.includes(m.id)
          return (
            <Card key={m.id} accent={done ? C.green : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ico name="pill" size={22} color={C.mint} />
                </span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{m.name} · {m.dose}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{m.freq}</div>
                </div>
              </div>
              <button onClick={() => toggle(m.id)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', borderRadius: 9,
                padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif',
                border: done ? 'none' : `1px solid ${C.subtle}`, background: done ? C.green : 'transparent',
                color: done ? C.navy950 : C.text,
              }}>
                <Ico name="check" size={16} color={done ? C.navy950 : C.muted} stroke={2.4} />
                {done ? 'Taken' : 'Mark taken'}
              </button>
            </Card>
          )
        })}
      </div>
      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>
        This is a personal log to help you remember. It doesn't change your prescription — to start,
        stop, or adjust any medication, talk to your care team.
      </p>
    </div>
  )
}
