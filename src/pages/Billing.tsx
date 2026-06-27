import { useState, useRef } from 'react'
import { C, Card, Ico, Spinner, SectionHeader, GradientStat, ACCENTS, useAsync } from '../lib/ui'
import { useT } from '../lib/i18n'
import { loadBilling, type BillingSummary, type Invoice, type Payment, type Reimbursement, type Coverage } from '../lib/billing'
import { uploadBillingDoc, listUploads, DOC_TYPES, type DocType, type BillingDocUpload } from '../lib/billingUpload'

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
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setMsg(null)
    try {
      const { status } = await uploadBillingDoc(file, docType)
      setMsg(t(status === 'committed' ? 'bill.uploadOk' : 'bill.uploadReview'))
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
      <input ref={inputRef} type="file" accept="application/pdf,image/*" onChange={onFile} disabled={busy} style={{ display: 'none' }} />
      <button onClick={() => inputRef.current?.click()} disabled={busy}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, padding: '10px 18px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer', color: C.navy900, background: `linear-gradient(90deg, ${accent}, ${C.cyan})`, border: 'none' }}>
        <Ico name="plus" /> {busy ? t('bill.uploading') : t('bill.uploadBtn')}
      </button>
      {msg && <div style={{ fontSize: 13, color: C.subtle, marginTop: 10 }}>{msg}</div>}
    </Card>
  )
}

function UploadsList({ items }: { items: BillingDocUpload[] }) {
  const { t } = useT()
  if (!items.length) return <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noDocs')}</p></Card>
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((u, i) => {
        const ex = u.extracted || {}
        const amt = ex.total_amount ?? ex.insurance_paid ?? ex.patient_paid
        return (
          <div key={u.upload_id} style={{ padding: '13px 20px', borderTop: i ? `1px solid ${C.navy700}55` : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
                <Pill label={t('docType.' + u.doc_type)} color={C.cyan} />
                <Pill label={t('bill.st.' + u.extraction_status)} color={statusColor(u.extraction_status)} />
              </div>
              <div style={{ fontSize: 13, color: C.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 220 }}>{u.file_name}</div>
              <div style={{ fontSize: 12, color: C.subtle }}>{[ex.provider_or_payer, ex.invoice_number, fmtDate(u.uploaded_at)].filter(Boolean).join(' · ')}</div>
            </div>
            {amt != null && <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 16, color: C.text, flexShrink: 0 }}>{money(amt, ex.currency || 'USD')}</div>}
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

function InvoiceList({ items }: { items: Invoice[] }) {
  const { t } = useT()
  if (!items.length) return <Card><p style={{ color: C.subtle, fontSize: 14, margin: 0 }}>{t('bill.noInvoices')}</p></Card>
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {items.map((inv, i) => (
        <div key={inv.invoice_id} style={{ padding: '14px 20px', borderTop: i ? `1px solid ${C.navy700}55` : 'none' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                <span style={{ fontFamily: 'DM Mono,monospace', fontSize: 13.5, color: C.text, fontWeight: 600 }}>{inv.invoice_number}</span>
                {inv.status && <Pill label={inv.status} color={statusColor(inv.status)} />}
              </div>
              <div style={{ fontSize: 12.5, color: C.muted }}>{fmtDate(inv.invoice_date)}{inv.due_date ? ` · ${t('bill.due')} ${fmtDate(inv.due_date)}` : ''}</div>
              {inv.notes && <div style={{ fontSize: 12, color: C.subtle, marginTop: 3 }}>{inv.notes}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'Rajdhani,sans-serif', fontWeight: 700, fontSize: 20, color: inv.balance_due > 0 ? C.amber : C.green }}>{money(inv.balance_due, inv.currency)}</div>
              <div style={{ fontSize: 11.5, color: C.subtle }}>{t('bill.ofCharges', { total: money(inv.total_charges, inv.currency) })}</div>
            </div>
          </div>
        </div>
      ))}
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
          <InvoiceList items={data.invoices} />

          <SubHead>{t('bill.payments')}</SubHead>
          <PaymentList items={data.payments} />

          <SubHead>{t('bill.reimbursements')}</SubHead>
          <ReimbursementList items={data.reimbursements} />

          <SubHead>{t('bill.documents')}</SubHead>
          <UploadsList items={uploads.data ?? []} />

          <p style={{ fontSize: 12.5, color: C.subtle, marginTop: 18, lineHeight: 1.6 }}>{t('bill.disclaimer')}</p>
        </>
      )}
    </div>
  )
}
