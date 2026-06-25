// Admin → Companion Mobile → Sync Monitor
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, Ico, SectionHeader, Spinner, useAsync } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import type { SyncMonitorItem } from '../../lib/admin-api'

const STATUS_COLORS: Record<string, string> = {
  paired: C.cyan, syncing: C.mint, processed: C.mint, failed: C.red,
  partial_failure: C.amber, not_invited: C.muted, revoked: C.subtle,
  permission_denied: C.amber, sync_failed: C.red, invite_pending: C.gold,
}

export default function CompanionMobileSyncMonitor() {
  const [platform, setPlatform]       = useState('')
  const [errorsOnly, setErrorsOnly]   = useState(false)
  const [noSyncIn7d, setNoSyncIn7d]   = useState(false)
  const [revoking, setRevoking]       = useState<string | null>(null)
  const [reload, setReload]           = useState(0)
  const navigate = useNavigate()

  const params: Record<string, string> = {}
  if (platform)    params.platform    = platform
  if (errorsOnly)  params.errorsOnly  = 'true'
  if (noSyncIn7d)  params.noSyncIn7d  = 'true'

  const { data, loading, error } = useAsync(() => api.getSyncMonitor(params), [platform, errorsOnly, noSyncIn7d, reload])

  const revoke = async (sessionId: string) => {
    if (!confirm('Revoke this session? The mobile device will no longer be able to ingest data.')) return
    setRevoking(sessionId)
    try { await api.revokeSession(sessionId); setReload(r => r + 1) }
    catch (e: any) { alert(e?.message || 'Failed to revoke') }
    finally { setRevoking(null) }
  }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="vitals" title="Sync Monitor" sub="Live mobile session and ingestion status" color={C.cyan} />

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <select value={platform} onChange={e => setPlatform(e.target.value)} style={sel}>
          <option value="">All platforms</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </select>
        <FilterToggle active={errorsOnly} label="Errors only" onClick={() => setErrorsOnly(v => !v)} />
        <FilterToggle active={noSyncIn7d} label="No sync in 7d" onClick={() => setNoSyncIn7d(v => !v)} />
      </div>

      {loading && <Spinner label="Loading…" />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data?.items?.length === 0 && <p style={{ color: C.muted, fontSize: 14 }}>No sessions match the current filters.</p>}

      {data?.items && data.items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.subtle}44` }}>
                {['Patient', 'Platform', 'Status', 'App version', 'Last seen', 'Last sync', 'Last batch', 'Error', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((row: SyncMonitorItem) => (
                <tr key={row.sessionId} style={{ borderBottom: `1px solid ${C.subtle}22` }}>
                  <td style={{ padding: '11px 14px' }}>
                    <button onClick={() => navigate(`/admin/companion-mobile/patients/${row.patientExternalId}`)}
                      style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontFamily: 'Rajdhani,monospace', fontWeight: 700, fontSize: 13, padding: 0 }}>
                      {row.patientExternalId}
                    </button>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <Ico name={row.platform === 'ios' ? 'mobile' : 'device'} size={15} color={C.muted} />
                    <span style={{ marginLeft: 5, color: C.muted }}>{row.platform}</span>
                  </td>
                  <td style={{ padding: '11px 14px' }}><StatusBadge status={row.pairedStatus} /></td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{row.appVersion || '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{row.lastSeenAt ? fmtTime(row.lastSeenAt) : '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{row.lastSyncAt ? fmtTime(row.lastSyncAt) : 'Never'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {row.lastBatchStatus ? <StatusBadge status={row.lastBatchStatus} /> : <span style={{ color: C.subtle }}>—</span>}
                  </td>
                  <td style={{ padding: '11px 14px', color: C.red, fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.lastErrorCode || '—'}
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <ActionBtn label="Detail" onClick={() => navigate(`/admin/companion-mobile/patients/${row.patientExternalId}`)} />
                      {row.pairedStatus !== 'revoked' && (
                        <ActionBtn label="Revoke" danger onClick={() => revoke(row.sessionId)} disabled={revoking === row.sessionId} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const sel: React.CSSProperties = { background: '#060e1c', border: '1px solid #3a4a6a', borderRadius: 10, padding: '9px 13px', color: '#e8eaf0', fontSize: 13 }

function FilterToggle({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ padding: '9px 14px', borderRadius: 10, border: `1px solid ${active ? C.cyan : C.subtle}`, background: active ? `${C.cyan}18` : 'transparent', color: active ? C.cyan : C.muted, fontSize: 13, cursor: 'pointer' }}>
      <Ico name="filter" size={13} color={active ? C.cyan : C.muted} /> {label}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || C.muted
  return <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, background: `${color}22`, color, border: `1px solid ${color}44` }}>{status}</span>
}

function ActionBtn({ label, danger, onClick, disabled }: { label: string; danger?: boolean; onClick: () => void; disabled?: boolean }) {
  const color = danger ? C.red : C.cyan
  return (
    <button onClick={onClick} disabled={disabled} style={{ padding: '5px 10px', borderRadius: 7, border: `1px solid ${color}44`, background: 'transparent', color, cursor: disabled ? 'default' : 'pointer', fontSize: 12, opacity: disabled ? 0.5 : 1 }}>
      {label}
    </button>
  )
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60)   return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}
