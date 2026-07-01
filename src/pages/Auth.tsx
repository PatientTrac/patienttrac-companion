import { useState, useEffect } from 'react'
import { C, PMark, Button, Input, LanguageSwitcher } from '../lib/ui'
import { CareScene, AiNetwork, Glow } from '../lib/art'
import { useT } from '../lib/i18n'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { startDirectLogin, completeEnrollment, completeTotp } from '../lib/auth/directLogin'
import { getLastEmail, setStaySignedIn } from '../lib/auth/loginPrefs'
import type { EnrollResult } from '../lib/auth/mfa'

type Step =
  | { status: 'credentials' }
  | { status: 'forgot_password' }
  | { status: 'reset_sent' }
  | { status: 'enroll_required'; enroll: EnrollResult }
  | { status: 'totp_required'; factorId: string }

function Wrap({ children }: { children: React.ReactNode }) {
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
        </div>
        <div style={{ background: `linear-gradient(160deg, ${C.navy800}, ${C.navy900})`, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 26, boxShadow: '0 16px 44px rgba(0,0,0,0.4)' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Auth({ stage }: { stage: 'auth' | 'invite' | 'recovery' }) {
  const { t } = useT()
  const { signUp, redeemInvite, signOut, clearRecovery } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [isOk, setIsOk] = useState(false)
  const [busy, setBusy] = useState(false)

  const [step, setStep] = useState<Step>({ status: 'credentials' })
  const [totpCode, setTotpCode] = useState('')
  const [stay, setStay] = useState(false)
  const [trust, setTrust] = useState(false)

  // Set-new-password state (recovery flow)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')

  useEffect(() => { setEmail(getLastEmail()) }, [])

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e: any) { setMsg(e?.message || 'Error'); setIsOk(false) } finally { setBusy(false) }
  }

  const checkboxRow = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.muted, fontSize: 13, cursor: 'pointer', marginBottom: 12 }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
        style={{ width: 16, height: 16, accentColor: C.mint, cursor: 'pointer' }} />
      {label}
    </label>
  )

  // ── Recovery: set new password after clicking email link ──────────────────────
  if (stage === 'recovery') {
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 8 }}>{t('auth.setNewPassword')}</h2>
        {!isOk ? (
          <>
            <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>{t('auth.setNewPasswordIntro')}</p>
            <Input type="password" placeholder={t('auth.newPassword')} value={newPw}
              onChange={e => setNewPw(e.target.value)} style={{ marginBottom: 12 }} />
            <Input type="password" placeholder={t('auth.confirmPassword')} value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)} style={{ marginBottom: 16 }} />
            <Button onClick={() => run(async () => {
              if (newPw !== confirmPw) throw new Error(t('auth.passwordMismatch'))
              if (newPw.length < 8) throw new Error(t('auth.passwordTooShort'))
              const { error } = await supabase.auth.updateUser({ password: newPw })
              if (error) throw error
              setIsOk(true)
              setMsg(t('auth.passwordUpdated'))
            })} style={{ width: '100%' }}>
              {busy ? t('auth.saving') : t('auth.savePassword')}
            </Button>
          </>
        ) : (
          <>
            <p style={{ color: C.mint, fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>{t('auth.passwordUpdated')}</p>
            <Button onClick={() => { clearRecovery(); setNewPw(''); setConfirmPw(''); setIsOk(false) }} style={{ width: '100%' }}>
              {t('auth.backToSignIn')}
            </Button>
          </>
        )}
        {msg && !isOk && <p style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{msg}</p>}
      </Wrap>
    )
  }

  // ── Invite: cross-app account linking ─────────────────────────────────────────
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

  // ── Forgot password — enter email ─────────────────────────────────────────────
  if (step.status === 'forgot_password') {
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 8 }}>{t('auth.resetPassword')}</h2>
        <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>{t('auth.resetPasswordIntro')}</p>
        <Input type="email" placeholder={t('auth.email')} value={email}
          onChange={e => setEmail(e.target.value)} style={{ marginBottom: 16 }} />
        <Button onClick={() => run(async () => {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
          })
          if (error) throw error
          setStep({ status: 'reset_sent' })
        })} style={{ width: '100%' }}>
          {busy ? t('auth.sending') : t('auth.sendReset')}
        </Button>
        {msg && <p style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{msg}</p>}
        <button onClick={() => { setStep({ status: 'credentials' }); setMsg(null) }}
          style={{ marginTop: 16, background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>
          {t('auth.backToSignIn')}
        </button>
      </Wrap>
    )
  }

  // ── Forgot password — link sent ───────────────────────────────────────────────
  if (step.status === 'reset_sent') {
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 8 }}>{t('auth.resetPassword')}</h2>
        <p style={{ color: C.mint, fontSize: 14, lineHeight: 1.6, marginBottom: 8 }}>{t('auth.resetSent')}</p>
        <p style={{ fontFamily: 'DM Mono,monospace', fontSize: 13, color: C.muted, marginBottom: 20 }}>{email}</p>
        <button onClick={() => { setStep({ status: 'credentials' }); setMsg(null) }}
          style={{ background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>
          {t('auth.backToSignIn')}
        </button>
      </Wrap>
    )
  }

  // ── TOTP enrollment (first login) ─────────────────────────────────────────────
  if (step.status === 'enroll_required') {
    const enroll = step.enroll
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 8 }}>{t('auth.setupTotp')}</h2>
        <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>{t('auth.setupTotpIntro')}</p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14 }}>
          <img src={enroll.qrCodeSvg} alt="" style={{ width: 180, height: 180, background: '#fff', borderRadius: 12, padding: 8 }} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: C.muted, fontSize: 12, marginBottom: 4 }}>{t('auth.manualEntry')}</div>
          <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 13, color: C.text, wordBreak: 'break-all', background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 8, padding: '8px 10px' }}>{enroll.secret}</div>
        </div>
        <Input type="text" inputMode="numeric" maxLength={6} placeholder={t('auth.totpCode')} value={totpCode}
          onChange={e => setTotpCode(e.target.value)} style={{ marginBottom: 12 }} />
        {checkboxRow(trust, setTrust, t('auth.trustDevice'))}
        <Button onClick={() => run(() => completeEnrollment(enroll.factorId, totpCode, trust).then(() => {}))}
          style={{ width: '100%' }}>{busy ? t('auth.verifying') : t('auth.verify')}</Button>
        {msg && <p style={{ color: C.red, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{msg}</p>}
      </Wrap>
    )
  }

  // ── TOTP verification (returning login) ───────────────────────────────────────
  if (step.status === 'totp_required') {
    const factorId = step.factorId
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 8 }}>{t('auth.mfaRequired')}</h2>
        <p style={{ color: C.muted, fontSize: 13.5, lineHeight: 1.6, marginBottom: 16 }}>{t('auth.mfaIntro')}</p>
        <Input type="text" inputMode="numeric" maxLength={6} placeholder={t('auth.totpCode')} value={totpCode}
          onChange={e => setTotpCode(e.target.value)} style={{ marginBottom: 12 }} />
        {checkboxRow(trust, setTrust, t('auth.trustDevice'))}
        <Button onClick={() => run(() => completeTotp(factorId, totpCode, trust).then(() => {}))}
          style={{ width: '100%' }}>{busy ? t('auth.verifying') : t('auth.verify')}</Button>
        {msg && <p style={{ color: C.red, fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{msg}</p>}
      </Wrap>
    )
  }

  // ── Credentials (login / signup) ──────────────────────────────────────────────
  return (
    <Wrap>
      <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 16 }}>
        {mode === 'login' ? t('auth.welcomeBack') : t('auth.create')}
      </h2>
      <Input type="email" placeholder={t('auth.email')} value={email} onChange={e => setEmail(e.target.value)} style={{ marginBottom: 12 }} />
      <Input type="password" placeholder={t('auth.password')} value={pw} onChange={e => setPw(e.target.value)} style={{ marginBottom: 8 }} />
      {mode === 'login' && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          {checkboxRow(stay, (v) => { setStay(v); setStaySignedIn(v) }, t('auth.staySignedIn'))}
          <button onClick={() => { setStep({ status: 'forgot_password' }); setMsg(null) }}
            style={{ background: 'none', border: 'none', color: C.cyan, fontSize: 12.5, cursor: 'pointer', paddingBottom: 12 }}>
            {t('auth.forgotPassword')}
          </button>
        </div>
      )}
      {mode === 'signup' && <div style={{ marginBottom: 8 }} />}
      <Button onClick={() => run(async () => {
        if (mode === 'login') {
          const next = await startDirectLogin(email, pw)
          if (next.status === 'authenticated') return
          if (next.status === 'enroll_required') setStep({ status: 'enroll_required', enroll: next.enroll })
          else if (next.status === 'totp_required') setStep({ status: 'totp_required', factorId: next.factorId })
        } else {
          const r = await signUp(email, pw)
          if (r.needsConfirm) { setMsg(t('auth.checkEmail')); setIsOk(true) }
        }
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
