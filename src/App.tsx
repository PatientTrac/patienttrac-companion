import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { C, PMark, Ico, Spinner } from './lib/ui'
import { AuthProvider, useAuth } from './lib/auth'
import Auth from './pages/Auth'
import Today from './pages/Today'
import Medications from './pages/Medications'
import Diet from './pages/Diet'
import Exercise from './pages/Exercise'
import Vitals from './pages/Vitals'
import Journal from './pages/Journal'
import Treatment from './pages/Treatment'

const NAV: [string, string, string][] = [
  ['today', 'Today', '/today'],
  ['pill', 'Medications', '/medications'],
  ['diet', 'Diet', '/diet'],
  ['exercise', 'Exercise', '/exercise'],
  ['vitals', 'Vitals & devices', '/vitals'],
  ['journal', 'Journal', '/journal'],
  ['plan', 'Treatment & learning', '/treatment'],
]

function Shell() {
  const { signOut } = useAuth()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '264px 1fr', minHeight: '100dvh' }}>
      <aside style={{ background: C.navy900, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '22px 16px', position: 'sticky', top: 0, height: '100dvh' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '0 6px' }}>
          <PMark size={34} />
          <span style={{ lineHeight: 1 }}>
            <span style={{ fontFamily: 'Poppins,sans-serif', fontWeight: 700, fontSize: 17 }}>
              <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>
            </span>
            <span style={{ display: 'block', fontFamily: 'Poppins,sans-serif', fontWeight: 500, fontSize: 13, color: C.mint, marginTop: 2 }}>Companion</span>
          </span>
        </div>
        <nav>
          {NAV.map(([ic, label, to]) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
              marginBottom: 4, textDecoration: 'none', fontSize: 15, fontWeight: isActive ? 600 : 500,
              color: isActive ? C.mint : C.muted, background: isActive ? 'rgba(52,211,153,0.1)' : 'transparent',
            })}>
              {({ isActive }: { isActive: boolean }) => (<><Ico name={ic} size={19} color={isActive ? C.mint : C.muted} /> {label}</>)}
            </NavLink>
          ))}
        </nav>
        <div style={{ position: 'absolute', bottom: 18, left: 16, right: 16 }}>
          <button onClick={() => signOut()} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.subtle}`, color: C.muted, borderRadius: 9, padding: '9px 12px', fontSize: 13, cursor: 'pointer', marginBottom: 10 }}>Sign out</button>
          <div style={{ fontSize: 11, color: C.subtle, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Ico name="lock" size={13} color={C.subtle} /> Private to you & your care team
          </div>
        </div>
      </aside>

      <main style={{ padding: 'clamp(20px,3vw,38px)', maxWidth: 1080 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/today" replace />} />
          <Route path="/today" element={<Today />} />
          <Route path="/medications" element={<Medications />} />
          <Route path="/diet" element={<Diet />} />
          <Route path="/exercise" element={<Exercise />} />
          <Route path="/vitals" element={<Vitals />} />
          <Route path="/journal" element={<Journal />} />
          <Route path="/treatment" element={<Treatment />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function Gate() {
  const { loading, session, patientId } = useAuth()
  if (loading) return <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}><Spinner label="Loading your companion…" /></div>
  if (!session) return <Auth stage="auth" />
  if (patientId == null) return <Auth stage="invite" />
  return <Shell />
}

export default function App() {
  return <AuthProvider><Gate /></AuthProvider>
}
