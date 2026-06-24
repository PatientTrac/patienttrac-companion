import { useState } from 'react'
import { C, Card, Ico, Button, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listJournal, addJournal } from '../lib/data'

const MOODS = ['😣', '😕', '😐', '🙂', '😄']

export default function Journal() {
  const { t, lang } = useT()
  const auth = useAuth(); const ctx = ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listJournal(), [])
  const [mood, setMood] = useState(3); const [pain, setPain] = useState(2); const [note, setNote] = useState('')
  const A = ACCENTS.journal

  const save = async () => { await addJournal(ctx, mood, pain, note.trim()); setNote(''); reload() }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="journal" title={t('jr.title')} sub={t('jr.subtitle')} color={A.c} />
      <Card accent={A.c} style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 8 }}>{t('jr.feeling')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {MOODS.map((m, i) => (
              <button key={i} onClick={() => setMood(i + 1)} aria-label={`${i + 1}/5`} style={{ width: 48, height: 48, borderRadius: 13, fontSize: 23, cursor: 'pointer', background: mood === i + 1 ? 'rgba(52,211,153,0.18)' : C.navy900, border: `1px solid ${mood === i + 1 ? C.mint : C.subtle}` }}>{m}</button>
            ))}
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, color: C.muted, marginBottom: 8 }}>{t('jr.pain')}: <b style={{ color: C.text }}>{pain}</b> / 10</div>
          <input type="range" min={0} max={10} value={pain} onChange={e => setPain(Number(e.target.value))} style={{ width: '100%', accentColor: C.mint }} />
        </div>
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder={t('jr.note')} style={{ width: '100%', minHeight: 84, background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: 12, color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif', resize: 'vertical' }} />
        {pain >= 8 && (
          <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.3)' }}>
            <Ico name="alert" size={18} color={C.red} />
            <span style={{ fontSize: 13, color: C.text, lineHeight: 1.5 }}>{t('jr.flag')}</span>
          </div>
        )}
        <div style={{ marginTop: 16 }}><Button onClick={save}><Ico name="check" size={16} color={C.navy950} /> {t('jr.save')}</Button></div>
      </Card>
      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data && data.length > 0 && <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 20, color: C.text, marginBottom: 12 }}>{t('jr.past')}</h2>}
      <div style={{ display: 'grid', gap: 10 }}>
        {data && data.map(e => (
          <Card key={e.id} accent={e.flagged ? C.red : undefined} style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <div style={{ fontSize: 14, color: C.text }}>{e.mood ? MOODS[e.mood - 1] : '—'} · {t('jr.pain').toLowerCase()} {e.pain ?? '—'}/10</div>
              {e.note && <div style={{ fontSize: 13.5, color: C.muted, marginTop: 4 }}>{e.note}</div>}
            </div>
            <span style={{ fontSize: 12, color: C.subtle, whiteSpace: 'nowrap' }}>{new Date(e.entry_date).toLocaleDateString(lang)}</span>
          </Card>
        ))}
      </div>
    </div>
  )
}
