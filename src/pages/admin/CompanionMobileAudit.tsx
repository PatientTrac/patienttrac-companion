// Admin → Companion Mobile → Audit Log
import { useState } from 'react'
import { C, Ico, SectionHeader, Spinner, useAsync } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import type { AuditItem } from '../../lib/admin-api'

const EVENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  mobile_config_created:      { label: 'Config created',       color: '#34d399' },
  mobile_config_updated:      { label: 'Config updated',       color: '#00d4ff' },
  invite_created:             { label: 'Invite created',       color: '#c9a96e' },
  invite_redeemed:            { label: 'Invite redeemed',      color: '#34d399' },
  invite_expired:             { label: 'Invite expired',       color: '#8a9bc0' },
  invite_revoked:             { label: 'Invite revoked',       color: '#ff6b6b' },
  session_created:            { label: 'Session created',      color: '#34d399' },
  session_revoked:            { label: 'Session revoked',      color: '#ff6b6b' },
  session_token_refreshed:    { label: 'Token refreshed',      color: '#00d4ff' },
  pairing_failed:             { label: 'Pairing failed',       color: '#ff6b6b' },
  vital_batch_received:       { label: 'Batch received',       color: '#8b7cff' },
  vital_batch_processed:      { label: 'Batch processed',      color: '#34d399' },
  vital_batch_failed:         { label: 'Batch failed',         color: '#ff6b6b' },
  permission_snapshot_updated:{ label: 'Permissions updated',  color: '#fbbf24' },
}

export default function CompanionMobileAudit() {
  const [patientId, setPatientId] = useState('')
  const [eventType, setEventType] = useState('')
  const [reload, setReload] = useState(0)

  const params: Record<string, string> = {}
  if (patientId.trim()) params.patientExternalId = patientId.trim()
  if (eventType)        params.eventType         = eventType

  const { data, loading, error } = useAsync(() => api.listAudit(params), [patientId, eventType, reload])

  const inp: React.CSSProperties = { background: '#060e1c', border: '1px solid #3a4a6a', borderRadius: 10, padding: '9px 13px', color: '#e8eaf0', fontSize: 13 }

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="plan" title="Audit Log" sub="Security and configuration event history" color={C.gold} />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
        <input style={{ ...inp, width: 180 }} placeholder="Patient ID" value={patientId} onChange={e => setPatientId(e.target.value)} />
        <select value={eventType} onChange={e => setEventType(e.target.value)} style={inp}>
          <option value="">All event types</option>
          {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button onClick={() => setReload(r => r + 1)} style={{ ...inp, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Ico name="refresh" size={14} color={C.muted} /> Refresh
        </button>
      </div>

      {loading && <Spinner label="Loading audit log…" />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}
      {data?.items?.length === 0 && <p style={{ color: C.muted, fontSize: 14 }}>No audit events match the current filters.</p>}

      {data?.items && data.items.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.subtle}44` }}>
                {['Date/time', 'Event', 'Patient', 'Actor', 'Actor type', 'Details'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: C.muted, fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((evt: AuditItem) => {
                const meta = EVENT_TYPE_LABELS[evt.eventType]
                return (
                  <tr key={evt.id} style={{ borderBottom: `1px solid ${C.subtle}22` }}>
                    <td style={{ padding: '11px 14px', color: C.muted, whiteSpace: 'nowrap', fontSize: 12 }}>
                      {new Date(evt.createdAt).toLocaleString()}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      {meta ? (
                        <span style={{ display: 'inline-block', padding: '3px 9px', borderRadius: 10, fontSize: 11.5, fontWeight: 600, background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}44` }}>
                          {meta.label}
                        </span>
                      ) : (
                        <span style={{ color: C.muted, fontSize: 12 }}>{evt.eventType}</span>
                      )}
                    </td>
                    <td style={{ padding: '11px 14px', color: C.text, fontFamily: 'Rajdhani,monospace', fontSize: 12 }}>
                      {evt.patientExternalId || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', color: C.muted, fontFamily: 'Rajdhani,monospace', fontSize: 12 }}>
                      {evt.actorId ? evt.actorId.slice(0, 8) + '…' : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', color: C.muted, fontSize: 12 }}>{evt.actorType}</td>
                    <td style={{ padding: '11px 14px', color: C.subtle, fontSize: 11.5 }}>
                      {Object.keys(evt.eventPayload || {}).length > 0
                        ? JSON.stringify(evt.eventPayload).slice(0, 80)
                        : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
