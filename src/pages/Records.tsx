import { useState } from 'react'
import { C, Card, Ico, Button, Input, Spinner, SectionHeader, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { parseGs1 } from '../lib/gs1'
import { BarcodeScanner } from '../lib/BarcodeScanner'
import { RECORD_KINDS, listRecords, createRecord, deleteRecord, fileUrl, type RecordKind, type PatientRecord } from '../lib/recordsUpload'

const KIND_UI: Record<RecordKind, { icon: string; color: string }> = {
  implant:   { icon: 'device', color: C.cyan },
  surgical:  { icon: 'plan',   color: C.mint },
  lab:       { icon: 'flask',  color: C.gold },
  radiology: { icon: 'camera', color: C.violet },
}

type Field = { key: string; label: string; type?: 'text' | 'date' | 'select' | 'checkbox'; options?: string[] }
const FIELDS: Record<RecordKind, Field[]> = {
  implant: [
    { key: 'udi', label: 'UDI-DI' }, { key: 'ref', label: 'REF / catalog #' },
    { key: 'lot', label: 'LOT / batch' }, { key: 'serial', label: 'Serial' },
    { key: 'manufacturer', label: 'Manufacturer' }, { key: 'expiry', label: 'Expiry', type: 'date' },
    { key: 'site', label: 'Site', type: 'select', options: ['venous', 'arterial', 'epidural', 'subarachnoid', 'peritoneal', 'pleural', 'other'] },
    { key: 'powerInjectable', label: 'Power-injectable', type: 'checkbox' },
  ],
  surgical:  [{ key: 'facility', label: 'Facility' }, { key: 'surgeon', label: 'Surgeon' }],
  lab:       [{ key: 'orderedBy', label: 'Ordered by' }],
  radiology: [{ key: 'modality', label: 'Modality', type: 'select', options: ['X-ray', 'CT', 'MRI', 'Ultrasound', 'PET', 'Mammography', 'Other'] }, { key: 'bodyRegion', label: 'Body region' }],
}

const inp: React.CSSProperties = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 10, padding: '10px 13px', color: C.text, fontSize: 14, width: '100%' }
const lbl: React.CSSProperties = { fontSize: 12, color: C.muted, display: 'block', marginBottom: 5 }

export default function Records() {
  const { t } = useT()
  const [kind, setKind] = useState<RecordKind>('implant')
  const { data, loading, error, reload } = useAsync(() => listRecords(kind), [kind])
  const [adding, setAdding] = useState(false)
  const records = data ?? []

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="plan" title={t('rec.title')} sub={t('rec.sub')} color={C.cyan} />

      {/* category tabs */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {RECORD_KINDS.map(k => {
          const on = k === kind, c = KIND_UI[k].color
          return (
            <button key={k} onClick={() => setKind(k)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 15px', borderRadius: 999, cursor: 'pointer',
              fontFamily: 'Rajdhani,sans-serif', fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap',
              border: `1px solid ${on ? c : 'rgba(255,255,255,0.10)'}`, background: on ? `${c}1f` : 'transparent', color: on ? C.text : C.muted,
            }}>
              <Ico name={KIND_UI[k].icon} size={16} color={c} /> {t('rec.tab.' + k)}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <Button onClick={() => setAdding(true)}><Ico name="plus" size={16} color={C.navy950} /> {t('rec.add')}</Button>
      </div>

      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}

      {!loading && !error && records.length === 0 && (
        <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('rec.empty')}</p></Card>
      )}

      {!loading && !error && records.length > 0 && (
        <div style={{ display: 'grid', gap: 12 }}>
          {records.map(r => <RecordCard key={r.id} r={r} onDeleted={reload} />)}
        </div>
      )}

      {adding && <RecordForm kind={kind} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
    </div>
  )
}

function RecordCard({ r, onDeleted }: { r: PatientRecord; onDeleted: () => void }) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  const c = KIND_UI[r.kind].color
  const detail = r.detail || {}
  const chips = FIELDS[r.kind]
    .filter(f => detail[f.key] !== undefined && detail[f.key] !== '' && detail[f.key] !== false)
    .map(f => `${f.label}: ${f.type === 'checkbox' ? '✓' : String(detail[f.key])}`)

  const open = async (path: string) => { const u = await fileUrl(path); if (u) window.open(u, '_blank', 'noopener') }
  const remove = async () => {
    if (!window.confirm(t('rec.confirmDelete'))) return
    setBusy(true)
    try { await deleteRecord(r.id, r.files); onDeleted() } finally { setBusy(false) }
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', background: `${c}18`, border: `1px solid ${c}33`, flex: '0 0 auto' }}>
          <Ico name={KIND_UI[r.kind].icon} size={19} color={c} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text }}>{r.title || t('rec.tab.' + r.kind)}</span>
            {r.record_date && <span style={{ fontSize: 12, color: C.muted, fontFamily: 'DM Mono,monospace' }}>{r.record_date}</span>}
          </div>
          {chips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {chips.map((ch, i) => <span key={i} style={{ fontSize: 11.5, color: C.muted, background: C.navy900, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '3px 8px' }}>{ch}</span>)}
            </div>
          )}
          {r.notes && <p style={{ fontSize: 13, color: C.muted, margin: '8px 0 0', lineHeight: 1.5 }}>{r.notes}</p>}
          {r.files?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {r.files.map((f, i) => (
                <button key={i} onClick={() => open(f.path)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.cyan, background: `${C.cyan}12`, border: `1px solid ${C.cyan}33`, borderRadius: 8, padding: '5px 10px', cursor: 'pointer' }}>
                  <Ico name="billing" size={13} color={C.cyan} /> {f.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={remove} disabled={busy} aria-label={t('rec.delete')} style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', padding: 4, flex: '0 0 auto' }}>
          <Ico name="revoke" size={16} color={C.muted} />
        </button>
      </div>
    </Card>
  )
}

function RecordForm({ kind, onClose, onSaved }: { kind: RecordKind; onClose: () => void; onSaved: () => void }) {
  const { t } = useT()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [notes, setNotes] = useState('')
  const [detail, setDetail] = useState<Record<string, unknown>>({})
  const [files, setFiles] = useState<File[]>([])
  const [scan, setScan] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const c = KIND_UI[kind].color

  const set = (k: string, v: unknown) => setDetail(d => ({ ...d, [k]: v }))
  const onScan = (text: string) => {
    const u = parseGs1(text)
    setDetail(d => ({ ...d, udi: u.di ?? d.udi, lot: u.lot ?? d.lot, serial: u.serial ?? d.serial, expiry: u.expiry ?? d.expiry }))
    setScan(false)
  }

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await createRecord({ kind, title, recordDate: date || null, detail, notes, files })
      onSaved()
    } catch (e) { setErr((e as Error)?.message || t('rec.saveFailed')); setBusy(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <Card style={{ width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ico name={KIND_UI[kind].icon} size={19} color={c} />
            <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 17, color: C.text }}>{t('rec.addKind.' + kind)}</span>
          </div>
          <button onClick={onClose} aria-label={t('rec.cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><Ico name="x" size={18} color={C.muted} /></button>
        </div>

        {kind === 'implant' && (
          <button onClick={() => setScan(true)} style={{ width: '100%', marginBottom: 14, padding: '11px', borderRadius: 10, border: `1px solid ${c}55`, background: `${c}14`, color: C.text, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Ico name="camera" size={17} color={c} /> {t('rec.scan')}
          </button>
        )}

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('rec.f.title')}</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('rec.f.titlePh.' + kind)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('rec.f.date')}</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          {FIELDS[kind].map(f => (
            <div key={f.key} style={{ gridColumn: f.type === 'checkbox' ? '1 / -1' : undefined }}>
              {f.type === 'checkbox' ? (
                <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 14, color: C.text, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!detail[f.key]} onChange={e => set(f.key, e.target.checked)} /> {f.label}
                </label>
              ) : f.type === 'select' ? (
                <>
                  <label style={lbl}>{f.label}</label>
                  <select value={(detail[f.key] as string) || ''} onChange={e => set(f.key, e.target.value)} style={inp}>
                    <option value="">—</option>
                    {f.options!.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <label style={lbl}>{f.label}</label>
                  <input type={f.type === 'date' ? 'date' : 'text'} value={(detail[f.key] as string) || ''} onChange={e => set(f.key, e.target.value)} style={inp} />
                </>
              )}
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{t('rec.f.notes')}</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>{t('rec.f.files')}</label>
          <input type="file" multiple accept="image/*,application/pdf" onChange={e => setFiles(Array.from(e.target.files || []))} style={{ ...inp, padding: 9 }} />
          {files.length > 0 && <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{files.map(f => f.name).join(', ')}</div>}
        </div>

        {err && <p style={{ color: C.red, fontSize: 13, marginBottom: 12 }}>{err}</p>}
        <Button onClick={save} style={{ width: '100%', opacity: busy ? 0.6 : 1 }}>
          {busy ? <Spinner label={t('rec.saving')} /> : <>{t('rec.save')}</>}
        </Button>
      </Card>

      {scan && <BarcodeScanner onScan={onScan} onClose={() => setScan(false)} />}
    </div>
  )
}
