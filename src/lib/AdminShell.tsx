import { NavLink, Routes, Route, Navigate } from 'react-router-dom'
import { C, PMark, Ico, Spinner, ACCENTS } from './ui'
import { useAuth } from './auth'
import CompanionMobile from '../pages/admin/CompanionMobile'
import CompanionMobileSettings from '../pages/admin/CompanionMobileSettings'
import CompanionMobileInvites from '../pages/admin/CompanionMobileInvites'
import CompanionMobileSyncMonitor from '../pages/admin/CompanionMobileSyncMonitor'
import CompanionMobilePatient from '../pages/admin/CompanionMobilePatient'
import CompanionMobileSessions from '../pages/admin/CompanionMobileSessions'
import CompanionMobileAudit from '../pages/admin/CompanionMobileAudit'

const ADMIN_NAV: [string, string, string][] = [
  ['companion-mobile', 'mobile', '/admin/companion-mobile'],
]

export default function AdminShell() {
  const { signOut, staffRole, staffOrgId } = useAuth()

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '272px 1fr', minHeight: '100dvh' }}>
      <aside style={{
        background: `linear-gradient(180deg, ${C.navy900}, ${C.navy950})`,
        borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '22px 16px',
        position: 'sticky', top: 0, height: '100dvh',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 26, padding: '0 6px' }}>
          <PMark size={36} />
          <span style={{ lineHeight: 1 }}>
            <span style={{ fontFamily: 'Poppins,Rajdhani,sans-serif', fontWeight: 700, fontSize: 18 }}>
              <span style={{ color: C.text }}>Patient</span><span style={{ color: C.gold }}>Trac</span>
            </span>
            <span style={{ display: 'block', fontWeight: 600, fontSize: 13.5, color: C.gold, marginTop: 3 }}>Admin</span>
          </span>
        </div>

        <nav style={{ flex: 1 }}>
          {ADMIN_NAV.map(([key, ic, to]) => {
            const a = ACCENTS[key] || ACCENTS.admin
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
                  Companion Mobile
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
