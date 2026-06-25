// Admin → Companion Mobile — overview dashboard
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, Card, Ico, SectionHeader, GradientStat, Spinner, useAsync } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import GenerateInviteModal from './components/GenerateInviteModal'

export default function CompanionMobile() {
  const { data: stats, loading, error } = useAsync(() => api.getStats(), [])
  const [showInvite, setShowInvite] = useState(false)
  const navigate = useNavigate()
  const A = { c: C.cyan, from: '#00d4ff', to: '#34d399' }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="mobile" title="Companion Mobile" sub="Clinical Network Mobile control plane" color={A.c} />

      {loading && <Spinner label="Loading…" />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}

      {stats && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, background: stats.enabled ? `${C.mint}22` : `${C.amber}22`, border: `1px solid ${stats.enabled ? C.mint : C.amber}44` }}>
              <Ico name="device" size={15} color={stats.enabled ? C.mint : C.amber} />
              <span style={{ fontSize: 13, fontWeight: 600, color: stats.enabled ? C.mint : C.amber }}>
                Mobile sync {stats.enabled ? 'enabled' : 'disabled'}
              </span>
              {stats.clientDisplayName && (
                <span style={{ fontSize: 12, color: C.muted }}>— {stats.clientDisplayName}</span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginBottom: 28 }}>
            <GradientStat icon="mobile"  label="Active sessions"    value={String(stats.activeSessions)}   from={A.from} to={A.to} />
            <GradientStat icon="qr"      label="Pending invites"    value={String(stats.pendingInvites)}    from="#c9a96e" to="#e8cc9a" />
            <GradientStat icon="alert"   label="Failed batches 24h" value={String(stats.failedBatches24h)} from="#ff6b6b" to="#ec4899" />
            <GradientStat icon="vitals"  label="No sync in 7 days"  value={String(stats.noSyncIn7d)}       from="#fbbf24" to="#f59e0b" />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 28 }}>
        <ActionBtn icon="qr"     label="Generate Patient Invite" accent={A.c}  onClick={() => setShowInvite(true)} />
        <ActionBtn icon="vitals" label="Sync Monitor"            accent={A.c}  onClick={() => navigate('/admin/companion-mobile/sync-monitor')} />
        <ActionBtn icon="filter" label="Sessions"                accent={C.gold} onClick={() => navigate('/admin/companion-mobile/sessions')} />
        <ActionBtn icon="plan"   label="Audit Log"               accent={C.gold} onClick={() => navigate('/admin/companion-mobile/audit')} />
        <ActionBtn icon="shield" label="Settings"                accent={C.muted} onClick={() => navigate('/admin/companion-mobile/settings')} />
      </div>

      <Card style={{ padding: '18px 20px' }}>
        <p style={{ fontSize: 13.5, color: C.muted, lineHeight: 1.7, margin: 0 }}>
          Companion Mobile connects patients to their care team by syncing wearable data from iOS and Android devices.
          Admins generate secure, single-use invite codes — patients scan the QR code to pair their device.
          All data writes through <code style={{ color: C.cyan, fontSize: 12 }}>cr.companion_vital</code>.
        </p>
      </Card>

      {showInvite && <GenerateInviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}

function ActionBtn({ icon, label, accent, onClick }: { icon: string; label: string; accent: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
      background: `${accent}18`, border: `1px solid ${accent}44`, color: C.text,
      fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s',
    }}>
      <Ico name={icon} size={17} color={accent} stroke={2} /> {label}
    </button>
  )
}
