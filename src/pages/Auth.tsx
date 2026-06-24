import { useState } from 'react'
import { C, PMark, Button, Input, LanguageSwitcher } from '../lib/ui'
import { CareScene, AiNetwork, Glow } from '../lib/art'
import { useT } from '../lib/i18n'
import { useAuth } from '../lib/auth'

function Wrap({ children }: { children: React.ReactNode }) {
  const { t } = useT()
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, position: 'relative', overflow: 'hidden', background: `linear-gradient(160deg, ${C.navy800}, ${C.navy950})` }}>
      <Glow color={C.mint} size={460} opacity={0.14} style={{ top: -160, left: -120 }} />
      <Glow color={C.cyan} size={420} opacity={0.12} style={{ bottom: -160, right: -120 }} />
      <div style={{ position: 'absolute', top: 18, right: 18 }}><LanguageSwitcher /></div>
      <div style={{ width: '100%', maxWidth: 410, position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ position: 'relative', marginBottom: 8 }} className="cmp-float">
            <AiNetwork width={130} height={86} style={{ position: 'absolute', left: -40, top: -10, opacity: 0.5 }} />
            <CareScene width={210} height={140} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PMark size={32} />
            <span style={{ fontFamily: 'Poppins,Rajdhani,sans-serif', fontWeight: 700, fontSize: 20 }}>
              <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>{' '}
              <span style={{ color: C.mint, fontWeight: 600 }}>Companion</span>
            </span>
          </div>
          <div style={{ color: C.muted, fontSize: 13.5, marginTop: 4 }}>{t('tagline')}</div>
        </div>
        <div style={{ background: `linear-gradient(160deg, ${C.navy800}, ${C.navy900})`, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 26, boxShadow: '0 16px 44px rgba(0,0,0,0.4)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Auth({ stage }: { stage: 'auth' | 'invite' }) {
  const { t } = useT()
  const { signIn, signUp, redeemInvite, signOut } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null); const [isOk, setIsOk] = useState(false); const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e: any) { setMsg(e?.message || 'Error'); setIsOk(false) } finally { setBusy(false) }
  }

  if (stage === 'invite') {
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 6 }}>{t('auth.oneMore')}</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>{t('auth.inviteIntro')}</p>
        <Input placeholder={t('auth.code')} value={code} onChange={e => setCode(e.target.value)} style={{ marginBottom: 12 }} />
        <Button onClick={() => run(() => redeemInvite(code))} style={{ width: '100%' }}>{busy ? t('auth.connecting') : t('auth.connect')}</Button>
        {msg && <p style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{msg}</p>}
        <button onClick={() => signOut()} style={{ marginTop: 16, background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>{t('common.signOut')}</button>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 16 }}>
        {mode === 'login' ? t('auth.welcomeBack') : t('auth.create')}
      </h2>
      <Input type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} style={{ marginBottom: 12 }} />
      <Input type="password" placeholder={t('auth.password')} value={pw} onChange={e => setPw(e.target.value)} style={{ marginBottom: 16 }} />
      <Button onClick={() => run(async () => {
        if (mode === 'login') await signIn(email, pw)
        else { const r = await signUp(email, pw); if (r.needsConfirm) { setMsg(t('auth.checkEmail')); setIsOk(true) } }
      })} style={{ width: '100%' }}>{busy ? t('common.loading') : (mode === 'login' ? t('auth.signIn') : t('auth.signUp'))}</Button>
      {msg && <p style={{ color: isOk ? C.mint : C.red, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{msg}</p>}
      <p style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>
        {mode === 'login' ? t('auth.new') + ' ' : t('auth.have') + ' '}
        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null) }} style={{ background: 'none', border: 'none', color: C.mint, cursor: 'pointer', fontSize: 13 }}>
          {mode === 'login' ? t('auth.createLink') : t('auth.signInLink')}
        </button>
      </p>
    </Wrap>
  )
}
