import { useState } from 'react'
import { C, Card, Ico } from './ui'
import { useT } from './i18n'

type Msg = { role: 'user' | 'assistant'; text: string }

export default function AiPanel({ topic, label, context, suggested, disclaimer, storageKey, onExchange }: {
  topic: 'diet' | 'exercise' | 'treatment'
  label: string
  context: string
  suggested: string[]
  disclaimer: string
  storageKey: string
  onExchange?: (question: string, answer: string) => void
}) {
  const { t } = useT()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  const ask = async (question: string) => {
    const text = question.trim()
    if (!text || busy) return
    setQ(''); setBusy(true)
    const next: Msg[] = [...msgs, { role: 'user', text }]
    setMsgs(next)
    try {
      const res = await fetch('/api/companion-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, question: text, context }),
      })
      if (!res.ok) throw new Error('bad')
      const data = await res.json()
      const answer = data.text || t('ai.fallback')
      setMsgs([...next, { role: 'assistant', text: answer }])
      try { onExchange?.(text, answer) } catch { /* non-fatal */ }
    } catch {
      setMsgs([...next, { role: 'assistant', text: t('ai.fallback') }])
    } finally { setBusy(false) }
  }

  return (
    <Card accent={C.cyan}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `linear-gradient(150deg, ${C.cyan}26, ${C.cyan}0d)`, border: `1px solid ${C.cyan}40` }}>
          <Ico name="ai" size={19} color={C.cyan} />
        </span>
        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 17, color: C.text }}>{label}</span>
      </div>
      {msgs.length === 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {suggested.map(s => (
            <button key={s} onClick={() => ask(s)} style={{ background: C.navy900, border: `1px solid ${C.cyan}33`, borderRadius: 20, padding: '8px 14px', fontSize: 13, color: C.text, cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ justifySelf: m.role === 'user' ? 'end' : 'start', maxWidth: '85%', background: m.role === 'user' ? 'rgba(52,211,153,0.14)' : C.navy900, border: `1px solid ${m.role === 'user' ? 'rgba(52,211,153,0.3)' : C.subtle}`, borderRadius: 14, padding: '11px 14px', fontSize: 14, color: C.text, lineHeight: 1.55 }}>{m.text}</div>
        ))}
        {busy && <div style={{ fontSize: 13, color: C.muted }}>{t('common.thinking')}</div>}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)}
          placeholder={t('common.ask')}
          style={{ flex: 1, background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 11, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif' }} />
        <button onClick={() => ask(q)} disabled={busy} style={{ background: `linear-gradient(135deg, ${C.mint}, ${C.mintDk})`, color: C.navy950, border: 'none', borderRadius: 11, padding: '0 18px', cursor: 'pointer' }}>
          <Ico name="send" size={18} color={C.navy950} />
        </button>
      </div>
      <p style={{ fontSize: 12, color: C.subtle, marginTop: 12, lineHeight: 1.6 }}>{disclaimer}</p>
    </Card>
  )
}
