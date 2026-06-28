import { useState, useRef } from 'react'
import { C, Card, Ico, Spinner, SectionHeader, GradientStat, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { loadBilling, markPayment, approvePayment, type BillingSummary, type Invoice, type Payment, type Reimbursement, type Coverage } from '../lib/billing'
import { useAuth } from '../lib/auth'
import { uploadBillingDoc, listUploads, commitUpload, voidUpload, updateExtraction, DOC_TYPES, type DocType, type BillingDocUpload } from '../lib/billingUpload'

const money = (n: number | null | undefined, currency = 'USD') =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: currency === 'COP' ? 0 : 2 }).format(n)
const fmtDate = (s: string | null | undefined) =>
  !s ? '—' : new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

function statusColor(status: string | null): string {
  const s = (status || '').toLowerCase()
  if (['paid', 'closed', 'settled', 'committed'].includes(s)) return C.green
  if (['partial', 'pending', 'needs_review', 'processing', 'extracted'].includes(s)) return C.amber
  if (['overdue', 'past_due', 'denied', 'rejected', 'failed'].includes(s)) return C.red
  return C.cyan
}
function Pill({ label, color }: { label: string; color: string }) {
  return <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'DM Mono,monospace', textTransform: 'uppercase', letterSpacing: '.06em', color, background: color + '1f', border: `1px solid ${color}3d`, borderRadius: 999, padding: '3px 10px' }}>{label}</span>
}
function Row({ label, value, color = C.text }: { label: string; value: React.ReactNode; color?: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '7px 0', borderBottom: `1px solid ${C.navy700}55` }}><span style={{ fontSize: 13, color: C.muted }}>{label}</span><span style={{ fontSize: 14.5, fontWeight: 600, color }}>{value}</span></div>
}
function SubHead({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, margin: '22px 0 10px' }}>{children}</div>
}

// ── upload panel ─────────────────────────────────────────────────────────────
function UploadPanel({ accent, onDone }: { accent: string; onDone: () => void }) {
  const { t } = useT()
  const [docType, setDocType] = useState<DocType>('physicians')
  const [docLabel, setDocLabel] = useState('')
  const [effectiveDate, setEffectiveDate] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const inputStyle = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '7px 10px', width: '100%' }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const { status } = await uploadBillingDoc(file, docType)
      setMsg(t(status === 'extracted' ? 'bill.uploadExtracted' : 'bill.uploadReview'))
      setDocLabel(''); setEffectiveDate(''); setAmount(''); setNotes('')
      onDone()
    } catch (err: any) {
      setMsg(err?.message || 'Upload failed')
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <Card accent={accent} style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, marginBottom: 4 }}>{t('bill.upload')}</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 12 }}>{t('bill.uploadHint')}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {DOC_TYPES.map(dt => (
          <button key={dt} onClick={() => setDocType(dt)} disabled={busy}
            style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
              color: docType === dt ? C.navy900 : C.muted, background: docType === dt ? accent : 'transparent',
              border: `1px solid ${docType === dt ? accent : C.navy700}` }}>
            {t('docType.' + dt)}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.docLabel')}</span>
          <input value={docLabel} onChange={e => setDocLabel(e.target.value)} disabled={busy} style={inputStyle} placeholder={t('bill.docLabel')} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.effectiveDate')}</span>
          <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} disabled={busy} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.amount')}</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} disabled={busy} style={inputStyle} />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.currency')}</span>
          <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={busy} style={inputStyle as any}>
            <option value="USD">USD</option><option value="COP">COP</option><option value="EUR">EUR</option>
          </select>
        </label>
        <label style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.notes')}</span>
          <input value={notes} onChange={e => setNotes(e.target.value)} disabled={busy} style={inputStyle} />
        </label>
      </div>
      <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current?.click()} disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, padding: '10px 18px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer', color: C.navy900, background: `linear-gradient(90deg, ${accent}, ${C.cyan})`, border: 'none' }}>
        <Ico name="plus" /> {busy ? t('bill.uploading') : t('bill.uploadBtn')}
      </button>
      {msg && <div style={{ fontSize: 13, color: C.subtle, marginTop: 10 }}>{msg}</div>}
    </Card>
  )
}

const EDIT_KINDS = ['invoice', 'receipt', 'receipt_and_invoice', 'insurance_eob', 'unknown']
const EDIT_CURRENCIES = ['USD', 'COP', 'EUR']

function UploadsList({ items, onChange }: { items: BillingDocUpload[]; onChange: () => void }) {
  const { t } = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Record<string, any>>({})
  const [voidId, setVoidId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [voidError, setVoidError] = useState(false)

  const field = (k: string, v: any) => setEditForm(f => ({ ...f, [k]: v }))
  const isBusy = (id: string) => busy === id

  if (!items.length) return <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noDocs')}</p></Card>

  const inputStyle = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '7px 10px', width: '100%' }

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((u, i) => {
        const ex = u.extracted || {}
        const amt = ex.total_amount ?? ex.insurance_paid ?? ex.patient_paid
        const uncommitted = u.extraction_status !== 'committed'
        const isEditing = editId === u.upload_id
        const isVoiding = voidId === u.upload_id

        return (
          <div key={u.upload_id} style={{ borderTop: i ? `1px solid ${C.navy700}55` : 'none' }}>
            <div style={{ padding: '13px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                  <Pill label={t('docType.' + u.doc_type)} color={C.cyan} />
                  <Pill label={t('bill.st.' + u.extraction_status)} color={statusColor(u.extraction_status)} />
                </div>
                <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{u.file_name}</div>
                <div style={{ fontSize: 12, color: C.subtle }}>{[ex.provider_or_payer, ex.invoice_number, fmtDate(u.uploaded_at)].filter(Boolean).join(' · ')}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {amt != null && !isEditing && (
                  <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text }}>{money(amt, ex.currency || 'USD')}</div>
                )}
                {u.extraction_status === 'extracted' && !isEditing && !isVoiding && (
                  <button disabled={isBusy(u.upload_id)}
                    onClick={async () => { setBusy(u.upload_id); try { await commitUpload(u.upload_id); onChange() } finally { setBusy(null) } }}
                    style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: C.navy900, background: C.green, border: 'none' }}>
                    {isBusy(u.upload_id) ? t('bill.posting') : t('bill.postBtn')}
                  </button>
                )}
                {uncommitted && !isEditing && !isVoiding && (
                  <>
                    <button disabled={isBusy(u.upload_id)}
                      onClick={() => { setVoidId(null); setEditId(u.upload_id); setEditForm({ kind: ex.kind || '', provider_or_payer: ex.provider_or_payer || '', total_amount: ex.total_amount ?? '', currency: ex.currency || 'USD', service_date: ex.service_date || '' }) }}
                      style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', color: C.muted, background: 'transparent', border: `1px solid ${C.subtle}` }}>
                      {t('bill.edit')}
                    </button>
                    <button disabled={isBusy(u.upload_id)}
                      onClick={() => { setEditId(null); setVoidId(u.upload_id); setVoidReason(''); setVoidError(false) }}
                      style={{ fontSize: 12.5, fontWeight: 600, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', color: C.red, background: 'transparent', border: `1px solid ${C.red}55` }}>
                      {t('bill.void')}
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditing && (
              <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: C.muted }}>Kind</span>
                  <select value={editForm.kind} onChange={e => field('kind', e.target.value)} style={inputStyle as any}>
                    {EDIT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                  </select>
                </label>
                <label style={{ gridColumn: '1/-1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: C.muted }}>Provider / payer</span>
                  <input value={editForm.provider_or_payer} onChange={e => field('provider_or_payer', e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: C.muted }}>Amount</span>
                  <input type="number" value={editForm.total_amount} onChange={e => field('total_amount', e.target.value)} style={inputStyle} />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: C.muted }}>Currency</span>
                  <select value={editForm.currency} onChange={e => field('currency', e.target.value)} style={inputStyle as any}>
                    {EDIT_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 11.5, color: C.muted }}>Service date</span>
                  <input type="date" value={editForm.service_date} onChange={e => field('service_date', e.target.value)} style={inputStyle} />
                </label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <button disabled={isBusy(u.upload_id)}
                    onClick={async () => {
                      setBusy(u.upload_id)
                      try {
                        const patch: Record<string, unknown> = {}
                        if (editForm.kind) patch.kind = editForm.kind
                        if (editForm.provider_or_payer !== '') patch.provider_or_payer = editForm.provider_or_payer
                        if (editForm.total_amount !== '') patch.total_amount = Number(editForm.total_amount)
                        if (editForm.currency) patch.currency = editForm.currency
                        if (editForm.service_date) patch.service_date = editForm.service_date
                        await updateExtraction(u.upload_id, patch)
                        setEditId(null)
                        onChange()
                      } finally { setBusy(null) }
                    }}
                    style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: C.navy900, background: C.mint, border: 'none' }}>
                    {t('bill.save')}
                  </button>
                  <button onClick={() => setEditId(null)}
                    style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: C.muted, background: 'transparent', border: `1px solid ${C.subtle}` }}>
                    {t('bill.cancel')}
                  </button>
                </div>
              </div>
            )}

            {isVoiding && (
              <div style={{ padding: '0 20px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 12, color: C.muted }}>{t('bill.voidReason')}</span>
                  <input value={voidReason} onChange={e => { setVoidReason(e.target.value); setVoidError(false) }}
                    style={{ ...inputStyle, border: `1px solid ${voidError ? C.red : C.subtle}` }} />
                  {voidError && <span style={{ fontSize: 11.5, color: C.red }}>{t('bill.voidReasonRequired')}</span>}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button disabled={isBusy(u.upload_id)}
                    onClick={async () => {
                      if (!voidReason.trim()) { setVoidError(true); return }
                      setBusy(u.upload_id)
                      try { await voidUpload(u.upload_id, voidReason.trim()); setVoidId(null); onChange() } finally { setBusy(null) }
                    }}
                    style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: '#fff', background: C.red, border: 'none' }}>
                    {isBusy(u.upload_id) ? '…' : t('bill.void')}
                  </button>
                  <button onClick={() => setVoidId(null)}
                    style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: C.muted, background: 'transparent', border: `1px solid ${C.subtle}` }}>
                    {t('bill.cancel')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </Card>
  )
}

function SummaryBlock({ s }: { s: BillingSummary }) {
  const { t } = useT()
  const owes = s.total_balance_due > 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: 'DM Mono,monospace', fontSize: 12, color: C.muted, letterSpacing: '.1em', marginBottom: 8 }}>{s.currency}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <GradientStat icon="billing" label={t('bill.balanceDue')} value={money(s.total_balance_due, s.currency)} from={owes ? C.amber : C.mint} to={owes ? '#f59e0b' : C.cyan} />
        <GradientStat icon="check" label={t('bill.youPaid')} value={money(s.total_patient_paid, s.currency)} from={C.mint} to={C.mintDk} />
        <GradientStat icon="journal" label={t('bill.charges')} value={money(s.total_charges, s.currency)} from={C.cyan} to="#3b82f6" />
      </div>
    </div>
  )
}

function CoverageCard({ cov, accent }: { cov: Coverage; accent: string }) {
  const { t } = useT()
  const oopPct = cov.out_of_pocket_max && cov.out_of_pocket_max > 0 ? Math.min(100, Math.round(((cov.out_of_pocket_met || 0) / cov.out_of_pocket_max) * 100)) : null
  return (
    <Card accent={accent} style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.text }}>{cov.insurance_company || t('bill.coverage')}</div>
          {cov.plan_name && <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>{cov.plan_name}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {cov.is_primary && <Pill label={t('bill.primary')} color={C.cyan} />}
          {cov.eligibility_verified && <Pill label={t('bill.verified')} color={C.green} />}
        </div>
      </div>
      <Row label={t('bill.copay')} value={cov.copay_amount != null ? money(cov.copay_amount) : t('bill.noCopay')} />
      <Row label={t('bill.deductible')} value={money(cov.deductible_amount)} />
      {cov.coinsurance_pct != null && <Row label={t('bill.coinsurance')} value={`${cov.coinsurance_pct}%`} />}
      {cov.visit_limit != null && <Row label={t('bill.visits')} value={`${cov.visits_used ?? 0} / ${cov.visit_limit}`} />}
      {cov.out_of_pocket_max != null && (
        <div style={{ paddingTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: C.muted, marginBottom: 6 }}>
            <span>{t('bill.oop')}</span><span style={{ color: C.text, fontWeight: 600 }}>{money(cov.out_of_pocket_met)} / {money(cov.out_of_pocket_max)}</span>
          </div>
          {oopPct != null && <div style={{ height: 8, borderRadius: 999, background: C.navy700, overflow: 'hidden' }}><div style={{ width: `${oopPct}%`, height: '100%', background: `linear-gradient(90deg, ${accent}, ${C.cyan})` }} /></div>}
        </div>
      )}
    </Card>
  )
}

const PAYMENT_METHODS = ['cash', 'card', 'transfer', 'check', 'other'] as const

function MarkPaidDialog({ inv, onDone, onCancel }: { inv: Invoice; onDone: () => void; onCancel: () => void }) {
  const { t } = useT()
  const [amount, setAmount] = useState(String(inv.balance_due))
  const [method, setMethod] = useState('transfer')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputStyle = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '7px 10px', width: '100%' }

  async function submit() {
    if (!amount || Number(amount) <= 0) return
    setBusy(true); setErr(null)
    try {
      await markPayment(inv.invoice_id, Number(amount), method, reference || undefined, note || undefined)
      onDone()
    } catch (e: any) {
      setErr(e?.message || 'Error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ padding: '0 20px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.amount')}</span>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.method')}</span>
        <select value={method} onChange={e => setMethod(e.target.value)} style={inputStyle as any}>
          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{t('bill.method' + m.charAt(0).toUpperCase() + m.slice(1))}</option>)}
        </select>
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.reference')}</span>
        <input value={reference} onChange={e => setReference(e.target.value)} style={inputStyle} />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 11.5, color: C.muted }}>{t('bill.note')}</span>
        <input value={note} onChange={e => setNote(e.target.value)} style={inputStyle} />
      </label>
      {err && <div style={{ gridColumn: '1/-1', fontSize: 12, color: C.red }}>{err}</div>}
      <div style={{ gridColumn: '1/-1', display: 'flex', gap: 8, marginTop: 4 }}>
        <button disabled={busy} onClick={submit}
          style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: busy ? 'wait' : 'pointer', color: C.navy950, background: C.mint, border: 'none' }}>
          {busy ? t('bill.submitting') : t('bill.submit')}
        </button>
        <button onClick={onCancel}
          style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: C.muted, background: 'transparent', border: `1px solid ${C.subtle}` }}>
          {t('bill.cancel')}
        </button>
      </div>
    </div>
  )
}

function ApproveRejectControls({ inv, onDone }: { inv: Invoice; onDone: () => void }) {
  const { t } = useT()
  const [showReject, setShowReject] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonErr, setReasonErr] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputStyle = { background: C.navy900, border: `1px solid ${C.subtle}`, borderRadius: 8, color: C.text, fontSize: 13, padding: '7px 10px', width: '100%' }

  async function doApprove() {
    setBusy(true)
    try { await approvePayment(inv.invoice_id, true); onDone() } finally { setBusy(false) }
  }
  async function doReject() {
    if (!reason.trim()) { setReasonErr(true); return }
    setBusy(true)
    try { await approvePayment(inv.invoice_id, false, reason.trim()); onDone() } finally { setBusy(false) }
  }

  return (
    <div style={{ padding: '0 20px 12px' }}>
      {!showReject ? (
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy} onClick={doApprove}
            style={{ fontSize: 12.5, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: C.navy950, background: C.green, border: 'none' }}>
            {t('bill.approve')}
          </button>
          <button disabled={busy} onClick={() => setShowReject(true)}
            style={{ fontSize: 12.5, fontWeight: 600, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: C.red, background: 'transparent', border: `1px solid ${C.red}55` }}>
            {t('bill.reject')}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 12, color: C.muted }}>{t('bill.rejectReason')}</span>
            <input value={reason} onChange={e => { setReason(e.target.value); setReasonErr(false) }}
              style={{ ...inputStyle, border: `1px solid ${reasonErr ? C.red : C.subtle}` }} />
            {reasonErr && <span style={{ fontSize: 11.5, color: C.red }}>{t('bill.rejectReasonRequired')}</span>}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button disabled={busy} onClick={doReject}
              style={{ fontSize: 12.5, fontWeight: 700, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: '#fff', background: C.red, border: 'none' }}>
              {t('bill.reject')}
            </button>
            <button onClick={() => setShowReject(false)}
              style={{ fontSize: 12.5, fontWeight: 600, padding: '7px 14px', borderRadius: 8, cursor: 'pointer', color: C.muted, background: 'transparent', border: `1px solid ${C.subtle}` }}>
              {t('bill.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function paymentMarkColor(state: string | null): string {
  if (state === 'pending_approval') return C.amber
  if (state === 'approved') return C.green
  if (state === 'rejected') return C.red
  return C.subtle
}

function paymentMarkLabel(state: string | null, t: (k: string) => string): string {
  if (state === 'pending_approval') return t('bill.pendingApproval')
  if (state === 'approved') return t('bill.approved')
  if (state === 'rejected') return t('bill.rejected')
  return ''
}

function InvoiceList({ items, isStaff, onRefresh }: { items: Invoice[]; isStaff: boolean; onRefresh: () => void }) {
  const { t } = useT()
  const [markId, setMarkId] = useState<number | null>(null)
  if (!items.length) return <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noInvoices')}</p></Card>
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((inv, i) => {
        const markState = (inv as any).payment_mark_state as string | null
        const isMarking = markId === inv.invoice_id
        return (
          <div key={inv.invoice_id} style={{ borderTop: i ? `1px solid ${C.navy700}55` : 'none' }}>
            <div style={{ padding: '14px 20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 13.5, color: C.text, fontWeight: 600 }}>{inv.invoice_number}</span>
                    {inv.status && <Pill label={inv.status} color={statusColor(inv.status)} />}
                    {markState && <Pill label={paymentMarkLabel(markState, t)} color={paymentMarkColor(markState)} />}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted }}>{fmtDate(inv.invoice_date)}{inv.due_date ? ` · ${t('bill.due')} ${fmtDate(inv.due_date)}` : ''}</div>
                  {inv.notes && <div style={{ fontSize: 12, color: C.subtle, marginTop: 3 }}>{inv.notes}</div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 20, color: inv.balance_due > 0 ? C.amber : C.green }}>{money(inv.balance_due, inv.currency)}</div>
                    <div style={{ fontSize: 11.5, color: C.subtle }}>{t('bill.ofCharges', { total: money(inv.total_charges, inv.currency) })}</div>
                  </div>
                  {inv.balance_due > 0 && !markState && !isMarking && (
                    <button onClick={() => setMarkId(inv.invoice_id)}
                      style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 8, cursor: 'pointer', color: C.navy950, background: C.mint, border: 'none', whiteSpace: 'nowrap' }}>
                      {t('bill.markPaid')}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {isMarking && (
              <MarkPaidDialog inv={inv} onDone={() => { setMarkId(null); onRefresh() }} onCancel={() => setMarkId(null)} />
            )}
            {isStaff && markState === 'pending_approval' && (
              <ApproveRejectControls inv={inv} onDone={onRefresh} />
            )}
          </div>
        )
      })}
    </Card>
  )
}

function PaymentList({ items }: { items: Payment[] }) {
  const { t } = useT()
  if (!items.length) return <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noPayments')}</p></Card>
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((p, i) => (
        <div key={p.payment_id} style={{ padding: '13px 20px', borderTop: i ? `1px solid ${C.navy700}55` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{fmtDate(p.payment_date)}</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{[p.payment_method, p.invoice_number, p.reference_number].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.mint, flexShrink: 0 }}>{money(p.payment_amount, p.currency)}</div>
        </div>
      ))}
    </Card>
  )
}

function ReimbursementList({ items }: { items: Reimbursement[] }) {
  const { t } = useT()
  if (!items.length) return <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noReimbursements')}</p></Card>
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((r, i) => (
        <div key={r.era_id} style={{ padding: '13px 20px', borderTop: i ? `1px solid ${C.navy700}55` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, color: C.text, fontWeight: 600 }}>{r.payer_name}</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{[fmtDate(r.check_date), r.payment_method, r.reference].filter(Boolean).join(' · ')}</div>
          </div>
          <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 18, color: C.cyan, flexShrink: 0 }}>{money(r.total_payment, r.currency)}</div>
        </div>
      ))}
    </Card>
  )
}

export default function Billing() {
  const { t } = useT()
  const A = ACCENTS.billing
  const { staffOrgId } = useAuth()
  const isStaff = !!staffOrgId
  const [refresh, setRefresh] = useState(0)
  const { data, loading, error } = useAsync(loadBilling, [refresh])
  const uploads = useAsync(listUploads, [refresh])
  const bump = () => setRefresh(x => x + 1)

  return (
    <div className="cmp-fade-up">
      <SectionHeader icon="billing" title={t('bill.title')} sub={t('bill.subtitle')} color={A.c} />

      <UploadPanel accent={A.c} onDone={bump} />

      {loading && <Spinner label={t('common.loading')} />}
      {error && <p style={{ color: C.red, fontSize: 14 }}>{error}</p>}

      {data && (
        <>
          {data.summary.length
            ? data.summary.map(s => <SummaryBlock key={s.currency} s={s} />)
            : <Card style={{ marginBottom: 14 }}><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noInvoices')}</p></Card>}

          <SubHead>{t('bill.coverage')}</SubHead>
          {data.coverage.length
            ? data.coverage.map(c => <CoverageCard key={c.insurance_id} cov={c} accent={A.c} />)
            : <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noCoverage')}</p></Card>}

          <SubHead>{t('bill.invoices')}</SubHead>
          <InvoiceList items={data.invoices} isStaff={isStaff} onRefresh={bump} />

          <SubHead>{t('bill.payments')}</SubHead>
          <PaymentList items={data.payments} />

          <SubHead>{t('bill.reimbursements')}</SubHead>
          <ReimbursementList items={data.reimbursements} />

          <SubHead>{t('bill.documents')}</SubHead>
          <UploadsList items={uploads.data ?? []} onChange={bump} />

          <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>{t('bill.disclaimer')}</p>
        </>
      )}
    </div>
  )
}
