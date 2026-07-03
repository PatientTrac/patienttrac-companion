import { useState, useEffect } from 'react'
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
  const [open, setOpen] = useState<PatientRecord | null>(null)
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {records.map(r => <RecordTile key={r.id} r={r} onOpen={() => setOpen(r)} />)}
        </div>
      )}

      {adding && <RecordForm kind={kind} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload() }} />}
      {open && <RecordGallery r={open} onClose={() => setOpen(null)} onDeleted={reload} />}
    </div>
  )
}

const isImg = (mime: string) => (mime || '').startsWith('image/')

// Resolve signed URLs for a set of file paths (private bucket) into a path->url map.
function useSignedUrls(paths: string[]) {
  const key = paths.join('|')
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    Promise.all(paths.map(async p => [p, await fileUrl(p)] as const))
      .then(pairs => { if (active) setUrls(Object.fromEntries(pairs.filter(([, u]) => u) as [string, string][])) })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return urls
}

// Grid tile: a document preview strip + the record's headline data. Click → gallery.
function RecordTile({ r, onOpen }: { r: PatientRecord; onOpen: () => void }) {
  const { t } = useT()
  const c = KIND_UI[r.kind].color
  const detail = r.detail || {}
  const files = r.files || []
  const preview = files.slice(0, 4)
  const thumbs = useSignedUrls(preview.filter(f => isImg(f.mime)).map(f => f.path))
  const chips = FIELDS[r.kind]
    .filter(f => detail[f.key] !== undefined && detail[f.key] !== '' && detail[f.key] !== false)
    .slice(0, 3).map(f => `${f.label}: ${f.type === 'checkbox' ? '✓' : String(detail[f.key])}`)

  return (
    <div onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onOpen() }}
      style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', borderRadius: 16, overflow: 'hidden',
        background: 'linear-gradient(180deg, rgba(15,32,64,.5), rgba(6,14,28,.5))', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ position: 'relative', height: 116, display: 'grid', gridTemplateColumns: preview.length > 1 ? '1fr 1fr' : '1fr', gridAutoRows: '1fr', gap: 2, background: C.navy950 }}>
        {preview.length === 0 ? (
          <div style={{ display: 'grid', placeItems: 'center', background: `${c}10` }}><Ico name={KIND_UI[r.kind].icon} size={30} color={c} /></div>
        ) : preview.map((f, i) => (
          <div key={i} style={{ overflow: 'hidden', background: C.navy900, display: 'grid', placeItems: 'center' }}>
            {isImg(f.mime) && thumbs[f.path]
              ? <img src={thumbs[f.path]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <Ico name="billing" size={22} color={C.muted} />}
          </div>
        ))}
        {files.length > 0 && (
          <span style={{ position: 'absolute', bottom: 6, right: 6, fontSize: 11, background: 'rgba(2,10,20,.78)', color: C.text, borderRadius: 6, padding: '2px 7px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <Ico name="billing" size={11} color={C.text} />{files.length}
          </span>
        )}
      </div>
      <div style={{ padding: 14, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flex: '0 0 auto' }} />
          <span style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 15, color: C.text, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title || t('rec.tab.' + r.kind)}</span>
          {r.record_date && <span style={{ fontSize: 11, color: C.muted, fontFamily: 'DM Mono,monospace', flex: '0 0 auto' }}>{r.record_date}</span>}
        </div>
        {chips.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {chips.map((ch, i) => <span key={i} style={{ fontSize: 11, color: C.muted, background: C.navy900, border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '2px 7px', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch}</span>)}
          </div>
        )}
        {r.notes && <p style={{ fontSize: 12.5, color: C.muted, margin: 0, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.notes}</p>}
      </div>
    </div>
  )
}

const navBtn = (side: 'left' | 'right'): React.CSSProperties => ({
  position: 'absolute', top: '50%', left: side === 'left' ? 8 : undefined, right: side === 'right' ? 8 : undefined,
  transform: side === 'left' ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
  background: 'rgba(2,10,20,.6)', border: '1px solid rgba(255,255,255,.14)', borderRadius: '50%', width: 34, height: 34,
  cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
})

// Full document gallery/lightbox for one record + its structured data.
function RecordGallery({ r, onClose, onDeleted }: { r: PatientRecord; onClose: () => void; onDeleted: () => void }) {
  const { t } = useT()
  const c = KIND_UI[r.kind].color
  const files = r.files || []
  const detail = r.detail || {}
  const rows = FIELDS[r.kind].filter(f => detail[f.key] !== undefined && detail[f.key] !== '' && detail[f.key] !== false)
  const [idx, setIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const urls = useSignedUrls(files.map(f => f.path))
  const f = files[idx]
  const url = f ? urls[f.path] : undefined

  const del = async () => {
    if (!window.confirm(t('rec.confirmDelete'))) return
    setBusy(true)
    try { await deleteRecord(r.id, files); onDeleted(); onClose() } finally { setBusy(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(2,10,20,0.92)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e: React.MouseEvent) => e.stopPropagation()} style={{ width: '100%', maxWidth: 780 }}>
      <Card style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: `${c}18`, border: `1px solid ${c}33`, flex: '0 0 auto' }}><Ico name={KIND_UI[r.kind].icon} size={18} color={c} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{r.title || t('rec.tab.' + r.kind)}</div>
            {r.record_date && <div style={{ fontSize: 12, color: C.muted, fontFamily: 'DM Mono,monospace' }}>{r.record_date}</div>}
          </div>
          <button onClick={del} disabled={busy} aria-label={t('rec.delete')} style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', padding: 6 }}><Ico name="revoke" size={17} color={C.muted} /></button>
          <button onClick={onClose} aria-label={t('rec.cancel')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}><Ico name="x" size={18} color={C.muted} /></button>
        </div>

        {files.length > 0 ? (
          <>
            <div style={{ position: 'relative', background: C.navy950, borderRadius: 12, overflow: 'hidden', minHeight: 300, display: 'grid', placeItems: 'center' }}>
              {!url ? <Spinner label="" />
                : isImg(f.mime) ? <img src={url} alt={f.name} style={{ maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }} />
                : <iframe src={url} title={f.name} style={{ width: '100%', height: '60vh', border: 'none', background: '#fff' }} />}
              {files.length > 1 && (
                <>
                  <button onClick={() => setIdx(i => (i - 1 + files.length) % files.length)} style={navBtn('left')} aria-label="Previous"><Ico name="chevron" size={18} color={C.text} /></button>
                  <button onClick={() => setIdx(i => (i + 1) % files.length)} style={navBtn('right')} aria-label="Next"><Ico name="chevron" size={18} color={C.text} /></button>
                </>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 10 }}>
              <span style={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name} · {idx + 1}/{files.length}</span>
              {url && <a href={url} target="_blank" rel="noopener" style={{ fontSize: 12, color: C.cyan, flex: '0 0 auto' }}>{t('rec.open')}</a>}
            </div>
            {files.length > 1 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, overflowX: 'auto' }}>
                {files.map((ff, i) => (
                  <button key={i} onClick={() => setIdx(i)} aria-label={ff.name} style={{ flex: '0 0 auto', width: 54, height: 54, borderRadius: 8, overflow: 'hidden', border: `2px solid ${i === idx ? c : 'transparent'}`, background: C.navy900, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
                    {isImg(ff.mime) && urls[ff.path] ? <img src={urls[ff.path]} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Ico name="billing" size={18} color={C.muted} />}
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <p style={{ color: C.subtle, fontSize: 13, margin: '4px 0' }}>{t('rec.noFiles')}</p>
        )}

        {(rows.length > 0 || r.notes) && (
          <div style={{ marginTop: 16, borderTop: `1px solid ${C.subtle}55`, paddingTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 18px' }}>
              {rows.map(fd => (
                <div key={fd.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                  <span style={{ color: C.muted }}>{fd.label}</span>
                  <span style={{ color: C.text, textAlign: 'right', wordBreak: 'break-word' }}>{fd.type === 'checkbox' ? '✓' : String(detail[fd.key])}</span>
                </div>
              ))}
            </div>
            {r.notes && <p style={{ fontSize: 13, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>{r.notes}</p>}
          </div>
        )}
      </Card>
      </div>
    </div>
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
