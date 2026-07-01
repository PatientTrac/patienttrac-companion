import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, cr } from './supabase'

export type Ctx = { patientId: number; orgId: string }

type AuthState = {
  loading: boolean
  session: Session | null
  patientId: number | null
  orgId: string | null
  staffOrgId: string | null
  staffRole: string | null
  recoveryMode: boolean
  clearRecovery: () => void
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
  const [loading, setLoading]       = useState(true)
  const [session, setSession]       = useState<Session | null>(null)
  const [patientId, setPatientId]   = useState<number | null>(null)
  const [orgId, setOrgId]           = useState<string | null>(null)
  const [staffOrgId, setStaffOrgId] = useState<string | null>(null)
  const [staffRole, setStaffRole]   = useState<string | null>(null)
  const [recoveryMode, setRecoveryMode] = useState(false)

  async function resolveLink(currentSession: Session) {
    // Patient account check (existing path)
    const { data } = await cr().from('patient_account').select('patient_id, org_id').maybeSingle()
    if (data) { setPatientId(data.patient_id); setOrgId(data.org_id) }
    else      { setPatientId(null); setOrgId(null) }

    // Staff check via server function (amendment 8).
    // Uses mobile-staff-me.ts which queries saas.org_members with service role,
    // avoiding uncertainty about whether the anon client can read saas schema.
    try {
      const res = await fetch('/api/mobile-staff-me', {
        headers: { Authorization: `Bearer ${currentSession.access_token}` },
      })
      if (res.ok) {
        const d: { isStaff: boolean; orgId: string | null; role: string | null } = await res.json()
        setStaffOrgId(d.isStaff ? d.orgId : null)
        setStaffRole(d.isStaff ? d.role : null)
      } else {
        setStaffOrgId(null)
        setStaffRole(null)
      }
    } catch {
      setStaffOrgId(null)
      setStaffRole(null)
    }
  }

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await resolveLink(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      if (_e === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      setSession(s)
      if (s) await resolveLink(s)
      else { setPatientId(null); setOrgId(null); setStaffOrgId(null); setStaffRole(null) }
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
    return { needsConfirm: !data.session }
  }
  const signOut = async () => { await supabase.auth.signOut() }
  const clearRecovery = () => setRecoveryMode(false)
  const redeemInvite = async (token: string) => {
    const { error } = await cr().rpc('redeem_patient_invite', { p_token: token.trim() })
    if (error) throw error
    const s = (await supabase.auth.getSession()).data.session
    if (s) await resolveLink(s)
  }

  return (
    <AuthContext.Provider value={{ loading, session, patientId, orgId, staffOrgId, staffRole, recoveryMode, clearRecovery, signIn, signUp, signOut, redeemInvite }}>
      {children}
    </AuthContext.Provider>
  )
}
