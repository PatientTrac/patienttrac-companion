// Admin → Companion Mobile → Sessions
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { C, Ico, SectionHeader, Spinner, useAsync } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import type { SessionItem } from '../../lib/admin-api'

export default function CompanionMobileSessions() {
  const [platform, setPlatform]   = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [revoking, setRevoking]   = useState<string | null>(null)
  const [reload, setReload]       = useState(0)
  const navigate = useNavigate()

  const params: Record<string, string> = {}
  if (platform)   params.platform   = platform
  if (activeOnly) params.activeOnly = 'true'

  const { data, loading, error } = useAsync(() => api.listSessions(params), [platform, activeOnly, reload])

  const revoke = async (sessionId: string) => {
    if (!confirm('Revoke this session? The mobile device will no longer be able to ingest data.')) return
    setRevoking(sessionId)
    try { await api.revokeSession(sessionId); setReload(r => r + 1) }
    catch (e: any) { alert(e?.message || 'Failed to revoke') }
    finally { setRevoking(null) }
  }

  const sel: React.CSSProperties = { background: '#060e1c', border: '1px solid #3a4a6a', borderRadius: 10, padding: '9px 13px', color: '#e8eaf0', fontSize: 13 }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="mobile" title="Sessions" sub="All paired mobile devices" color={C.cyan} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <select value={platform} onChange={e => setPlatform(e.target.value)} style={sel}>
          <option value="">All platforms</option>
          <option value="ios">iOS</option>
          <option value="android">Android</option>
        </select>
        <button onClick={() => setActiveOnly(v => !v)} style={{
          padding: '9px 14px', borderRadius: 10, border: `1px solid ${activeOnly ? C.mint : C.subtle}`,
          background: activeOnly ? `${C.mint}18` : 'transparent', color: activeOnly ? C.mint : C.muted, fontSize: 13, cursor: 'pointer',
        }}>
          Active only
        </button>
      </div>

      {loading && <Spinner label="Loading sessions…" />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data?.items?.length === 0 && <p style={{ color: C.muted, fontSize: 14 }}>No sessions found.</p>}

      {data?.items && data.items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.subtle}44` }}>
                {['Patient', 'Platform', 'Device', 'App version', 'Paired', 'Last seen', 'Last sync', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((s: SessionItem) => (
                <tr key={s.sessionId} style={{ borderBottom: `1px solid ${C.subtle}22` }}>
                  <td style={{ padding: '11px 14px' }}>
                    <button onClick={() => navigate(`/admin/companion-mobile/patients/${s.patientExternalId}`)}
                      style={{ background: 'none', border: 'none', color: C.cyan, cursor: 'pointer', fontFamily: 'Rajdhani,monospace', fontWeight: 700, fontSize: 13, padding: 0 }}>
                      {s.patientExternalId}
                    </button>
                  </td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>
                    <Ico name={s.platform === 'ios' ? 'mobile' : 'device'} size={14} color={C.muted} />
                    <span style={{ marginLeft: 4 }}>{s.platform}</span>
                  </td>
                  <td style={{ padding: '11px 14px', color: C.text }}>{s.deviceName || '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{s.appVersion || '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{new Date(s.pairedAt).toLocaleDateString()}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleDateString() : '—'}</td>
                  <td style={{ padding: '11px 14px', color: C.muted }}>{s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleDateString() : 'Never'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 12, fontSize: 11.5, fontWeight: 600, background: s.revokedAt ? `${C.red}22` : `${C.mint}22`, color: s.revokedAt ? C.red : C.mint, border: `1px solid ${s.revokedAt ? C.red : C.mint}44` }}>
                      {s.revokedAt ? 'revoked' : 'active'}
                    </span>
                  </td>
                  <td style={{ padding: '11px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => navigate(`/admin/companion-mobile/patients/${s.patientExternalId}`)}
                        style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${C.cyan}44`, background: 'transparent', color: C.cyan, cursor: 'pointer', fontSize: 12 }}>
                        Detail
                      </button>
                      {!s.revokedAt && (
                        <button onClick={() => revoke(s.sessionId)} disabled={revoking === s.sessionId}
                          style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${C.red}44`, background: 'transparent', color: C.red, cursor: 'pointer', fontSize: 12, opacity: revoking === s.sessionId ? 0.5 : 1 }}>
                          {revoking === s.sessionId ? 'Revoking…' : 'Revoke'}
                        </button>
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
