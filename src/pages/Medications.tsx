import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listMeds, takenTodayIds, logMed, unlogMed, addMed } from '../lib/data'

export default function Medications() {
  const { t } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(async () => {
    const [meds, taken] = await Promise.all([listMeds(), takenTodayIds()])
    return { meds, taken }
  }, [])
  const [name, setName] = useState(''); const [dose, setDose] = useState(''); const [freq, setFreq] = useState('')
  const [adding, setAdding] = useState(false)
  const A = ACCENTS.medications

  const toggle = async (id: number, done: boolean) => { if (done) await unlogMed(id); else await logMed(ctx, id); reload() }
  const save = async () => {
    if (!name.trim()) return
    await addMed(ctx, name.trim(), dose.trim(), freq.trim())
    setName(''); setDose(''); setFreq(''); setAdding(false); reload()
  }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="pill" title={t('meds.title')} sub={t('meds.subtitle')} color={A.c} />
      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data && (
        <>
          <div style={{ display: 'grid', gap: 12 }}>
            {data.meds.length === 0 && <Card><span style={{ color: C.muted, fontSize: 14 }}>{t('meds.empty')}</span></Card>}
            {data.meds.map(m => {
              const done = data.taken.includes(m.id)
              return (
                <Card key={m.id} accent={done ? C.green : A.c} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: `linear-gradient(150deg, ${A.from}26, ${A.to}0d)`, border: `1px solid ${A.c}33`, display: 'grid', placeItems: 'center' }}><Ico name="pill" size={22} color={A.c} /></span>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 600, color: C.text }}>{m.name}{m.dose ? ` · ${m.dose}` : ''}</div>
                      {m.frequency && <div style={{ fontSize: 13, color: C.muted }}>{m.frequency}</div>}
                    </div>
                  </div>
                  <button onClick={() => toggle(m.id, done)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 600, fontFamily: 'Rajdhani,sans-serif', border: done ? 'none' : `1px solid ${C.subtle}`, background: done ? `linear-gradient(135deg, ${C.green}, ${C.mint})` : 'transparent', color: done ? C.navy950 : C.text }}>
                    <Ico name="check" size={16} color={done ? C.navy950 : C.muted} stroke={2.4} />{done ? t('meds.taken') : t('meds.mark')}
                  </button>
                </Card>
              )
            })}
          </div>
          {adding ? (
            <Card style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <Input placeholder={t('meds.name')} value={name} onChange={e => setName(e.target.value)} />
                <div style={{ display: 'flex', gap: 10 }}>
                  <Input placeholder={t('meds.dose')} value={dose} onChange={e => setDose(e.target.value)} />
                  <Input placeholder={t('meds.freq')} value={freq} onChange={e => setFreq(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <Button onClick={save}><Ico name="check" size={16} color={C.navy950} /> {t('common.save')}</Button>
                  <Button kind="ghost" onClick={() => setAdding(false)}>{t('common.cancel')}</Button>
                </div>
              </div>
            </Card>
          ) : (
            <button onClick={() => setAdding(true)} style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: `1px solid ${C.subtle}`, color: C.text, borderRadius: 10, padding: '11px 16px', fontSize: 14, cursor: 'pointer' }}>
              <Ico name="plus" size={16} color={A.c} /> {t('meds.add')}
            </button>
          )}
        </>
      )}
      <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>{t('meds.disclaimer')}</p>
    </div>
  )
}
