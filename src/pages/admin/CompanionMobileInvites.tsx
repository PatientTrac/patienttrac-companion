// Admin → Companion Mobile → Patient Invites
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { C, Card, Ico, SectionHeader, Spinner, useAsync } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import type { InviteItem } from '../../lib/admin-api'
import GenerateInviteModal from './components/GenerateInviteModal'

const STATUS_COLORS: Record<string, string> = {
  active: C.mint, redeemed: C.cyan, expired: C.muted, revoked: C.red,
}

export default function CompanionMobileInvites() {
  const [urlParams]                     = useSearchParams()
  const [statusFilter, setStatusFilter] = useState(urlParams.get('status') || '')
  const [showGenerate, setShowGenerate] = useState(false)
  const [revoking, setRevoking] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const params: Record<string, string> = {}
  if (statusFilter) params.status = statusFilter

  const { data, loading, error } = useAsync(() => api.listInvites(params), [statusFilter, reload])

  const revoke = async (inviteId: string) => {
    if (!confirm('Revoke this invite? The pairing code will be immediately invalidated.')) return
    setRevoking(inviteId)
    try { await api.revokeInvite(inviteId); setReload(r => r + 1) }
    catch (e: any) { alert(e?.message || 'Failed to revoke') }
    finally { setRevoking(null) }
  }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="qr" title="Patient Invites" sub="Generate and manage pairing invites" color={C.cyan} />

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setShowGenerate(true)} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 10,
          background: `linear-gradient(135deg, ${C.cyan}, #34d399)`, border: 'none',
          color: C.navy950, fontWeight: 700, fontSize: 14, cursor: 'pointer',
        }}>
          <Ico name="plus" size={16} color={C.navy950} /> Generate Invite
        </button>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{
          background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10,
          padding: '10px 13px', color: C.text, fontSize: 13,
        }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="redeemed">Redeemed</option>
          <option value="expired">Expired</option>
          <option value="revoked">Revoked</option>
        </select>
      </div>

      {loading && <Spinner label="Loading invites…" />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}

      {data?.items && data.items.length === 0 && (
        <p style={{ color: C.muted, fontSize: 14 }}>No invites found. Generate one above.</p>
      )}

      {data?.items && data.items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.subtle}44` }}>
                {['Patient ID', 'Code (last 4)', 'Status', 'Expires', 'Created', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((inv: InviteItem) => (
                <tr key={inv.inviteId} style={{ borderBottom: `1px solid ${C.subtle}22` }}>
                  <td style={{ padding: '11px 14px', color: C.text, fontFamily: 'Rajdhani,monospace', fontWeight: 600 }}>{inv.patientExternalId}</td>
                  <td style={{ padding: '11px 14px', color: C.text, fontFamily: 'Rajdhani,monospace', letterSpacing: 2 }}>{inv.codeLast4 ? `…${inv.codeLast4}` : '—'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <StatusBadge status={inv.status} />
                  </td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {inv.status === 'active' && (
                      <button
                        onClick={() => revoke(inv.inviteId)}
                        disabled={revoking === inv.inviteId}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.red}55`, background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 12 }}
                      >
                        <Ico name="revoke" size={13} color={C.red} />
                        {revoking === inv.inviteId ? 'Revoking…' : 'Revoke'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showGenerate && <GenerateInviteModal onClose={() => { setShowGenerate(false); setReload(r => r + 1) }} />}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || C.muted
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {status}
    </span>
  )
}
