// GenerateInviteModal — generates a patient invite and shows the pairing code ONCE.
// After dismissal the raw pairing code is never shown again (cleared from state).
import { useState, useEffect } from 'react'
import { C, Card, Ico, Spinner } from '../../../lib/ui'
import { QrCode } from '../../../lib/QrCode'
import * as api from '../../../lib/admin-api'
import type { GeneratedInvite } from '../../../lib/admin-api'

type PatientResult = { patientExternalId: string; displayName: string; dob?: string | null }
type Props = { onClose: () => void; patientExternalId?: string }

// Format an ISO DOB (YYYY-MM-DD) as a local date with no timezone shift.
const fmtDob = (s?: string | null) => { if (!s) return ''; const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString() }

export default function GenerateInviteModal({ onClose, patientExternalId: initialId }: Props) {
  const [query, setQuery]               = useState('')
  const [results, setResults]           = useState<PatientResult[]>([])
  const [searching, setSearching]       = useState(false)
  const [selected, setSelected]         = useState<PatientResult | null>(
    initialId ? { patientExternalId: initialId, displayName: `Patient ${initialId}` } : null
  )
  const [showDropdown, setShowDropdown] = useState(false)
  const [expHours, setExpHours]         = useState('168')
  const [maxR, setMaxR]                 = useState('1')
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [generated, setGenerated]       = useState<GeneratedInvite | null>(null)
  const [copied, setCopied]             = useState(false)

  // Debounced patient search
  useEffect(() => {
    if (selected || query.length < 2) { setResults([]); setShowDropdown(false); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.searchPatients(query)
        setResults(res.items)
        setShowDropdown(res.items.length > 0)
      } catch { setResults([]) }
      finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, selected])

  const selectPatient = (p: PatientResult) => {
    setSelected(p)
    setQuery('')
    setResults([])
    setShowDropdown(false)
  }

  const clearSelection = () => { setSelected(null); setQuery('') }

  const generate = async () => {
    if (!selected) { setError('Please search and select a patient'); return }
    setLoading(true); setError(null)
    try {
      const result = await api.generateInvite({
        patientExternalId: selected.patientExternalId,
        expirationHours: parseInt(expHours, 10) || 168,
        maxRedemptions: parseInt(maxR, 10) || 1,
      })
      setGenerated(result)
    } catch (e: any) {
      setError(e?.message || 'Failed to generate invite')
    } finally {
      setLoading(false)
    }
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  const handleClose = () => {
    setGenerated(null)
    onClose()
  }

  const inp: React.CSSProperties = {
    background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10,
    padding: '10px 13px', color: C.text, fontSize: 14, width: '100%',
  }
  const lbl: React.CSSProperties = { fontSize: 12.5, color: C.muted, display: 'block', marginBottom: 5 }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.85)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <Card style={{ width: '100%', maxWidth: generated ? 520 : 440, maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ico name="qr" size={20} color={C.cyan} />
            <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
              {generated ? 'Pairing Code — Save Now' : 'Generate Patient Invite'}
            </span>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
            <Ico name="x" size={18} color={C.muted} />
          </button>
        </div>

        {!generated ? (
          <>
            {/* Patient search */}
            <div style={{ marginBottom: 14, position: 'relative' }}>
              <label style={lbl}>Patient *</label>

              {selected ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: `${C.cyan}18`, border: `1px solid ${C.cyan}44`, borderRadius: 10,
                  padding: '10px 13px',
                }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{selected.displayName}</div>
                    <div style={{ fontSize: 11.5, color: C.muted, fontFamily: 'Rajdhani,monospace', marginTop: 2 }}>
                      {selected.dob ? `DOB ${fmtDob(selected.dob)} · ` : ''}ID: {selected.patientExternalId}
                    </div>
                  </div>
                  {!initialId && (
                    <button onClick={clearSelection} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                      <Ico name="x" size={15} color={C.muted} />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div style={{ position: 'relative' }}>
                    <input
                      style={inp}
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      placeholder="Search by name or DOB…"
                      autoFocus
                    />
                    {searching && (
                      <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
                        <Spinner label="" />
                      </div>
                    )}
                  </div>
                  {showDropdown && results.length > 0 && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                      background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10,
                      marginTop: 4, overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    }}>
                      {results.map(p => (
                        <button
                          key={p.patientExternalId}
                          onClick={() => selectPatient(p)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
                            background: 'none', border: 'none', borderBottom: `1px solid ${C.subtle}22`,
                            color: C.text, cursor: 'pointer', fontSize: 14,
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{p.displayName}</div>
                          <div style={{ fontSize: 11.5, color: C.muted, marginTop: 2, fontFamily: 'Rajdhani,monospace' }}>
                            {p.dob ? `DOB ${fmtDob(p.dob)} · ` : ''}#{p.patientExternalId}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {query.length >= 2 && !searching && results.length === 0 && (
                    <p style={{ fontSize: 12.5, color: C.muted, marginTop: 6 }}>No patients found.</p>
                  )}
                </>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={lbl}>Expiration (hours)</label>
                <input style={inp} type="number" min={1} max={720} value={expHours} onChange={e => setExpHours(e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Max redemptions</label>
                <input style={inp} type="number" min={1} value={maxR} onChange={e => setMaxR(e.target.value)} />
              </div>
            </div>

            {error && <p style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <button
              onClick={generate} disabled={loading || !selected}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: 'none',
                cursor: (loading || !selected) ? 'default' : 'pointer',
                background: `linear-gradient(135deg, ${C.cyan}, #34d399)`, color: C.navy950,
                fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: !selected ? 0.5 : 1,
              }}
            >
              {loading ? <Spinner label="Generating…" /> : <><Ico name="qr" size={17} color={C.navy950} /> Generate Invite</>}
            </button>
          </>
        ) : (
          <>
            {/* Warning banner */}
            <div style={{
              background: `${C.amber}22`, border: `1px solid ${C.amber}55`, borderRadius: 10,
              padding: '12px 14px', marginBottom: 20,
              display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
              <Ico name="alert" size={18} color={C.amber} />
              <p style={{ fontSize: 13, color: C.amber, margin: 0, lineHeight: 1.5 }}>
                <strong>This pairing code is displayed once.</strong> Copy or share it now — you cannot retrieve it again after closing this window.
              </p>
            </div>

            {/* QR code — inline SVG, no PHI in payload */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <QrCode value={generated.qrPayload} size={180} label="Scan to pair PatientTrac Clinical Network Mobile" />
            </div>

            {/* Pairing code display */}
            <div style={{
              background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 12,
              padding: '14px 18px', marginBottom: 14, textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Pairing Code</div>
              <div style={{
                fontFamily: 'Rajdhani, monospace', fontSize: 26, fontWeight: 700,
                color: C.cyan, letterSpacing: 3,
              }}>
                {generated.pairingCode}
              </div>
              <div style={{ fontSize: 11, color: C.subtle, marginTop: 6 }}>
                Expires {new Date(generated.expiresAt).toLocaleString()}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <button
                onClick={() => copy(generated.pairingCode)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${C.subtle}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Ico name="copy" size={15} color={copied ? C.mint : C.muted} />
                {copied ? 'Copied!' : 'Copy code'}
              </button>
              <button
                onClick={() => copy(generated.pairUrl)}
                style={{ flex: 1, padding: '9px', borderRadius: 8, border: `1px solid ${C.subtle}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                <Ico name="link" size={15} color={C.muted} /> Copy link
              </button>
            </div>

            <button
              onClick={handleClose}
              style={{
                width: '100%', padding: '11px', borderRadius: 10, border: `1px solid ${C.subtle}`,
                background: 'transparent', color: C.muted, cursor: 'pointer', fontSize: 14,
              }}
            >
              I've saved the code — close
            </button>
          </>
        )}
      </Card>
    </div>
  )
}
