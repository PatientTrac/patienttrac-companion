import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { C, PMark, Ico } from './lib/ui'
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

export default function App() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '264px 1fr', minHeight: '100dvh' }}>
      <aside className="cmp-side" style={{ background: C.navy900, borderRight: '1px solid rgba(255,255,255,0.06)', padding: '22px 16px', position: 'sticky', top: 0, height: '100dvh' }}>
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
        <div style={{ position: 'absolute', bottom: 20, left: 16, right: 16, fontSize: 11, color: C.subtle, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ico name="lock" size={13} color={C.subtle} /> Private to you & your care team
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
