import { NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { C, PMark, Ico, Spinner, LanguageSwitcher, ACCENTS } from './lib/ui'
import { Glow, AppBackdrop } from './lib/art'
import { I18nProvider, useT } from './lib/i18n'
import { AuthProvider, useAuth } from './lib/auth'
import AdminShell from './lib/AdminShell'
import Auth from './pages/Auth'
import Pair from './pages/Pair'
import Today from './pages/Today'
import Medications from './pages/Medications'
import Diet from './pages/Diet'
import Exercise from './pages/Exercise'
import Vitals from './pages/Vitals'
import Journal from './pages/Journal'
import Treatment from './pages/Treatment'
import Messages from './pages/Messages'
import Progress from './pages/Progress'
import SelfChart from './pages/SelfChart'
import Billing from './pages/Billing'
import DailyLog from './pages/DailyLog'
import Profile from './pages/Profile'

// [sectionKey, icon, route]
const NAV: [string, string, string][] = [
  ['today', 'today', '/today'],
  ['medications', 'pill', '/medications'],
  ['diet', 'diet', '/diet'],
  ['exercise', 'exercise', '/exercise'],
  ['vitals', 'vitals', '/vitals'],
  ['journal', 'journal', '/journal'],
  ['treatment', 'plan', '/treatment'],
  ['selfchart', 'flask', '/self-chart'],
  ['messages', 'message', '/messages'],
  ['progress', 'chart', '/progress'],
  ['billing', 'billing', '/billing'],
  ['dailylog', 'calendar', '/daily-log'],
  ['profile', 'user', '/profile'],
]

function Shell() {
  const { signOut, staffOrgId } = useAuth()
  const { t } = useT()
  return (
    <div className="cmp-shell">
      <aside className="cmp-aside" style={{ background: `linear-gradient(180deg, ${C.navy900}, ${C.navy950})`, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 26, padding: '0 6px' }}>
          <PMark size={36} />
          <span style={{ lineHeight: 1 }}>
            <span style={{ fontFamily: 'Poppins,Rajdhani,sans-serif', fontWeight: 700, fontSize: 18 }}>
              <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>
            </span>
            <span className="cmp-brand-sub" style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: C.mint, marginTop: 3 }}>Companion</span>
          </span>
        </div>

        <nav className="cmp-nav">
          {NAV.map(([key, ic, to]) => {
            const a = ACCENTS[key]
            return (
              <NavLink key={to} to={to} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, padding: '9px 11px', borderRadius: 12,
                marginBottom: 5, textDecoration: 'none', fontSize: 14.5, fontWeight: isActive ? 700 : 500,
                color: isActive ? C.text : C.muted,
                background: isActive ? `linear-gradient(120deg, ${a.c}1f, transparent)` : 'transparent',
              })}>
                {({ isActive }: { isActive: boolean }) => (<>
                  <span style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: isActive ? `linear-gradient(150deg, ${a.from}, ${a.to})` : `${a.c}1a`,
                    border: `1px solid ${isActive ? 'transparent' : a.c + '33'}`,
                  }}>
                    <Ico name={ic} size={18} color={isActive ? C.navy950 : a.c} stroke={2} />
                  </span>
                  <span>{t('nav.' + key)}</span>
                </>)}
              </NavLink>
            )
          })}
        </nav>

        <div className="cmp-aside-footer" style={{ marginTop: 12 }}>
          {staffOrgId && (
            <NavLink to="/admin/companion-mobile" style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 10,
              marginBottom: 8, textDecoration: 'none', fontSize: 13, fontWeight: isActive ? 700 : 500,
              color: C.gold, background: `${C.gold}14`, border: `1px solid ${C.gold}33`,
            })}>
              <Ico name="shield" size={14} color={C.gold} stroke={2} /> Admin
            </NavLink>
          )}
          <div style={{ marginBottom: 0 }}><LanguageSwitcher /></div>
          <button onClick={() => signOut()} style={{ width: '100%', background: 'transparent', border: `1px solid ${C.subtle}`, color: C.muted, borderRadius: 10, padding: '9px 12px', fontSize: 13, cursor: 'pointer', marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="lock" size={14} color={C.muted} /> {t('common.signOut')}
          </button>
          <div className="cmp-hide-mobile" style={{ fontSize: 11, color: C.subtle, display: 'flex', alignItems: 'center', gap: 6, padding: '0 4px' }}>
            <Ico name="shield" size={13} color={C.subtle} /> {t('common.private')}
          </div>
        </div>
      </aside>

      <main className="cmp-main">
        <Glow color={C.mint} size={420} opacity={0.10} style={{ top: -160, right: -120 }} />
        <div style={{ position: 'relative' }} className="cmp-fade-up">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<Today />} />
            <Route path="/medications" element={<Medications />} />
            <Route path="/diet" element={<Diet />} />
            <Route path="/exercise" element={<Exercise />} />
            <Route path="/vitals" element={<Vitals />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/treatment" element={<Treatment />} />
            <Route path="/daily-log" element={<DailyLog />} />
            <Route path="/self-chart" element={<SelfChart />} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/progress" element={<Progress />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

// Gate: routes /admin/* to AdminShell when staffOrgId is present (amendment 2).
// Patient routes use the patient Shell.
// Dual-role users (staff + patient) get the admin shell on /admin/* and
// the patient shell on all other routes — no global default to admin.
function Gate() {
  const { loading, session, patientId, staffOrgId, recoveryMode } = useAuth()
  const { t } = useT()
  const location = useLocation()

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <Spinner label={t('common.loading')} />
    </div>
  )
  if (recoveryMode) return <Auth stage="recovery" />
  if (!session) return <Auth stage="auth" />

  const isAdminRoute = location.pathname.startsWith('/admin')

  if (isAdminRoute) {
    if (!staffOrgId) return <Navigate to="/today" replace />
    return <AdminShell />
  }

  // Patient shell
  if (patientId == null) return <Auth stage="invite" />
  return <Shell />
}

export default function App() {
  return (
    <I18nProvider>
      <AppBackdrop />
      <Routes>
        <Route path="/pair" element={<Pair />} />
        <Route path="*" element={<AuthProvider><Gate /></AuthProvider>} />
      </Routes>
    </I18nProvider>
  )
}
