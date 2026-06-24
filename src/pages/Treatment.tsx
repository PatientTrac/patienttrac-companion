import { useState } from 'react'
import { C, Card, Ico, useLocal } from '../lib/ui'

type Msg = { role: 'user' | 'assistant'; text: string }

const PLAN_SUMMARY =
  'Post-surgery recovery after total knee replacement. Goals: protect the new joint, ' +
  'rebuild strength and range of motion with daily gentle exercises, manage pain, and watch for signs of infection or clots.'

const SUGGESTED = [
  'What does my recovery plan involve?',
  'Why am I taking a blood thinner?',
  'What warning signs should I watch for?',
]

const SAFE_FALLBACK =
  "I can help explain your care plan in plain language, but I'm having trouble connecting right now. " +
  "For anything about your symptoms, medications, or doses, please contact your care team — and call your " +
  'local emergency number if this is urgent.'

export default function Treatment() {
  const [msgs, setMsgs] = useLocal<Msg[]>('cmp_edu_msgs', [])
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
        body: JSON.stringify({ question: text, planSummary: PLAN_SUMMARY }),
      })
      if (!res.ok) throw new Error('bad status')
      const data = await res.json()
      setMsgs([...next, { role: 'assistant', text: data.text || SAFE_FALLBACK }])
    } catch {
      setMsgs([...next, { role: 'assistant', text: SAFE_FALLBACK }])
    } finally { setBusy(false) }
  }

  return (
    <div>
      <h1 style={{ fontSize: 'clamp(26px,4vw,36px)', color: C.text }}>Treatment & learning</h1>
      <p style={{ color: C.muted, margin: '6px 0 22px', fontSize: 15 }}>Understand your plan, and ask anything you're unsure about.</p>

      <Card accent={C.mint} style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <Ico name="plan" size={20} color={C.mint} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 18, color: C.text }}>Total knee replacement — recovery</span>
        </div>
        <p style={{ fontSize: 14.5, color: C.muted, lineHeight: 1.65 }}>{PLAN_SUMMARY}</p>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <Ico name="ai" size={18} color={C.cyan} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 16, color: C.text }}>Ask about your plan</span>
        </div>

        {msgs.length === 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
            {SUGGESTED.map(s => (
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
            placeholder="Type a question about your care plan…"
            style={{ flex: 1, background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '12px 14px', color: C.text, fontSize: 14, fontFamily: 'DM Sans,sans-serif' }} />
          <button onClick={() => ask(q)} disabled={busy} style={{ background: C.mint, color: C.navy950, border: 'none', borderRadius: 10, padding: '0 18px', cursor: 'pointer' }}>
            <Ico name="arrow" size={18} color={C.navy950} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: C.subtle, marginTop: 12, lineHeight: 1.6 }}>
          This assistant explains your plan for learning only. It can't diagnose, and it won't change your
          medications or doses — your care team makes those decisions. In an emergency, call your local emergency number.
        </p>
      </Card>
    </div>
  )
}
