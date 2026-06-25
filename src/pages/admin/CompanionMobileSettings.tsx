// Admin → Companion Mobile → Settings
import { useState, useEffect } from 'react'
import { C, Card, Ico, SectionHeader, Spinner } from '../../lib/ui'
import * as api from '../../lib/admin-api'
import type { TenantConfig } from '../../lib/admin-api'

const VITAL_OPTIONS = [
  { key: 'heart_rate', label: 'Heart Rate' },
  { key: 'resting_heart_rate', label: 'Resting Heart Rate' },
  { key: 'bp_systolic', label: 'Blood Pressure (Systolic)' },
  { key: 'bp_diastolic', label: 'Blood Pressure (Diastolic)' },
  { key: 'weight_kg', label: 'Weight' },
  { key: 'steps', label: 'Steps' },
  { key: 'spo2', label: 'SpO₂' },
  { key: 'glucose', label: 'Glucose' },
  { key: 'sleep', label: 'Sleep' },
  { key: 'temp_c', label: 'Body Temperature' },
  { key: 'active_energy', label: 'Active Energy' },
]

export default function CompanionMobileSettings() {
  const [config, setConfig]   = useState<Partial<TenantConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const [saved, setSaved]     = useState(false)
  const [confirmDisable, setConfirmDisable] = useState(false)

  useEffect(() => {
    api.getConfig().then(c => { setConfig(c); setLoading(false) }).catch(e => { setError(e?.message); setLoading(false) })
  }, [])

  const save = async (patch: Partial<TenantConfig>) => {
    setSaving(true); setError(null); setSaved(false)
    try {
      const updated = await api.updateConfig(patch)
      setConfig(updated); setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e: any) {
      setError(e?.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (config.enabled === false && !confirmDisable) { setConfirmDisable(true); return }
    save(config)
    setConfirmDisable(false)
  }

  const toggleVitalType = (key: string) => {
    const current = config.allowedVitalTypes || []
    const updated = current.includes(key) ? current.filter(k => k !== key) : [...current, key]
    setConfig(c => ({ ...c, allowedVitalTypes: updated }))
  }

  const inp: React.CSSProperties = {
    background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10,
    padding: '10px 13px', color: C.text, fontSize: 14, width: '100%',
  }
  const lbl: React.CSSProperties = { fontSize: 12.5, color: C.muted, display: 'block', marginBottom: 5, marginTop: 16 }

  if (loading) return <Spinner label="Loading settings…" />

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="shield" title="Companion Mobile Settings" sub="Tenant configuration for Clinical Network Mobile" color={C.cyan} />

      <Card style={{ maxWidth: 680 }}>
        <form onSubmit={handleSubmit}>
          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: `1px solid ${C.subtle}33` }}>
            <div>
              <div style={{ fontWeight: 600, color: C.text, fontSize: 14.5 }}>Enable Companion Mobile</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 3 }}>
                Disabling prevents new pairing and stops mobile ingestion for this tenant.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfig(c => ({ ...c, enabled: !c.enabled }))}
              style={{
                width: 46, height: 26, borderRadius: 13, border: 'none', cursor: 'pointer',
                background: config.enabled ? C.mint : C.subtle, transition: 'background 0.2s',
                position: 'relative', flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute', top: 3, left: config.enabled ? 23 : 3,
                width: 20, height: 20, borderRadius: '50%', background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {confirmDisable && (
            <div style={{ background: `${C.amber}22`, border: `1px solid ${C.amber}44`, borderRadius: 10, padding: '12px 14px', marginTop: 14 }}>
              <p style={{ color: C.amber, fontSize: 13, margin: '0 0 10px' }}>
                <Ico name="alert" size={14} color={C.amber} /> Disabling mobile sync will prevent new pairing and stop ingestion for all patients. Existing sessions will be revoked on next request. Confirm?
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: C.amber, color: C.navy950, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>
                  Confirm disable
                </button>
                <button type="button" onClick={() => { setConfirmDisable(false); setConfig(c => ({ ...c, enabled: true })) }}
                  style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.subtle}`, background: 'transparent', color: C.text, cursor: 'pointer', fontSize: 13 }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          <label style={lbl}>Client display name</label>
          <input style={inp} value={config.clientDisplayName || ''} onChange={e => setConfig(c => ({ ...c, clientDisplayName: e.target.value }))} placeholder="e.g. North Clinic" />

          <label style={lbl}>Support email</label>
          <input style={inp} type="email" value={config.supportEmail || ''} onChange={e => setConfig(c => ({ ...c, supportEmail: e.target.value }))} placeholder="support@clinic.com" />

          <label style={lbl}>Support phone</label>
          <input style={inp} type="tel" value={config.supportPhone || ''} onChange={e => setConfig(c => ({ ...c, supportPhone: e.target.value }))} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Default backfill days (0–365)</label>
              <input style={inp} type="number" min={0} max={365} value={config.defaultBackfillDays ?? 30} onChange={e => setConfig(c => ({ ...c, defaultBackfillDays: parseInt(e.target.value, 10) }))} />
            </div>
            <div>
              <label style={lbl}>Invite expiration hours (1–720)</label>
              <input style={inp} type="number" min={1} max={720} value={config.inviteExpirationHours ?? 168} onChange={e => setConfig(c => ({ ...c, inviteExpirationHours: parseInt(e.target.value, 10) }))} />
            </div>
          </div>

          <label style={lbl}>Privacy notice URL</label>
          <input style={inp} type="url" value={config.privacyNoticeUrl || ''} onChange={e => setConfig(c => ({ ...c, privacyNoticeUrl: e.target.value }))} />

          <label style={lbl}>Terms URL</label>
          <input style={inp} type="url" value={config.termsUrl || ''} onChange={e => setConfig(c => ({ ...c, termsUrl: e.target.value }))} />

          <label style={{ ...lbl, marginBottom: 10 }}>Allowed vital types</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {VITAL_OPTIONS.map(v => {
              const on = (config.allowedVitalTypes || []).includes(v.key)
              return (
                <button key={v.key} type="button" onClick={() => toggleVitalType(v.key)} style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${on ? C.cyan : C.subtle}`, color: on ? C.cyan : C.muted,
                  background: on ? `${C.cyan}18` : 'transparent', transition: 'all 0.15s',
                }}>
                  {v.label}
                </button>
              )
            })}
          </div>

          {error && <p style={{ color: C.red, fontSize: 13, marginTop: 14 }}>{error}</p>}
          {saved && <p style={{ color: C.mint, fontSize: 13, marginTop: 14 }}>✓ Settings saved</p>}

          {!confirmDisable && (
            <button type="submit" disabled={saving} style={{
              marginTop: 20, width: '100%', padding: '12px', borderRadius: 10, border: 'none',
              background: `linear-gradient(135deg, ${C.cyan}, #34d399)`, color: C.navy950,
              fontWeight: 700, fontSize: 15, cursor: saving ? 'default' : 'pointer',
            }}>
              {saving ? 'Saving…' : 'Save settings'}
            </button>
          )}
        </form>
      </Card>
    </div>
  )
}
