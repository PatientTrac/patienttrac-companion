import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, useAsync } from '../lib/ui'
import { useAuth, ctxOf } from '../lib/auth'
import { listMeds, takenTodayIds, logMed, unlogMed, addMed } from '../lib/data'

export default function Medications() {
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(async () => {
    const [meds, taken] = await Promise.all([listMeds(), takenTodayIds()])
    return { meds, taken }
  }, [])
  const [name, setName] = useState(''); const [dose, setDose] = useState(''); const [freq, setFreq] = useState('')
  const [adding, setAdding] = useState(false)

  const toggle = async (id: number, done: boolean) => {
    if (done) await unlogMed(id); else await logMed(ctx, id); reload()
  }
  const save = async () => {
    if (!name.trim()) return
    await addMed(ctx, name.trim(), dose.trim(), freq.trim())
    setName(''); setDose(''); setFreq(''); setAdding(false); reload()
  }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Medications</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Tap a medication when you take it.</p>

      {loading && <Spinner />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}

      {data && (
        <>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.meds.length === 0 && <Card><span style={{ color: C.muted, fontSize: 14 }}>No medications yet. Add the ones from your care plan below.</span></Card>}
            {data.meds.map(m => {
              const done = data.taken.includes(m.id)
              return (
                <Card key={m.id} accent={done ? C.green : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(52,211,153,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ico name="pill" size={22} color={C.mint} /></span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{m.name}{m.dose ? ` · ${m.dose}` : ''}</div>
                      {m.frequency && <div style={{ fontSize: 13, color: C.muted }}>{m.frequency}</div>}
                    </div>
                  </div>
                  <button onClick={() => toggle(m.id, done)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', borderRadius: 9, padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif', border: done ? 'none' : `1px solid ${C.subtle}`, background: done ? C.green : 'transparent', color: done ? C.navy950 : C.text }}>
                    <Ico name="check" size={16} color={done ? C.navy950 : C.muted} stroke={2.4} />{done ? 'Taken' : 'Mark taken'}
                  </button>
                </Card>
              )
            })}
          </div>

          {adding ? (
            <Card style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <Input placeholder="Medication name" value={name} onChange={e => setName(e.target.value)} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Input placeholder="Dose (e.g. 10 mg)" value={dose} onChange={e => setDose(e.target.value)} />
                  <Input placeholder="Frequency" value={freq} onChange={e => setFreq(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button onClick={save}><Ico name="check" size={16} color={C.navy950} /> Save</Button>
                  <Button kind="ghost" onClick={() => setAdding(false)}>Cancel</Button>
                </div>
              </div>
            </Card>
          ) : (
            <button onClick={() => setAdding(true)} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1px solid ${C.subtle}`, color: C.text, borderRadius: 9, padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
              <Ico name="plus" size={16} color={C.mint} /> Add a medication
            </button>
          )}
        </>
      )}
      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>
        This is a personal log — it doesn't change your prescription. To start, stop, or adjust any medication, talk to your care team.
      </p>
    </div>
  )
}
