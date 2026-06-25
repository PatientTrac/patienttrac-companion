// Admin → Companion Mobile → Patient Detail
import { useParams, useNavigate } from 'react-router-dom'
import { C, Card, Ico, SectionHeader, Spinner, useAsync } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import GenerateInviteModal from './components/GenerateInviteModal'
import { useState } from 'react'

export default function CompanionMobilePatient() {
  const { patientExternalId } = useParams<{ patientExternalId: string }>()
  const navigate = useNavigate()
  const [showInvite, setShowInvite] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const { data, loading, error } = useAsync(
    () => api.getPatientStatus(patientExternalId!),
    [patientExternalId, reload]
  )

  const revoke = async (sessionId: string) => {
    if (!confirm('Revoke this session?')) return
    setRevoking(sessionId)
    try { await api.revokeSession(sessionId); setReload(r => r + 1) } catch (e: any) { alert(e?.message) } finally { setRevoking(null) }
  }

  if (loading) return <Spinner label="Loading patient mobile status…" />
  if (error) return <p style={{ color: C.red }}>{error}</p>

  return (
    <div className="cmp-fade-up">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer' }}>
          <Ico name="arrow" size={18} color={C.muted} />
        </button>
        <SectionHeader icon="mobile" title={`Patient ${patientExternalId}`} sub="Mobile status and history" color={C.cyan} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        <ActionBtn icon="qr" label="Generate Invite" onClick={() => setShowInvite(true)} />
      </div>

      {/* Invites */}
      <Section title="Invites" icon="qr">
        {!data?.invites?.length ? (
          <p style={{ color: C.muted, fontSize: 13 }}>No invites found.</p>
        ) : data.invites.map((inv: any) => (
          <Card key={inv.inviteId} style={{ padding: '12px 16px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <StatusBadge status={inv.status} />
              <span style={{ marginLeft: 10, fontSize: 12, color: C.muted }}>
                {inv.codeLast4 ? `…${inv.codeLast4}` : ''} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
              </span>
            </div>
            {inv.status === 'active' && (
              <button onClick={() => api.revokeInvite(inv.inviteId).then(() => setReload(r => r + 1))}
                style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 12 }}>
                Revoke
              </button>
            )}
          </Card>
        ))}
      </Section>

      {/* Sessions */}
      <Section title="Paired Sessions" icon="mobile">
        {!data?.sessions?.length ? (
          <p style={{ color: C.muted, fontSize: 13 }}>No sessions.</p>
        ) : data.sessions.map((s: any) => (
          <Card key={s.sessionId} style={{ padding: '12px 16px', marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ico name={s.platform === 'ios' ? 'mobile' : 'device'} size={15} color={C.cyan} />
                  <span style={{ fontWeight: 600, color: C.text, fontSize: 14 }}>{s.deviceName || s.platform}</span>
                  <StatusBadge status={s.status} />
                </div>
                <div style={{ fontSize: 12, color: C.muted }}>
                  v{s.appVersion || '?'} · Paired {new Date(s.pairedAt).toLocaleDateString()}
                  {s.lastSyncAt && ` · Last sync ${new Date(s.lastSyncAt).toLocaleDateString()}`}
                </div>
              </div>
              {!s.revokedAt && (
                <button onClick={() => revoke(s.sessionId)} disabled={revoking === s.sessionId}
                  style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 12 }}>
                  {revoking === s.sessionId ? 'Revoking…' : 'Revoke'}
                </button>
              )}
            </div>
          </Card>
        ))}
      </Section>

      {/* Recent batches */}
      <Section title="Recent Sync Batches" icon="vitals">
        {!data?.recentBatches?.length ? <p style={{ color: C.muted, fontSize: 13 }}>No batches.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Status', 'Accepted', 'Rejected', 'Error', 'Received'].map(h => <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: C.muted, fontSize: 11, fontWeight: 600 }}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {(data.recentBatches as any[]).map((b: any) => (
                  <tr key={b.batchId} style={{ borderBottom: `1px solid ${C.subtle}22` }}>
                    <td style={{ padding: '8px 12px' }}><StatusBadge status={b.status} /></td>
                    <td style={{ padding: '8px 12px', color: C.mint }}>{b.acceptedCount}</td>
                    <td style={{ padding: '8px 12px', color: b.rejectedCount > 0 ? C.red : C.muted }}>{b.rejectedCount}</td>
                    <td style={{ padding: '8px 12px', color: C.red, fontSize: 11 }}>{b.errorCode || '—'}</td>
                    <td style={{ padding: '8px 12px', color: C.muted }}>{new Date(b.receivedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Recent vitals */}
      <Section title="Recent Mobile Vitals" icon="vitals">
        {!data?.recentVitals?.length ? <p style={{ color: C.muted, fontSize: 13 }}>No mobile vitals recorded.</p> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(data.recentVitals as any[]).map((v: any) => (
              <Card key={v.id} style={{ padding: '10px 14px', minWidth: 140 }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{v.type}</div>
                <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{v.value} {v.unit}</div>
                <div style={{ fontSize: 10.5, color: C.subtle }}>{new Date(v.recordedAt).toLocaleDateString()}</div>
              </Card>
            ))}
          </div>
        )}
      </Section>

      {/* Audit timeline */}
      <Section title="Audit Timeline" icon="plan">
        {!data?.recentAuditEvents?.length ? <p style={{ color: C.muted, fontSize: 13 }}>No events.</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(data.recentAuditEvents as any[]).map((e: any) => (
              <div key={e.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: C.cyan, marginTop: 5, flexShrink: 0 }} />
                <div>
                  <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{e.eventType}</span>
                  <span style={{ fontSize: 11.5, color: C.muted, marginLeft: 8 }}>{new Date(e.createdAt).toLocaleString()}</span>
                  {e.actorType === 'user' && <span style={{ fontSize: 11, color: C.subtle, marginLeft: 6 }}>by {e.actorId?.slice(0, 8)}…</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {showInvite && <GenerateInviteModal patientExternalId={patientExternalId} onClose={() => { setShowInvite(false); setReload(r => r + 1) }} />}
    </div>
  )
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Ico name={icon} size={16} color={C.cyan} />
        <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{title}</span>
      </div>
      {children}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const COLORS: Record<string, string> = { active: '#34d399', redeemed: '#00d4ff', expired: '#8a9bc0', revoked: '#ff6b6b', processed: '#34d399', failed: '#ff6b6b', partial_failure: '#fbbf24', received: '#8a9bc0' }
  const c = COLORS[status] || '#8a9bc0'
  return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${c}22`, color: c, border: `1px solid ${c}44` }}>{status}</span>
}

function ActionBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 14px', borderRadius: 10, border: `1px solid ${C.cyan}44`, background: `${C.cyan}11`, color: C.text, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
      <Ico name={icon} size={15} color={C.cyan} /> {label}
    </button>
  )
}
