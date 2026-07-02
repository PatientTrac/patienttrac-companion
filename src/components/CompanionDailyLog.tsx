// src/components/CompanionDailyLog.tsx
// PatientTrac Companion — Daily Log calendar (DB-backed, both directions).
//
// Rewritten from the artifact prototype (audit H1–H4):
//  • styled with the Companion dark design system (src/lib/ui.tsx tokens) —
//    the previous version depended on Tailwind, which is not installed
//  • entries persist to and HYDRATE FROM the server:
//      GET  /api/companion-log-history  (cr.companion_log_history)
//      POST /api/companion-log-day      (cr.companion_save_day_log)
//    — no window.storage / localStorage; PHI never touches browser storage
//  • failed saves are marked "unsynced" instead of silently shown as saved
//  • defaults to TODAY (patient-local), not the plan anchor month
//  • all strings via i18n (en/es/fr); dates via Intl with the active locale
//
// The plan itself stays fully DB-driven via /api/companion-care-plan-current.
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  ChevronLeft, ChevronRight, Thermometer, Heart, Activity, Wind, Scale,
  AlertTriangle, Check, Plus, Minus, Snowflake, Pill, ClipboardCopy,
  NotebookPen, Syringe, Hand, Footprints, Smile, CircleDot, MapPin, Save,
  Smartphone, Moon, Zap, Scissors, Droplet, Stethoscope, Loader2, CloudOff,
} from 'lucide-react'
import { C as UI, ACCENTS } from '../lib/ui'
import { useT } from '../lib/i18n'

/* ── endpoints ─────────────────────────────────────────────────────────── */
const DEFAULT_ENDPOINT = '/api/companion-care-plan-current'
const DEFAULT_SAVE_ENDPOINT = '/api/companion-log-day'
const DEFAULT_HISTORY_ENDPOINT = '/api/companion-log-history'
const COLD_WINDOW_DAYS = 6
const HISTORY_SPAN_DAYS = 364 // RPC caps ranges at 400 days

const A = ACCENTS.dailylog

/* ── types ─────────────────────────────────────────────────────────────── */
type Phase = { phase: string; label?: string; day?: number; days?: [number, number]; mark?: string; tint?: string }
type ScheduledRule = { id: string; label: string; detail?: string; when?: { daily?: boolean; tablet?: boolean; days?: number[]; phase?: string } }
type RedFlagRule = { metric: string; op: string; value: number; msg: string; k: string }
type Area = { id: string; label: string }
type PrnItem = { id: string; label: string; note?: string }

export type Plan = {
  carePlanId: number; templateId?: number; name: string; code?: string
  planKind: 'cyclical' | 'linear'
  anchor: Date | null; anchorISO: string | null
  cycleLength?: number; totalCycles?: number
  coldCare: boolean; coldWindowDays: number
  phases: Phase[]; scheduledRules: ScheduledRule[]; prn: PrnItem[]
  areas: (Area & { icon: any })[]
  redFlagRules: RedFlagRule[]; deviceMetrics: string[]; vitals: string[]
  drugs: unknown[]; source: { autoCreated?: boolean; needsReview?: boolean }
}

type DeviceData = { synced?: boolean; steps?: string; active?: string; restHr?: string; spo2min?: string; sleep?: string }
export type Entry = {
  temp: string; sys: string; dia: string; hr: string; spo2: string; weight: string
  pain: number; areas: string[]; meds: Record<string, boolean>; prn: Record<string, number>
  bowel: number; diarrhea: boolean; notes: string
  device: DeviceData
  _sync?: 'ok' | 'failed'
}

type LoadResult = { status: number; body: any }
type Props = {
  endpoint?: string
  saveEndpoint?: string
  historyEndpoint?: string
  getAccessToken?: () => Promise<string | null>
  loadCarePlan?: (carePlanId: number | null) => Promise<LoadResult>
  saveDay?: (payload: unknown) => Promise<LoadResult>
  loadHistory?: (carePlanId: number, from: string, to: string) => Promise<LoadResult>
}

/* ── date helpers (patient-local calendar dates) ───────────────────────── */
export const ISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const dayDiff = (a: Date, b: Date) =>
  Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000)
const num = (v: string | number | undefined | null) => (v === '' || v == null ? NaN : parseFloat(String(v)))
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/* ── plan interpretation (unchanged logic, now typed) ──────────────────── */
function resolvePhase(phases: Phase[], day: number): Phase | null {
  if (!Array.isArray(phases)) return null
  const exact = phases.find(p => p.day === day)
  if (exact) return exact
  return phases.find(p => Array.isArray(p.days) && day >= p.days[0] && day <= p.days[1]) || null
}
function isTabletDay(phases: Phase[], day: number): boolean {
  const t = (phases || []).find(p => p.phase === 'tablet')
  return !!(t && Array.isArray(t.days) && day >= t.days[0] && day <= t.days[1])
}

export type DayInfo = {
  phase: string; label: string; cold?: boolean; day?: number; cycle?: number | null
  mark?: string; tint?: string; tablet?: boolean
}

export function timeline(date: Date, plan: Plan, t: (k: string) => string): DayInfo {
  if (!plan || !plan.anchor) return { phase: 'prep', label: t('dl.beforeTreatment') }
  const idx = dayDiff(date, plan.anchor)
  if (idx < 0) return { phase: 'pre', label: t('dl.beforeTreatment') }
  let cycle: number | null = null
  let day: number
  if (plan.planKind === 'cyclical') {
    const L = plan.cycleLength || 21
    cycle = Math.floor(idx / L) + 1
    day = (idx % L) + 1
  } else {
    day = idx
  }
  const block = resolvePhase(plan.phases, day)
  const cold = !!plan.coldCare && plan.planKind === 'cyclical' && day <= (plan.coldWindowDays || COLD_WINDOW_DAYS)
  const ctx = plan.planKind === 'cyclical'
    ? `${t('dl.cycle')} ${cycle} · ${t('dl.day')} ${day}`
    : (day === 0 ? t('dl.surgeryDay') : `${t('dl.recovery')} · ${t('dl.day')} ${day}`)
  return {
    phase: block?.phase || 'day',
    label: block?.label ? `${ctx} · ${block.label}` : ctx,
    cold, day, cycle, mark: block?.mark, tint: block?.tint,
    tablet: isTabletDay(plan.phases, day),
  }
}

function scheduled(info: DayInfo, plan: Plan) {
  if (!plan || info.phase === 'prep' || info.phase === 'pre') return []
  return (plan.scheduledRules || []).filter(r => {
    const w = r.when || {}
    if (w.daily) return true
    if (w.tablet) return !!info.tablet
    if (Array.isArray(w.days)) return w.days.includes(info.day as number)
    if (w.phase) return info.phase === w.phase
    return false
  }).map(r => ({ id: r.id, label: r.label, detail: r.detail }))
}

function metricValue(e: Entry, metric: string): number {
  switch (metric) {
    case 'temp': return num(e.temp)
    case 'spo2': return num(e.spo2)
    case 'spo2min': return num(e.device && e.device.spo2min)
    case 'sys': return num(e.sys)
    case 'dia': return num(e.dia)
    case 'hr': return num(e.hr)
    case 'weight': return num(e.weight)
    case 'pain': return Number(e.pain) || 0
    case 'bowel': return Math.max(Number(e.bowel) || 0, e.diarrhea ? 4 : 0)
    default: return NaN
  }
}
function cmp(a: number, op: string, b: number): boolean {
  if (isNaN(a)) return false
  switch (op) {
    case '>=': return a >= b; case '>': return a > b; case '<=': return a <= b
    case '<': return a < b; case '==': return a === b; case '!=': return a !== b
    default: return false
  }
}
export function redFlags(e: Entry, plan: Plan) {
  if (!plan) return []
  return (plan.redFlagRules || [])
    .filter(r => cmp(metricValue(e, r.metric), r.op, r.value))
    .map(r => ({ k: r.k, m: r.msg }))
}

/* ── icon lookups (DB carries ids/labels; the UI owns glyphs) ──────────── */
const AREA_ICONS: Record<string, any> = {
  hands: Hand, feet: Footprints, nerves: Activity, mouth: Smile, port: CircleDot,
  belly: MapPin, incision: Scissors, drain: Droplet, legs: Footprints, lungs: Wind,
}
const DEVICE_META: Record<string, { label: string; icon: any; unit?: string }> = {
  steps: { label: 'Steps', icon: Footprints },
  active: { label: 'Active min', icon: Zap },
  sleep: { label: 'Sleep', icon: Moon, unit: 'h' },
  restHr: { label: 'Rest HR', icon: Heart, unit: 'bpm' },
  spo2min: { label: 'O₂ low', icon: Wind, unit: '%' },
}

export function buildPlan(cur: any): Plan | null {
  if (!cur) return null
  const b = cur.blocks || {}
  return {
    carePlanId: cur.carePlanId, templateId: cur.templateId, name: cur.planName, code: cur.planCode,
    planKind: cur.planKind,
    anchor: cur.anchorDate ? new Date(cur.anchorDate + 'T00:00:00') : null,
    anchorISO: cur.anchorDate ?? null,
    cycleLength: cur.cycleLength, totalCycles: cur.totalCycles, coldCare: !!cur.coldCare,
    coldWindowDays: cur.coldWindowDays ?? COLD_WINDOW_DAYS,
    phases: b.phases || [], scheduledRules: b.scheduled_rules || [],
    prn: b.prn_items || [],
    areas: (b.tracked_areas || []).map((a: Area) => ({ ...a, icon: AREA_ICONS[a.id] || CircleDot })),
    redFlagRules: b.red_flag_rules || [], deviceMetrics: b.device_metrics || [],
    vitals: b.vitals || [], drugs: cur.drugs || [], source: cur.source || {},
  }
}

export const emptyEntry = (): Entry => ({
  temp: '', sys: '', dia: '', hr: '', spo2: '', weight: '',
  pain: 0, areas: [], meds: {}, prn: {}, bowel: 0, diarrhea: false, notes: '',
  device: { synced: false },
})
const PRN_VAL = (e: Entry, id: string) => Number(e.prn[id] || 0)

/* server entry → client entry (vitals arrive as a flat map of strings) */
export function fromServerEntry(raw: any): Entry {
  const e = emptyEntry()
  if (!raw || typeof raw !== 'object') return e
  const v = raw.vitals || {}
  return {
    ...e,
    temp: v.temp ?? '', sys: v.sys ?? '', dia: v.dia ?? '', hr: v.hr ?? '',
    spo2: v.spo2 ?? '', weight: v.weight ?? '',
    pain: Number(v.pain ?? raw.pain ?? 0) || 0,
    areas: Array.isArray(raw.areas) ? raw.areas : [],
    meds: raw.meds && typeof raw.meds === 'object' ? raw.meds : {},
    prn: raw.prn && typeof raw.prn === 'object' ? raw.prn : {},
    bowel: Number(raw.bowel) || 0, diarrhea: !!raw.diarrhea,
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    device: raw.device && typeof raw.device === 'object' ? raw.device : { synced: false },
    _sync: 'ok',
  }
}

/* ── default fetchers (bearer-forwarded) ───────────────────────────────── */
async function authedFetch(url: string, getAccessToken?: () => Promise<string | null>, init?: RequestInit): Promise<LoadResult> {
  const headers: Record<string, string> = { accept: 'application/json', ...(init?.headers as Record<string, string> | undefined) }
  if (getAccessToken) { const tkn = await getAccessToken(); if (tkn) headers.Authorization = `Bearer ${tkn}` }
  const res = await fetch(url, { ...init, headers, credentials: 'include' })
  let body: any = null
  try { body = await res.json() } catch { /* non-JSON */ }
  return { status: res.status, body }
}

/* ── shared style fragments ────────────────────────────────────────────── */
const panel: React.CSSProperties = {
  background: UI.navy900, border: `1px solid ${UI.subtle}55`, borderRadius: 16, padding: 16,
}
const sectionLabel: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.08em', color: UI.muted, marginBottom: 6,
}
const inputBase: React.CSSProperties = {
  width: '100%', background: 'transparent', border: 'none', outline: 'none',
  color: UI.text, fontFamily: 'ui-monospace, SFMono-Regular, monospace',
}
const fieldBox: React.CSSProperties = {
  border: `1px solid ${UI.subtle}66`, borderRadius: 10, padding: 8, background: UI.navy800,
}
const pillBtn = (on: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, borderRadius: 999,
  border: `1px solid ${on ? A.c : UI.subtle + '66'}`, padding: '5px 11px', fontSize: 12.5,
  cursor: 'pointer', background: on ? `${A.c}26` : 'transparent', color: on ? A.c : UI.muted,
})

function SectionLabel({ icon: I, text }: { icon: any; text: string }) {
  return <div style={sectionLabel}><I size={13} /> {text}</div>
}
function Field({ icon: I, label, unit, val, onChange, step }: {
  icon: any; label: string; unit?: string; val: string; onChange: (v: string) => void; step?: string
}) {
  return (
    <div style={fieldBox}>
      <div style={{ ...sectionLabel, marginBottom: 4, fontSize: 10.5 }}><I size={12} /> {label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <input type="number" inputMode="decimal" step={step || '1'} value={val} placeholder="—"
          onChange={e => onChange(e.target.value)} aria-label={label}
          style={{ ...inputBase, fontSize: 20 }} />
        {unit && <span style={{ fontSize: 11, color: UI.subtle }}>{unit}</span>}
      </div>
    </div>
  )
}
function Metric({ icon: I, label, val, unit }: { icon: any; label: string; val?: string; unit?: string }) {
  return (
    <div style={{ ...fieldBox, padding: '6px 8px' }}>
      <div style={{ ...sectionLabel, marginBottom: 2, fontSize: 10 }}><I size={11} /> {label}</div>
      <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 15, fontWeight: 600, color: UI.text }}>
        {val || '—'}{unit && val ? <span style={{ marginLeft: 2, fontSize: 10, color: UI.subtle }}>{unit}</span> : null}
      </div>
    </div>
  )
}
function Stepper({ val, onChange }: { val: number; onChange: (v: number) => void }) {
  const b: React.CSSProperties = {
    width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 8,
    border: `1px solid ${UI.subtle}66`, background: 'transparent', color: UI.text, cursor: 'pointer',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(Math.max(0, Number(val) - 1))} style={b} aria-label="minus"><Minus size={14} /></button>
      <span style={{ width: 20, textAlign: 'center', fontFamily: 'ui-monospace, monospace', fontSize: 14, fontWeight: 600 }}>{val}</span>
      <button onClick={() => onChange(Number(val) + 1)} style={b} aria-label="plus"><Plus size={14} /></button>
    </div>
  )
}

/* ── component ─────────────────────────────────────────────────────────── */
export default function CompanionDailyLog({
  endpoint = DEFAULT_ENDPOINT,
  saveEndpoint = DEFAULT_SAVE_ENDPOINT,
  historyEndpoint = DEFAULT_HISTORY_ENDPOINT,
  getAccessToken,
  loadCarePlan,
  saveDay,
  loadHistory,
}: Props = {}) {
  const { t, lang } = useT()
  const today = useMemo(() => new Date(), [])
  const todayISO = ISO(today)

  const [state, setState] = useState<'loading' | 'ok' | 'no_plan' | 'error' | 'unauthorized'>('loading')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [available, setAvailable] = useState<any[]>([])
  const [needsReview, setNeedsReview] = useState(false)
  const [errMsg, setErrMsg] = useState('')

  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const [selected, setSelected] = useState(todayISO)
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [draft, setDraft] = useState<Entry>(emptyEntry())
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [copied, setCopied] = useState(false)

  const loaderRef = useRef<(id: number | null) => Promise<LoadResult>>()
  loaderRef.current = loadCarePlan || ((id) => authedFetch(id ? `${endpoint}?carePlanId=${id}` : endpoint, getAccessToken))
  const saverRef = useRef<(payload: unknown) => Promise<LoadResult>>()
  saverRef.current = saveDay || ((payload) => authedFetch(saveEndpoint, getAccessToken, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
  }))
  const historyRef = useRef<(id: number, from: string, to: string) => Promise<LoadResult>>()
  historyRef.current = loadHistory || ((id, from, to) =>
    authedFetch(`${historyEndpoint}?carePlanId=${id}&from=${from}&to=${to}`, getAccessToken))

  /* hydrate saved entries from the server (audit H3) */
  const fetchHistory = useCallback(async (p: Plan) => {
    try {
      const to = ISO(addDays(new Date(), 60)) // include upcoming pre-logged days
      const from = ISO(addDays(new Date(), 60 - HISTORY_SPAN_DAYS))
      const { status, body } = await historyRef.current!(p.carePlanId, from, to)
      if (status !== 200 || body?.state !== 'ok' || !body.days) return
      const hydrated: Record<string, Entry> = {}
      for (const [iso, raw] of Object.entries(body.days)) hydrated[`${p.carePlanId}::${iso}`] = fromServerEntry(raw)
      setEntries(prev => ({ ...hydrated, ...Object.fromEntries(Object.entries(prev).filter(([, e]) => e._sync === 'failed')) }))
    } catch { /* history is progressive enhancement — the log still works */ }
  }, [])

  const load = useCallback(async (carePlanId: number | null) => {
    setState('loading'); setErrMsg('')
    try {
      const { status, body } = await loaderRef.current!(carePlanId)
      if (status === 401) { setState('unauthorized'); return }
      if (status === 404) { setAvailable(body?.available || []); setState('no_plan'); return }
      if (status >= 400 || !body?.current) { setErrMsg(body?.error || `HTTP ${status}`); setState('error'); return }
      const p = buildPlan(body.current)!
      setPlan(p)
      setAvailable(body.available || [])
      setNeedsReview(!!(p.source && p.source.needsReview))
      // Default to TODAY (audit M4) — the previous version jumped to the anchor month.
      const now = new Date()
      setView(new Date(now.getFullYear(), now.getMonth(), 1))
      setSelected(ISO(now))
      setState('ok')
      fetchHistory(p)
    } catch (e: any) {
      setErrMsg(String(e?.message ?? e)); setState('error')
    }
  }, [fetchHistory])

  useEffect(() => { load(null) }, [load])

  const keyFor = useCallback((iso: string) => `${plan ? plan.carePlanId : 'x'}::${iso}`, [plan])
  useEffect(() => {
    if (!plan) return
    const k = keyFor(selected)
    setDraft(entries[k] ? { ...emptyEntry(), ...entries[k] } : emptyEntry())
    setSaveState('idle')
  }, [selected, entries, plan, keyFor])

  const info = useMemo(() => (plan ? timeline(new Date(selected + 'T00:00:00'), plan, t) : null), [selected, plan, t])
  const meds = useMemo(() => (plan && info ? scheduled(info, plan) : []), [plan, info])
  const flags = useMemo(() => (plan ? redFlags(draft, plan) : []), [draft, plan])

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1)
    const start = new Date(first); start.setDate(1 - first.getDay())
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d })
  }, [view])

  const locale = lang === 'es' ? 'es' : lang === 'fr' ? 'fr' : 'en'
  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const ref = new Date(2024, 8, 1) // a Sunday
    return Array.from({ length: 7 }, (_, i) => fmt.format(addDays(ref, i)))
  }, [locale])
  const monthTitle = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(view),
    [view, locale])
  const selectedTitle = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(selected + 'T00:00:00')),
    [selected, locale])

  async function save() {
    if (!plan) return
    setSaveState('saving')
    const entryPayload = {
      vitals: Object.fromEntries((['temp', 'sys', 'dia', 'hr', 'spo2', 'weight', 'pain'] as const)
        .filter(k => draft[k] !== '' && draft[k] != null)
        .map(k => [k, String(draft[k])])),
      meds: draft.meds, prn: draft.prn,
      bowel: Number(draft.bowel) || 0, diarrhea: !!draft.diarrhea,
      areas: draft.areas, notes: draft.notes, device: draft.device,
    }
    let ok = false
    try {
      const { status, body } = await saverRef.current!({ carePlanId: plan.carePlanId, logDate: selected, entry: entryPayload })
      ok = status === 200 && body && body.state === 'ok'
    } catch { ok = false }
    // Truthful sync state (audit H4): only mark green when the server confirmed.
    setEntries(prev => ({ ...prev, [keyFor(selected)]: { ...draft, _sync: ok ? 'ok' : 'failed' } }))
    setSaveState(ok ? 'saved' : 'error')
    setTimeout(() => setSaveState('idle'), 2200)
  }

  function copySummary() {
    if (!plan || !info) return
    const d = new Date(selected + 'T00:00:00')
    const has = (k: string) => plan.vitals.includes(k)
    const lines = [
      plan.name,
      `${t('dl.title')} — ${new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }).format(d)} · ${info.label}`,
      [has('temp') ? `Temp ${draft.temp || '—'} °C` : '', (has('sys') || has('dia')) ? `BP ${draft.sys || '—'}/${draft.dia || '—'}` : '',
       has('hr') ? `HR ${draft.hr || '—'}` : '', has('spo2') ? `SpO2 ${draft.spo2 || '—'}%` : '', has('weight') ? `Wt ${draft.weight || '—'} kg` : ''].filter(Boolean).join(' · '),
      has('pain') ? `${t('dl.pain')} ${draft.pain}/10${draft.areas.length ? ' · ' + draft.areas.map(a => plan.areas.find(x => x.id === a)?.label).filter(Boolean).join(', ') : ''}` : '',
      `${t('dl.bowel')} ${draft.bowel}${draft.diarrhea ? ` (${t('dl.diarrhea')})` : ''}`,
      plan.prn.length ? `PRN: ${plan.prn.map(p => `${p.label} ${PRN_VAL(draft, p.id)}`).join(', ')}` : '',
      draft.notes ? `${t('dl.notes')}: ${draft.notes}` : '',
      flags.length ? 'FLAGS: ' + flags.map(f => f.k).join('; ') : '',
    ].filter(Boolean)
    try { navigator.clipboard.writeText(lines.join('\n')); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* clipboard unavailable */ }
  }

  /* ── non-OK states ──────────────────────────────────────────────────── */
  if (state !== 'ok' || !plan || !info) {
    return (
      <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ ...panel, maxWidth: 420, width: '100%', textAlign: 'center', padding: 24 }}>
          {state === 'loading' && (<><Loader2 size={22} style={{ color: A.c, margin: '0 auto 10px', display: 'block' }} className="cmp-spin" /><p style={{ fontSize: 14, color: UI.muted, margin: 0 }}>{t('dl.loadingPlan')}</p></>)}
          {state === 'unauthorized' && (<><Stethoscope size={22} style={{ color: A.c, margin: '0 auto 10px', display: 'block' }} /><h2 style={{ fontSize: 17, margin: '0 0 4px', color: UI.text }}>{t('dl.unauthTitle')}</h2><p style={{ fontSize: 13.5, color: UI.muted, margin: 0 }}>{t('dl.unauthBody')}</p></>)}
          {state === 'no_plan' && (<><CircleDot size={22} style={{ color: A.c, margin: '0 auto 10px', display: 'block' }} /><h2 style={{ fontSize: 17, margin: '0 0 4px', color: UI.text }}>{t('dl.noPlanTitle')}</h2><p style={{ fontSize: 13.5, color: UI.muted, margin: 0 }}>{t('dl.noPlanBody')}</p></>)}
          {state === 'error' && (<><AlertTriangle size={22} style={{ color: UI.red, margin: '0 auto 10px', display: 'block' }} /><h2 style={{ fontSize: 17, margin: '0 0 4px', color: UI.text }}>{t('dl.errorTitle')}</h2><p style={{ fontSize: 13.5, color: UI.muted, margin: '0 0 12px' }}>{errMsg || ''}</p><button onClick={() => load(null)} style={{ background: `linear-gradient(120deg, ${A.from}, ${A.to})`, color: UI.navy950, border: 'none', borderRadius: 10, padding: '9px 16px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer' }}>{t('dl.tryAgain')}</button></>)}
        </div>
      </div>
    )
  }

  const phaseTint = (p: string) => {
    const blk = (plan.phases || []).find(x => x.phase === p)
    const tint = blk?.tint || ''
    return tint && tint.toUpperCase() !== '#FFFFFF' ? tint : null
  }
  const has = (k: string) => plan.vitals.includes(k)
  const anchorInfo = plan.anchor ? { iso: plan.anchorISO as string } : null

  return (
    <div>
      {/* header */}
      <header style={{ marginBottom: 18, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: A.c }}>
            <Stethoscope size={14} /> {t('dl.kicker')}
          </div>
          <h1 style={{ fontSize: 26, margin: '4px 0 0', color: UI.text }}>{t('dl.title')}</h1>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {available.length > 1 ? (
              <select value={plan.carePlanId} onChange={e => load(Number(e.target.value))} aria-label={t('dl.plan')}
                style={{ background: UI.navy800, color: UI.text, border: `1px solid ${UI.subtle}66`, borderRadius: 8, padding: '6px 10px', fontSize: 13.5 }}>
                {available.map(a => <option key={a.carePlanId} value={a.carePlanId}>{a.planName} · {a.anchorDate}</option>)}
              </select>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 600, color: UI.text }}>{plan.name}</span>
            )}
            {plan.source.autoCreated && <span style={{ borderRadius: 999, padding: '3px 9px', fontSize: 11, background: `${UI.cyan}1f`, color: UI.cyan }}>{t('dl.autoCreated')}</span>}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: UI.muted }}>{t('dl.plan')} #{plan.carePlanId} · {t('dl.starts')} {plan.anchorISO}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', border: `1px solid ${UI.subtle}55`, borderRadius: 12, padding: '8px 12px', fontSize: 12, color: UI.muted, background: UI.navy900 }}>
          {(plan.phases || []).filter(p => p.tint && p.tint.toUpperCase() !== '#FFFFFF').map((p, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.tint }} /> {p.label}
            </span>
          ))}
          {plan.coldCare && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: UI.cyan }}><Snowflake size={13} /> {t('dl.coldCare')}</span>}
        </div>
      </header>

      {needsReview && (
        <div style={{ marginBottom: 14, border: `1px solid ${UI.amber}66`, background: `${UI.amber}14`, color: UI.amber, borderRadius: 12, padding: '10px 14px', fontSize: 13.5 }}>
          <b>{t('dl.pendingReview')}</b> {t('dl.pendingReviewBody')}
        </div>
      )}

      <div className="dl-columns">
        {/* calendar */}
        <section style={panel} aria-label={monthTitle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} aria-label={t('dl.prevMonth')}
              style={{ background: 'transparent', border: 'none', color: UI.muted, cursor: 'pointer', padding: 8, borderRadius: 8 }}><ChevronLeft size={18} /></button>
            <div style={{ fontSize: 15.5, fontWeight: 700, color: UI.text, textTransform: 'capitalize' }}>{monthTitle}</div>
            <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} aria-label={t('dl.nextMonth')}
              style={{ background: 'transparent', border: 'none', color: UI.muted, cursor: 'pointer', padding: 8, borderRadius: 8 }}><ChevronRight size={18} /></button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, textAlign: 'center', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: UI.subtle, marginBottom: 4 }}>
            {weekdays.map(d => <div key={d} style={{ padding: '4px 0' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {cells.map((d, i) => {
              const iso = ISO(d)
              const inMonth = d.getMonth() === view.getMonth()
              const ci = timeline(d, plan, t)
              const e = entries[keyFor(iso)]
              const logged = !!e
              const unsynced = e?._sync === 'failed'
              const hasFlag = e ? redFlags(e, plan).length > 0 : false
              const isSel = iso === selected
              const isToday = iso === todayISO
              const tint = inMonth ? phaseTint(ci.phase) : null
              return (
                <button key={i} onClick={() => setSelected(iso)}
                  aria-label={iso} aria-pressed={isSel}
                  style={{
                    position: 'relative', aspectRatio: '1 / 1', borderRadius: 10, textAlign: 'left', cursor: 'pointer',
                    background: tint ? `${tint}22` : UI.navy800,
                    border: `${isSel ? 2 : 1}px solid ${isSel ? A.c : unsynced ? UI.amber : tint ? `${tint}55` : `${UI.subtle}44`}`,
                    opacity: inMonth ? 1 : 0.35,
                    boxShadow: hasFlag ? `inset 0 0 0 2px ${UI.red}` : 'none',
                    padding: 0,
                  }}>
                  <span style={{ position: 'absolute', left: 6, top: 4, fontSize: 12, fontWeight: 700, color: isToday ? A.c : UI.text }}>{d.getDate()}</span>
                  {isToday && <span style={{ position: 'absolute', right: 4, top: 4, fontSize: 7.5, fontWeight: 800, textTransform: 'uppercase', color: A.c }}>{t('dl.today')}</span>}
                  {ci.cold && inMonth && <Snowflake size={11} style={{ position: 'absolute', right: 4, top: 16, color: UI.cyan }} />}
                  {ci.mark === 'infusion' && inMonth && <Syringe size={11} style={{ position: 'absolute', left: 6, bottom: 16, color: UI.mint }} />}
                  {ci.mark === 'surgery' && inMonth && <Scissors size={11} style={{ position: 'absolute', left: 6, bottom: 16, color: UI.red }} />}
                  <span style={{ position: 'absolute', bottom: 5, left: 6, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {logged && <span style={{ width: 6, height: 6, borderRadius: 999, background: hasFlag ? UI.red : unsynced ? UI.amber : UI.green }} />}
                    {unsynced && <CloudOff size={10} style={{ color: UI.amber }} />}
                    {hasFlag && <AlertTriangle size={10} style={{ color: UI.red }} />}
                  </span>
                </button>
              )
            })}
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p style={{ margin: 0, fontSize: 11.5, color: UI.muted }}>
              {t('dl.tapAnyDay')} {plan.cycleLength || '—'} {t('dl.daysWord')}.
            </p>
            {anchorInfo && (
              <button
                onClick={() => {
                  const target = selected === todayISO && plan.anchor ? plan.anchor : new Date()
                  setView(new Date(target.getFullYear(), target.getMonth(), 1))
                  setSelected(ISO(target))
                }}
                style={{ background: 'transparent', border: 'none', color: A.c, fontSize: 11.5, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                {selected === todayISO ? t('dl.jumpToStart') : t('dl.backToToday')}
              </button>
            )}
          </div>
        </section>

        {/* day panel */}
        <section style={panel}>
          <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: A.c, marginBottom: 2 }}>{info.label}</div>
          <h2 style={{ fontSize: 18, margin: '0 0 12px', color: UI.text, textTransform: 'capitalize' }}>{selectedTitle}</h2>

          {draft._sync === 'failed' && (
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8, border: `1px solid ${UI.amber}66`, background: `${UI.amber}14`, color: UI.amber, borderRadius: 10, padding: '8px 12px', fontSize: 12.5 }}>
              <CloudOff size={14} /> {t('dl.unsynced')}
            </div>
          )}

          {flags.length > 0 && (
            <div style={{ marginBottom: 14, border: `1px solid ${UI.red}66`, background: `${UI.red}14`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: UI.red, marginBottom: 4 }}>
                <AlertTriangle size={15} /> {t('dl.checkBefore')}
              </div>
              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12.5, color: UI.red }}>
                {flags.map((f, i) => <li key={i}><b>{f.k}.</b> {f.m}</li>)}
              </ul>
            </div>
          )}

          {plan.vitals.length > 0 && <SectionLabel icon={Activity} text={t('dl.vitals')} />}
          <div style={{ marginBottom: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {has('temp') && <Field icon={Thermometer} label={t('dl.temp')} unit="°C" val={draft.temp} onChange={v => setDraft({ ...draft, temp: v })} step="0.1" />}
            {has('weight') && <Field icon={Scale} label={t('dl.weight')} unit="kg" val={draft.weight} onChange={v => setDraft({ ...draft, weight: v })} step="0.1" />}
            {(has('sys') || has('dia')) && (
              <div style={fieldBox}>
                <div style={{ ...sectionLabel, marginBottom: 4, fontSize: 10.5 }}><Heart size={12} /> {t('dl.bloodPressure')}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="number" inputMode="numeric" value={draft.sys} placeholder="sys" aria-label="systolic"
                    onChange={e => setDraft({ ...draft, sys: e.target.value })} style={{ ...inputBase, fontSize: 20, textAlign: 'center' }} />
                  <span style={{ color: UI.subtle }}>/</span>
                  <input type="number" inputMode="numeric" value={draft.dia} placeholder="dia" aria-label="diastolic"
                    onChange={e => setDraft({ ...draft, dia: e.target.value })} style={{ ...inputBase, fontSize: 20, textAlign: 'center' }} />
                </div>
              </div>
            )}
            {(has('hr') || has('spo2')) && (
              <div style={{ display: 'grid', gap: 8 }}>
                {has('hr') && <Field icon={Heart} label={t('dl.pulse')} unit="bpm" val={draft.hr} onChange={v => setDraft({ ...draft, hr: v })} />}
                {has('spo2') && <Field icon={Wind} label={t('dl.spo2')} unit="%" val={draft.spo2} onChange={v => setDraft({ ...draft, spo2: v })} />}
              </div>
            )}
          </div>

          {plan.deviceMetrics.length > 0 && (
            <div style={{ marginBottom: 14, border: `1px solid ${UI.subtle}55`, borderRadius: 12, padding: 10, background: UI.navy800 }}>
              <div style={{ ...sectionLabel, marginBottom: 8 }}><Smartphone size={13} /> {t('dl.fromDevices')}</div>
              {draft.device.synced ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {plan.deviceMetrics.map(m => {
                    const meta = DEVICE_META[m] || { label: m, icon: Activity }
                    return <Metric key={m} icon={meta.icon} label={meta.label} val={(draft.device as any)[m]} unit={meta.unit} />
                  })}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 12, color: UI.muted }}>{t('dl.syncHint')}</p>
              )}
            </div>
          )}

          {has('pain') && (<>
            <SectionLabel icon={Activity} text={`${t('dl.pain')} — ${draft.pain}/10`} />
            <input type="range" min="0" max="10" value={draft.pain} aria-label={t('dl.pain')}
              onChange={e => setDraft({ ...draft, pain: Number(e.target.value) })}
              style={{ width: '100%', accentColor: draft.pain >= 7 ? UI.red : draft.pain >= 4 ? UI.amber : A.c, marginBottom: 2 }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: UI.subtle, marginBottom: 14 }}>
              <span>{t('dl.painNone')}</span><span>{t('dl.painModerate')}</span><span>{t('dl.painWorst')}</span>
            </div>
          </>)}

          {plan.areas.length > 0 && <SectionLabel icon={MapPin} text={t('dl.whereShows')} />}
          <div style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {plan.areas.map(a => {
              const on = draft.areas.includes(a.id); const I = a.icon
              return (
                <button key={a.id} style={pillBtn(on)}
                  onClick={() => setDraft({ ...draft, areas: on ? draft.areas.filter(x => x !== a.id) : [...draft.areas, a.id] })}>
                  <I size={12} /> {a.label}
                </button>
              )
            })}
          </div>

          <SectionLabel icon={Pill} text={t('dl.planTasks')} />
          <div style={{ marginBottom: 10, display: 'grid', gap: 5 }}>
            {meds.length === 0 && <p style={{ margin: 0, fontSize: 12, color: UI.subtle }}>{t('dl.noScheduled')}</p>}
            {meds.map(m => {
              const on = !!draft.meds[m.id]
              return (
                <button key={m.id} onClick={() => setDraft({ ...draft, meds: { ...draft.meds, [m.id]: !on } })}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', borderRadius: 10, padding: '9px 10px', cursor: 'pointer',
                    border: `1px solid ${on ? UI.green : UI.subtle + '55'}`, background: on ? `${UI.green}14` : 'transparent' }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center', flexShrink: 0,
                    border: `1px solid ${on ? UI.green : UI.subtle}`, background: on ? UI.green : 'transparent' }}>
                    {on && <Check size={13} color={UI.navy950} />}
                  </span>
                  <span>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: UI.text }}>{m.label}</span>
                    {m.detail && <span style={{ display: 'block', fontSize: 11, color: UI.muted }}>{m.detail}</span>}
                  </span>
                </button>
              )
            })}
          </div>

          <div style={{ marginBottom: 12, display: 'grid', gap: 6 }}>
            {plan.prn.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: `1px solid ${UI.subtle}55`, borderRadius: 10, padding: '7px 10px' }}>
                <span style={{ fontSize: 13.5, color: UI.text }}>{p.label} {p.note && <span style={{ fontSize: 11, color: UI.muted }}>({p.note})</span>}</span>
                <Stepper val={PRN_VAL(draft, p.id)} onChange={v => setDraft({ ...draft, prn: { ...draft.prn, [p.id]: v } })} />
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, padding: '7px 10px',
              border: `1px solid ${draft.diarrhea ? UI.amber : UI.subtle + '55'}`, background: draft.diarrhea ? `${UI.amber}14` : 'transparent' }}>
              <button onClick={() => setDraft({ ...draft, diarrhea: !draft.diarrhea })}
                style={{ background: 'transparent', border: 'none', color: UI.text, fontSize: 13.5, cursor: 'pointer', padding: 0 }}>
                {t('dl.bowel')} {draft.diarrhea && <span style={{ fontWeight: 700, color: UI.amber }}>· {t('dl.diarrhea')}</span>}
              </button>
              <Stepper val={draft.bowel} onChange={v => setDraft({ ...draft, bowel: v })} />
            </div>
          </div>

          <SectionLabel icon={NotebookPen} text={t('dl.notes')} />
          <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} rows={3}
            placeholder={t('dl.notesPlaceholder')} aria-label={t('dl.notes')}
            style={{ width: '100%', marginBottom: 14, borderRadius: 10, border: `1px solid ${UI.subtle}66`, background: UI.navy800, color: UI.text, padding: 10, fontSize: 13.5, fontFamily: 'inherit', resize: 'vertical' }} />

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={saveState === 'saving'}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, padding: '11px 12px', fontSize: 13.5, fontWeight: 700, border: 'none', cursor: 'pointer',
                color: UI.navy950,
                background: saveState === 'saved' ? UI.green : saveState === 'error' ? UI.red : `linear-gradient(120deg, ${A.from}, ${A.to})` }}>
              {saveState === 'saving' ? <><Loader2 size={16} className="cmp-spin" /> {t('dl.saving')}</>
                : saveState === 'saved' ? <><Check size={16} /> {t('dl.saved')}</>
                : saveState === 'error' ? <><AlertTriangle size={16} /> {t('dl.saveFailed')}</>
                : <><Save size={16} /> {t('dl.saveDay')}</>}
            </button>
            <button onClick={copySummary}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, padding: '11px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${UI.subtle}66`, background: 'transparent', color: UI.text }}>
              {copied ? <><Check size={16} /> {t('dl.copied')}</> : <><ClipboardCopy size={16} /> {t('dl.forTeam')}</>}
            </button>
          </div>
        </section>
      </div>

      <p style={{ margin: '18px auto 0', maxWidth: 640, textAlign: 'center', fontSize: 11.5, color: UI.subtle }}>
        {t('dl.footer')}
      </p>
    </div>
  )
}
