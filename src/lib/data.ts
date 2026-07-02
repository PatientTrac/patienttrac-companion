import { cr, supabase } from './supabase'
import type { Ctx } from './auth'

const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }

// ── Medications ─────────────────────────────────────────────
export type Med = { id: number; name: string; dose: string | null; frequency: string | null; active: boolean }
export async function listMeds(): Promise<Med[]> {
  const { data, error } = await cr().from('companion_medication').select('id,name,dose,frequency,active').eq('active', true).order('id')
  if (error) throw error
  return data ?? []
}
export async function addMed(ctx: Ctx, name: string, dose: string, frequency: string) {
  const { error } = await cr().from('companion_medication').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, name, dose, frequency })
  if (error) throw error
}
export async function takenTodayIds(): Promise<number[]> {
  const { data, error } = await cr().from('companion_med_log').select('medication_id').gte('taken_at', today0()).eq('status', 'taken')
  if (error) throw error
  return (data ?? []).map(r => r.medication_id)
}
export async function logMed(ctx: Ctx, medication_id: number) {
  const { error } = await cr().from('companion_med_log').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, medication_id, status: 'taken' })
  if (error) throw error
}
export async function unlogMed(medication_id: number) {
  const { error } = await cr().from('companion_med_log').delete().gte('taken_at', today0()).eq('medication_id', medication_id)
  if (error) throw error
}

// ── Diet ────────────────────────────────────────────────────
export type Diet = { id: number; meal: string | null; description: string | null; logged_at: string }
export async function listDietToday(): Promise<Diet[]> {
  const { data, error } = await cr().from('companion_diet_log').select('id,meal,description,logged_at').gte('logged_at', today0()).order('logged_at')
  if (error) throw error
  return data ?? []
}
export async function addDiet(ctx: Ctx, meal: string, description: string) {
  const { error } = await cr().from('companion_diet_log').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, meal, description })
  if (error) throw error
}

// ── Exercise / activity ─────────────────────────────────────
export type Activity = { id: number; name: string; detail: string | null; logged_at: string }
export async function listActivityToday(): Promise<Activity[]> {
  const { data, error } = await cr().from('companion_activity').select('id,name,detail,logged_at').gte('logged_at', today0()).order('logged_at')
  if (error) throw error
  return data ?? []
}
export async function addActivity(ctx: Ctx, name: string, detail: string) {
  const { error } = await cr().from('companion_activity').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, name, detail })
  if (error) throw error
}

// ── Vitals ──────────────────────────────────────────────────
export type Vital = { id: number; type: string; value: number; unit: string | null; recorded_at: string }
export async function listVitals(): Promise<Vital[]> {
  const { data, error } = await cr().from('companion_vital').select('id,type,value,unit,recorded_at').order('recorded_at', { ascending: false }).limit(20)
  if (error) throw error
  return data ?? []
}
// Ranged fetch for the Vitals dashboard. The DB does the search: filtered by
// `days` (patient-local window) and, when given, by vital `type` server-side —
// so changing the selection re-queries rather than sifting a cached blob.
// Bounded by a hard row cap so a chatty device stream can't blow up the payload.
export async function listVitalsRange(days: number, type?: string): Promise<Vital[]> {
  const since = new Date(); since.setDate(since.getDate() - (days - 1)); since.setHours(0, 0, 0, 0)
  let q = cr().from('companion_vital')
    .select('id,type,value,unit,recorded_at')
    .gte('recorded_at', since.toISOString())
  if (type) q = q.eq('type', type)
  const { data, error } = await q.order('recorded_at', { ascending: false }).limit(2000)
  if (error) throw error
  return data ?? []
}
export async function addVital(ctx: Ctx, type: string, value: number, unit: string) {
  const { error } = await cr().from('companion_vital').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, type, value, unit, source: 'manual' })
  if (error) throw error
}

// ── Journal ─────────────────────────────────────────────────
export type Journal = { id: number; entry_date: string; mood: number | null; pain: number | null; note: string | null; flagged: boolean }
export async function listJournal(): Promise<Journal[]> {
  const { data, error } = await cr().from('companion_journal').select('id,entry_date,mood,pain,note,flagged').order('entry_date', { ascending: false }).limit(30)
  if (error) throw error
  return data ?? []
}
export async function addJournal(ctx: Ctx, mood: number, pain: number, note: string) {
  const flagged = pain >= 8
  const { error } = await cr().from('companion_journal').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, mood, pain, note, flagged })
  if (error) throw error
  if (flagged) {
    await cr().from('companion_alert').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, kind: 'red_flag', severity: 'urgent', detail: `High pain reported (${pain}/10)` })
  }
}

// ── Care plan + AI education log ────────────────────────────
export type CarePlan = { id: number; title: string; condition: string | null; plain_language: string | null }
export async function getActivePlan(): Promise<CarePlan | null> {
  const { data, error } = await cr().from('care_plan').select('id,title,condition,plain_language').eq('status', 'active').order('id', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data ?? null
}
export async function logEducation(ctx: Ctx, care_plan_id: number | null, question: string, ai_answer: string) {
  await cr().from('companion_education').insert({ patient_id: ctx.patientId, org_id: ctx.orgId, care_plan_id, question, ai_answer, model: 'claude-sonnet-4-6' })
}

// ── Messages (patient ↔ care team) ──────────────────────────
export type Message = { id: number; sender_role: 'patient' | 'staff'; body: string; created_at: string; read_by_patient: boolean }
export async function listMessages(): Promise<Message[]> {
  const { data, error } = await cr().from('companion_message')
    .select('id,sender_role,body,created_at,read_by_patient').order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as Message[]
}
export async function sendMessage(body: string) {
  const { error } = await cr().rpc('companion_patient_send_message', { p_body: body })
  if (error) throw error
}
export async function markStaffMessagesRead() {
  // Patient acknowledges staff replies. RLS limits this to the patient's own thread.
  const { error } = await cr().from('companion_message')
    .update({ read_by_patient: true }).eq('sender_role', 'staff').eq('read_by_patient', false)
  if (error) throw error
}

// ── Self-chart: clinical read surfaces (Phase 4) ────────────
export type SelfChartMed = {
  id: number
  name: string
  dose: string | null
  route: string | null
  frequency: string | null
  instructions: string | null
  active: boolean
  care_plan_id: number | null
}
export async function listSelfChartMeds(): Promise<SelfChartMed[]> {
  const { data, error } = await cr()
    .from('companion_medication')
    .select('id,name,dose,route,frequency,instructions,active,care_plan_id')
    .eq('active', true)
    .order('id')
  if (error) throw error
  return (data ?? []) as SelfChartMed[]
}


export type EducationEntry = {
  id: number
  question: string
  ai_answer: string
  care_plan_id: number | null
}
export async function listEducationEntries(): Promise<EducationEntry[]> {
  const { data, error } = await cr()
    .from('companion_education')
    .select('id,question,ai_answer,care_plan_id')
    .order('id', { ascending: true })
  if (error) throw error
  return (data ?? []) as EducationEntry[]
}

export type TranslateResult = {
  translated_text: string
  is_machine_translated: boolean
  reviewed_by: string | null
}
export async function translateBlock(
  sourceTable: string,
  sourceId: number,
  sourceColumn: string,
  targetLang: 'es' | 'fr'
): Promise<TranslateResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('companion-translate', {
      body: { source_table: sourceTable, source_id: String(sourceId), source_column: sourceColumn, target_lang: targetLang },
    })
    if (error || !data) return null
    return data as TranslateResult
  } catch {
    return null
  }
}

// ── Lab results (flowsheet grid) ────────────────────────────
export type LabResult = {
  id: number
  lab_name: string
  test_code: string | null
  result_value: string | null
  result_unit: string | null
  reference_range: string | null
  is_abnormal: boolean | null
  lab_date: string
}
export async function listLabResults(): Promise<LabResult[]> {
  const { data, error } = await cr()
    .from('lab_results')
    .select('id,lab_name,test_code,result_value,result_unit,reference_range,is_abnormal,lab_date')
    .order('lab_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as LabResult[]
}

// ── Progress trends (patient's own data) ────────────────────
export type Trends = {
  window_days: number
  active_meds: number
  adherence: { d: string; n: number }[]
  journal: { d: string; mood: number | null; pain: number | null; energy: number | null }[]
  vitals: Record<string, { d: string; v: number }[]>
  summary: { avg_mood: number | null; avg_pain: number | null; adherence_rate: number | null; pain_trend: string }
}
export async function getMyTrends(days = 30): Promise<Trends> {
  const { data, error } = await cr().rpc('companion_my_trends', { p_days: days })
  if (error) throw error
  return data as Trends
}
