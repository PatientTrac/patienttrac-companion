import { cr } from './supabase'

// ── Patient-facing medical accounting (multi-currency, migration 038 + 039) ──
// All reads go through cr.* SECURITY DEFINER RPCs that resolve the caller via
// cr.current_patient_id() and return ONLY that patient's rows. Amounts are in
// their native currency (international patients transact in USD and COP), so
// NEVER sum across currencies — the summary RPC already groups per currency.

export type BillingSummary = {
  currency: string
  total_charges: number
  total_insurance_paid: number
  total_patient_paid: number
  total_adjustments: number
  total_balance_due: number
  open_invoice_count: number
}

export type Invoice = {
  invoice_id: number
  invoice_number: string
  invoice_date: string | null
  due_date: string | null
  status: string | null
  aging_bucket: string | null
  days_outstanding: number | null
  currency: string
  total_charges: number
  insurance_paid: number
  adjustments: number
  amount_paid: number
  balance_due: number
  notes: string | null
}

export type Payment = {
  payment_id: number
  invoice_id: number | null
  invoice_number: string | null
  payment_date: string | null
  payment_amount: number
  currency: string
  payment_method: string | null
  reference_number: string | null
  notes: string | null
}

export type Reimbursement = {
  era_id: string
  superbill_id: number | null
  payer_name: string
  check_date: string | null
  total_payment: number
  currency: string
  status: string | null
  posted_at: string | null
  payment_method: string | null
  reference: string | null
}

export type Coverage = {
  insurance_id: number
  insurance_company: string | null
  plan_name: string | null
  is_primary: boolean
  copay_amount: number | null
  deductible_amount: number | null
  coinsurance_pct: number | null
  out_of_pocket_max: number | null
  out_of_pocket_met: number | null
  visit_limit: number | null
  visits_used: number | null
  eligibility_verified: boolean | null
}

export type BillingBundle = {
  summary: BillingSummary[]   // one row per currency
  invoices: Invoice[]
  payments: Payment[]
  reimbursements: Reimbursement[]
  coverage: Coverage[]
}

async function rpc<T>(name: string): Promise<T[]> {
  const { data, error } = await cr().rpc(name)
  if (error) throw error
  return (data ?? []) as T[]
}

export const getBillingSummary  = () => rpc<BillingSummary>('companion_my_billing_summary')
export const listInvoices       = () => rpc<Invoice>('companion_my_invoices')
export const listPayments       = () => rpc<Payment>('companion_my_payments')
export const listReimbursements = () => rpc<Reimbursement>('companion_my_reimbursements')
export const getCoverage        = () => rpc<Coverage>('companion_my_coverage')

export async function loadBilling(): Promise<BillingBundle> {
  const [summary, invoices, payments, reimbursements, coverage] = await Promise.all([
    getBillingSummary(), listInvoices(), listPayments(), listReimbursements(), getCoverage(),
  ])
  return { summary, invoices, payments, reimbursements, coverage }
}
