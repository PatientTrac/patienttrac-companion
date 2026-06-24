import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, cr } from './supabase'

export type Ctx = { patientId: number; orgId: string }

type AuthState = {
  loading: boolean
  session: Session | null
  patientId: number | null
  orgId: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<{ needsConfirm: boolean }>
  signOut: () => Promise<void>
  redeemInvite: (token: string) => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)
export const useAuth = () => {
  const v = useContext(AuthContext)
  if (!v) throw new Error('useAuth must be used within AuthProvider')
  return v
}
export const ctxOf = (a: AuthState): Ctx => ({ patientId: a.patientId as number, orgId: a.orgId as string })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState<Session | null>(null)
  const [patientId, setPatientId] = useState<number | null>(null)
  const [orgId, setOrgId] = useState<string | null>(null)

  async function resolveLink() {
    const { data } = await cr().from('patient_account').select('patient_id, org_id').maybeSingle()
    if (data) { setPatientId(data.patient_id); setOrgId(data.org_id) }
    else { setPatientId(null); setOrgId(null) }
  }

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await resolveLink()
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s)
      if (s) await resolveLink()
      else { setPatientId(null); setOrgId(null) }
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }
  const signUp = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error
    return { needsConfirm: !data.session } // email confirmation may be required
  }
  const signOut = async () => { await supabase.auth.signOut() }
  const redeemInvite = async (token: string) => {
    const { error } = await cr().rpc('redeem_patient_invite', { p_token: token.trim() })
    if (error) throw error
    await resolveLink()
  }

  return (
    <AuthContext.Provider value={{ loading, session, patientId, orgId, signIn, signUp, signOut, redeemInvite }}>
      {children}
    </AuthContext.Provider>
  )
}
