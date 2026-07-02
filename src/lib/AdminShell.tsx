import { NavLink, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { C, PMark, Ico, Spinner, ACCENTS } from './ui'
import { useAuth } from './auth'
import CompanionMobile from '../pages/admin/CompanionMobile'
import CompanionMobileSettings from '../pages/admin/CompanionMobileSettings'
import CompanionMobileInvites from '../pages/admin/CompanionMobileInvites'
import CompanionMobileSyncMonitor from '../pages/admin/CompanionMobileSyncMonitor'
import CompanionMobilePatient from '../pages/admin/CompanionMobilePatient'
import CompanionMobileSessions from '../pages/admin/CompanionMobileSessions'
import CompanionMobileAudit from '../pages/admin/CompanionMobileAudit'

const SUBNAV: [string, string, string, boolean][] = [
  // [label, icon, path, exact]
  ['Overview',      'today',   '/admin/companion-mobile',              true],
  ['Invites',       'qr',      '/admin/companion-mobile/invites',      false],
  ['Sessions',      'mobile',  '/admin/companion-mobile/sessions',     false],
  ['Sync Monitor',  'vitals',  '/admin/companion-mobile/sync-monitor', false],
  ['Audit Log',     'plan',    '/admin/companion-mobile/audit',        false],
  ['Settings',      'shield',  '/admin/companion-mobile/settings',     false],
]

export default function AdminShell() {
  const { signOut, staffRole, staffOrgId } = useAuth()
  const navigate = useNavigate()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', minHeight: '100dvh' }}>
      <aside style={{
        background: `linear-gradient(180deg, ${C.navy900}, ${C.navy950})`,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '22px 16px',
        position: 'sticky', top: 0, height: '100dvh',
        display: 'flex', flexDirection: 'column', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 20, padding: '0 6px' }}>
          <PMark size={36} />
          <span style={{ lineHeight: 1 }}>
            <span style={{ fontFamily: 'Poppins,Rajdhani,sans-serif', fontWeight: 700, fontSize: 18 }}>
              <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>
            </span>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: C.gold, marginTop: 3 }}>Admin</span>
          </span>
        </div>

        {/* Back to patient dashboard */}
        <button onClick={() => navigate('/today')} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9,
          marginBottom: 18, background: 'transparent', border: `1px solid ${C.subtle}33`,
          color: C.muted, fontSize: 12.5, cursor: 'pointer', textAlign: 'left',
        }}>
          <Ico name="chart" size={13} color={C.muted} /> Patient Dashboard
        </button>

        {/* Section label */}
        <div style={{ fontSize: 10.5, color: C.subtle, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', padding: '0 6px', marginBottom: 8 }}>
          Companion Mobile
        </div>

        <nav style={{ flex: 1 }}>
          {SUBNAV.map(([label, ic, to, exact]) => {
            const a = ACCENTS['companion-mobile'] || { c: C.cyan, from: '#00d4ff', to: '#34d399' }
            return (
              <NavLink key={to} to={to} end={exact} style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
                marginBottom: 3, textDecoration: 'none', fontSize: 13.5, fontWeight: isActive ? 700 : 500,
                color: isActive ? C.text : C.muted,
                background: isActive ? `linear-gradient(120deg, ${a.c}1f, transparent)` : 'transparent',
              })}>
                {({ isActive }: { isActive: boolean }) => (<>
                  <span style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
                    background: isActive ? `linear-gradient(150deg, ${a.from}, ${a.to})` : `${a.c}18`,
                    border: `1px solid ${isActive ? 'transparent' : a.c + '33'}`,
                  }}>
                    <Ico name={ic} size={15} color={isActive ? C.navy950 : a.c} stroke={2} />
                  </span>
                  {label}
                </>)}
              </NavLink>
            )
          })}
        </nav>

        <div style={{ marginTop: 12 }}>
          {staffRole && (
            <div style={{ fontSize: 12, color: C.subtle, padding: '6px 8px', marginBottom: 8, borderRadius: 8, background: `${C.subtle}22` }}>
              <Ico name="shield" size={12} color={C.subtle} /> {staffRole}
              {staffOrgId && <span style={{ display: 'block', fontFamily: 'Rajdhani,sans-serif', fontSize: 10.5, color: C.subtle, marginTop: 2 }}>
                {staffOrgId.slice(0, 8)}…
              </span>}
            </div>
          )}
          <button onClick={() => signOut()} style={{
            width: '100%', background: 'transparent', border: `1px solid ${C.subtle}`,
            color: C.muted, borderRadius: 10, padding: '9px 12px', fontSize: 13,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Ico name="lock" size={14} color={C.muted} /> Sign out
          </button>
        </div>
      </aside>

      <main style={{ position: 'relative', padding: 'clamp(20px,3vw,40px)', maxWidth: 1280 }}>
        <div className="cmp-fade-up">
          <Routes>
            <Route path="/admin/companion-mobile"              element={<CompanionMobile />} />
            <Route path="/admin/companion-mobile/settings"     element={<CompanionMobileSettings />} />
            <Route path="/admin/companion-mobile/invites"      element={<CompanionMobileInvites />} />
            <Route path="/admin/companion-mobile/sync-monitor" element={<CompanionMobileSyncMonitor />} />
            <Route path="/admin/companion-mobile/sessions"     element={<CompanionMobileSessions />} />
            <Route path="/admin/companion-mobile/audit"        element={<CompanionMobileAudit />} />
            <Route path="/admin/companion-mobile/patients/:patientExternalId" element={<CompanionMobilePatient />} />
            <Route path="/admin/*"                             element={<Navigate to="/admin/companion-mobile" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}
