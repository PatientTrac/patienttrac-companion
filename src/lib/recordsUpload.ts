import { supabase, cr } from './supabase'

export const RECORD_KINDS = ['implant', 'surgical', 'lab', 'radiology'] as const
export type RecordKind = typeof RECORD_KINDS[number]

export type RecordFile = { path: string; name: string; mime: string; size: number }
export type PatientRecord = {
  id: number
  kind: RecordKind
  title: string | null
  record_date: string | null
  detail: Record<string, unknown>
  files: RecordFile[]
  notes: string | null
  created_at: string
}

export async function listRecords(kind?: RecordKind): Promise<PatientRecord[]> {
  const { data, error } = await cr().rpc('companion_my_records', { p_kind: kind ?? null })
  if (error) throw error
  return (data ?? []) as PatientRecord[]
}

// Upload any attached files to the patient's own storage folder, then create the
// record row via RPC (mirrors billingUpload: storage → register).
export async function createRecord(input: {
  kind: RecordKind
  title?: string
  recordDate?: string | null
  detail?: Record<string, unknown>
  notes?: string
  files?: File[]
}): Promise<number> {
  const { data: u } = await supabase.auth.getUser()
  const uid = u.user?.id
  if (!uid) throw new Error('Not signed in')

  const uploaded: RecordFile[] = []
  for (const file of input.files ?? []) {
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
    const path = `${uid}/${crypto.randomUUID()}.${ext}`
    const up = await supabase.storage.from('companion-records')
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (up.error) throw up.error
    uploaded.push({ path, name: file.name, mime: file.type || '', size: file.size })
  }

  const { data, error } = await cr().rpc('companion_create_record', {
    p_kind: input.kind,
    p_title: input.title ?? null,
    p_record_date: input.recordDate || null,
    p_detail: input.detail ?? {},
    p_files: uploaded,
    p_notes: input.notes ?? null,
  })
  if (error) throw error
  return data as number
}

export async function deleteRecord(id: number, files: RecordFile[]): Promise<void> {
  const { error } = await cr().rpc('companion_delete_record', { p_id: id })
  if (error) throw error
  const paths = (files ?? []).map(f => f.path).filter(Boolean)
  if (paths.length) await supabase.storage.from('companion-records').remove(paths)
}

// Short-lived signed URL to view/download a stored file (the bucket is private).
export async function fileUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from('companion-records').createSignedUrl(path, 600)
  if (error) return null
  return data?.signedUrl ?? null
}
