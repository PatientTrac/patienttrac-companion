import { useState, useEffect } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { useAuth, ctxOf } from '../lib/auth'
import { listMessages, sendMessage, markStaffMessagesRead } from '../lib/data'

export default function Messages() {
  const { t, lang } = useT()
  const auth = useAuth(); ctxOf(auth)
  const { data, loading, error, reload } = useAsync(() => listMessages(), [])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const A = ACCENTS.messages

  // Acknowledge any unread care-team replies when the thread is opened.
  useEffect(() => { markStaffMessagesRead().catch(() => {}) }, [])

  const send = async () => {
    const body = text.trim(); if (!body || sending) return
    setSending(true)
    try { await sendMessage(body); setText(''); reload() }
    finally { setSending(false) }
  }

  const fmt = (s: string) => new Date(s).toLocaleString(lang, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="message" title={t('msg.title')} sub={t('msg.subtitle')} color={A.c} />

      <Card accent={A.c} style={{ marginBottom: 18 }}>
        {loading && <Spinner label={t('common.loading')} />}
        {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
        {data && data.length === 0 && !loading && (
          <p style={{ color: C.subtle, fontSize: 14, padding: '6px 2px' }}>{t('msg.empty')}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {data && data.map(m => {
            const mine = m.sender_role === 'patient'
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '11px 14px', borderRadius: 13, fontSize: 14.5, lineHeight: 1.55, color: C.text,
                  background: mine ? 'rgba(52,211,153,0.14)' : C.navy900,
                  border: `1px solid ${mine ? 'rgba(52,211,153,0.32)' : C.subtle}`,
                }}>{m.body}</div>
                <span style={{ fontSize: 11.5, color: C.subtle, margin: '4px 4px 0' }}>
                  {mine ? t('msg.you') : t('msg.careTeam')} · {fmt(m.created_at)}
                </span>
              </div>
            )
          })}
        </div>
      </Card>

      <Card accent={A.c}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Input placeholder={t('msg.placeholder')} value={text}
            onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} style={{ flex: 1 }} />
          <Button onClick={send} type="button">
            <Ico name="send" size={16} color={C.navy950} /> {sending ? t('msg.sending') : t('msg.send')}
          </Button>
        </div>
        <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 12, lineHeight: 1.6 }}>{t('msg.disclaimer')}</p>
      </Card>
    </div>
  )
}
