import { useState } from 'react'
import { C, Card, Ico, useLocal } from './ui'

type Msg = { role: 'user' | 'assistant'; text: string }

const FALLBACK =
  "I can explain general, plan-based guidance, but I'm having trouble connecting right now. " +
  'For anything specific to your situation, please reach out to your care team.'

export default function AiPanel({ topic, label, context, suggested, disclaimer, storageKey, onExchange }: {
  topic: 'diet' | 'exercise' | 'treatment'
  label: string
  context: string
  suggested: string[]
  disclaimer: string
  storageKey: string
  onExchange?: (question: string, answer: string) => void
}) {
  const [msgs, setMsgs] = useLocal<Msg[]>(storageKey, [])
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
      const answer = data.text || FALLBACK
      setMsgs([...next, { role: 'assistant', text: answer }])
      try { onExchange?.(text, answer) } catch { /* non-fatal */ }
    } catch {
      setMsgs([...next, { role: 'assistant', text: FALLBACK }])
    } finally { setBusy(false) }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
        <Ico name="ai" size={18} color={C.cyan} />
        <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 16, color: C.text }}>{label}</span>
      </div>
      {msgs.length === 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {suggested.map(s => (
            <button key={s} onClick={() => ask(s)} style={{ background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 20, padding: '8px 14px', fontSize: 13, color: C.text, cursor: 'pointer' }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ justifySelf: m.role === 'user' ? 'end' : 'start', maxWidth: '85%', background: m.role === 'user' ? 'rgba(52,211,153,0.14)' : C.navy900, border: `1px solid ${m.role === 'user' ? 'rgba(52,211,153,0.3)' : C.subtle}`, borderRadius: 12, padding: '11px 14px', fontSize: 14, color: C.text, lineHeight: 1.55 }}>{m.text}</div>
        ))}
        {busy && <div style={{ fontSize: 13, color: C.muted }}>Thinking…</div>}
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask(q)}
          placeholder="Ask a question…"
          style={{ flex: 1, background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif' }} />
        <button onClick={() => ask(q)} disabled={busy} style={{ background: C.mint, color: C.navy950, border: 'none', borderRadius: 10, padding: '0 18px', cursor: 'pointer' }}>
          <Ico name="arrow" size={18} color={C.navy950} />
        </button>
      </div>
      <p style={{ fontSize: 12, color: C.subtle, marginTop: 12, lineHeight: 1.6 }}>{disclaimer}</p>
    </Card>
  )
}
