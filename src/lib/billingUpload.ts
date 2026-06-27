import { supabase, cr } from './supabase'

export const DOC_TYPES = ['physicians', 'laboratory', 'radiology', 'medications', 'other'] as const
export type DocType = typeof DOC_TYPES[number]

export type BillingDocUpload = {
  upload_id: string
  doc_type: DocType
  file_name: string | null
  mime_type: string | null
  file_size_bytes: number | null
  uploaded_at: string
  extraction_status: 'pending' | 'processing' | 'extracted' | 'needs_review' | 'committed' | 'failed'
  extracted: {
    kind?: string; provider_or_payer?: string | null; invoice_number?: string | null;
    service_date?: string | null; currency?: string | null; total_amount?: number | null;
    patient_paid?: number | null; insurance_paid?: number | null; confidence?: number;
  } | null
  extraction_error: string | null
  notes: string | null
}

export async function listUploads(): Promise<BillingDocUpload[]> {
  const { data, error } = await cr().rpc('companion_my_billing_uploads')
  if (error) throw error
  return (data ?? []) as BillingDocUpload[]
}

// Storage → register row → kick off AI extraction. Returns the final status.
export async function uploadBillingDoc(file: File, docType: DocType): Promise<{ upload_id: string; status: string }> {
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('Not signed in')

  const ext = (file.name.split('.').pop() || 'pdf').toLowerCase()
  const path = `${uid}/${crypto.randomUUID()}.${ext}`

  const up = await supabase.storage.from('billing-uploads')
    .upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
  if (up.error) throw up.error

  const { data: uploadId, error: rpcErr } = await cr().rpc('companion_create_billing_upload', {
    p_doc_type: docType, p_file_path: path, p_file_name: file.name,
    p_mime_type: file.type || 'application/pdf', p_size: file.size,
  })
  if (rpcErr) throw rpcErr

  const { data: sess } = await supabase.auth.getSession()
  const res = await fetch('/api/companion-billing-extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sess.session?.access_token}` },
    body: JSON.stringify({ upload_id: uploadId }),
  })
  const out = await res.json().catch(() => ({} as any))
  return { upload_id: uploadId as string, status: out?.status || 'pending' }
}

export async function commitUpload(uploadId: string): Promise<string> {
  const { data, error } = await cr().rpc('companion_commit_billing_upload', { p_upload_id: uploadId })
  if (error) throw error
  return data as string
}
