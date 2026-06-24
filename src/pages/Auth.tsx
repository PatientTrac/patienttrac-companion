import { useState } from 'react'
import { C, PMark, Button, Input } from '../lib/ui'
import { useAuth } from '../lib/auth'

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 20, background: C.navy950 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 24 }}>
          <PMark size={38} />
          <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 20 }}>
            <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>{' '}
            <span style={{ color: C.mint, fontWeight: 500 }}>Companion</span>
          </span>
        </div>
        <div style={{ background: C.navy800, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 26 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

export default function Auth({ stage }: { stage: 'auth' | 'invite' }) {
  const { signIn, signUp, redeemInvite, signOut } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMsg(null)
    try { await fn() } catch (e: any) { setMsg(e?.message || 'Something went wrong') } finally { setBusy(false) }
  }

  if (stage === 'invite') {
    return (
      <Wrap>
        <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 6 }}>One more step</h2>
        <p style={{ color: C.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Enter the invite code from your care team to connect your account to your records.
        </p>
        <Input placeholder="Invite code" value={code} onChange={e => setCode(e.target.value)} style={{ marginBottom: 12 }} />
        <Button onClick={() => run(() => redeemInvite(code))}>{busy ? 'Connecting…' : 'Connect my account'}</Button>
        {msg && <p style={{ color: C.red, fontSize: 13, marginTop: 12 }}>{msg}</p>}
        <button onClick={() => signOut()} style={{ marginTop: 16, background: 'none', border: 'none', color: C.muted, fontSize: 13, cursor: 'pointer' }}>Sign out</button>
      </Wrap>
    )
  }

  return (
    <Wrap>
      <h2 style={{ fontFamily: 'Rajdhani,sans-serif', fontSize: 22, color: C.text, marginBottom: 16 }}>
        {mode === 'login' ? 'Welcome back' : 'Create your account'}
      </h2>
      <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ marginBottom: 12 }} />
      <Input type="password" placeholder="Password" value={pw} onChange={e => setPw(e.target.value)} style={{ marginBottom: 16 }} />
      <Button onClick={() => run(async () => {
        if (mode === 'login') await signIn(email, pw)
        else { const r = await signUp(email, pw); if (r.needsConfirm) setMsg('Check your email to confirm your account, then sign in.') }
      })}>{busy ? 'Please wait…' : (mode === 'login' ? 'Sign in' : 'Sign up')}</Button>
      {msg && <p style={{ color: msg.startsWith('Check') ? C.mint : C.red, fontSize: 13, marginTop: 12 }}>{msg}</p>}
      <p style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>
        {mode === 'login' ? "New here? " : 'Already have an account? '}
        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setMsg(null) }} style={{ background: 'none', border: 'none', color: C.mint, cursor: 'pointer', fontSize: 13 }}>
          {mode === 'login' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </Wrap>
  )
}
