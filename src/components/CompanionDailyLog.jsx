import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Thermometer, Heart, Activity, Wind, Scale,
  AlertTriangle, Check, Plus, Minus, Snowflake, Pill, ClipboardCopy,
  NotebookPen, Syringe, Hand, Footprints, Smile, CircleDot, MapPin, Save,
  Smartphone, RefreshCw, Moon, Zap, Watch, Scissors, Droplet, Stethoscope, Loader2
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  PatientTrac Companion — Daily Log Calendar (DB-backed)            */
/*  Data source: GET /api/companion-care-plan-current                 */
/*  The endpoint resolves the patient server-side (cr.current_patient_id),*/
/*  joins cr.care_plan -> cr.care_plan_template, and returns the plan  */
/*  object below. NOTHING about the regimen is hard-coded here.        */
/* ------------------------------------------------------------------ */

const C = {
  navy: "#1F3A5F", teal: "#2E7D7B", paper: "#F7F6F2", ink: "#23303A",
  amber: "#C77D0A", red: "#B23A3A", green: "#2E7D32", line: "#E3E1DA",
};

const DEFAULT_ENDPOINT = "/api/companion-care-plan-current";
const DEFAULT_SAVE_ENDPOINT = "/api/companion-log-day";
const COLD_WINDOW_DAYS = 6; // not templated yet; see note in summary

/* icon lookups (DB carries ids/labels, the UI owns the glyphs) */
const AREA_ICONS = {
  hands: Hand, feet: Footprints, nerves: Activity, mouth: Smile, port: CircleDot,
  belly: MapPin, incision: Scissors, drain: Droplet, legs: Footprints, lungs: Wind,
};
const DEVICE_META = {
  steps:  { label: "Steps",      icon: Footprints },
  active: { label: "Active min", icon: Zap },
  sleep:  { label: "Sleep",      icon: Moon,  unit: "h" },
  restHr: { label: "Rest HR",    icon: Heart, unit: "bpm" },
  spo2min:{ label: "O₂ low",     icon: Wind,  unit: "%" },
};

/* ---------- date + derivation helpers ---------- */
const ISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const dayDiff = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
const num = (v) => (v === "" || v == null ? NaN : parseFloat(v));

function resolvePhase(phases, day) {
  if (!Array.isArray(phases)) return null;
  const exact = phases.find((p) => p.day === day);            // day-specific wins (e.g. infusion)
  if (exact) return exact;
  return phases.find((p) => Array.isArray(p.days) && day >= p.days[0] && day <= p.days[1]) || null;
}
function isTabletDay(phases, day) {
  const t = (phases || []).find((p) => p.phase === "tablet");
  return t && Array.isArray(t.days) ? day >= t.days[0] && day <= t.days[1] : false;
}

/* timeline(): same logic as before, now reading the fetched plan */
function timeline(date, plan) {
  if (!plan || !plan.anchor) return { phase: "prep", label: "Before treatment" };
  const idx = dayDiff(date, plan.anchor);
  if (idx < 0) return { phase: "pre", label: "Before treatment" };
  let cycle = null, day;
  if (plan.planKind === "cyclical") {
    const L = plan.cycleLength || 21;
    cycle = Math.floor(idx / L) + 1;
    day = (idx % L) + 1;
  } else {
    day = idx; // linear: day 0 = anchor (e.g. surgery day)
  }
  const block = resolvePhase(plan.phases, day);
  const cold = !!plan.coldCare && plan.planKind === "cyclical" && day <= (plan.coldWindowDays || COLD_WINDOW_DAYS);
  const ctx = plan.planKind === "cyclical"
    ? `Cycle ${cycle} · Day ${day}`
    : (day === 0 ? "Surgery day" : `Recovery · Day ${day}`);
  return {
    phase: block?.phase || "day",
    label: block?.label ? `${ctx} · ${block.label}` : ctx,
    cold, day, cycle, mark: block?.mark, tint: block?.tint,
    tablet: isTabletDay(plan.phases, day),
  };
}

/* scheduled(): interpret scheduled_rules.when = {daily|tablet|days[]|phase} */
function scheduled(info, plan) {
  if (!plan || info.phase === "prep" || info.phase === "pre") return [];
  return (plan.scheduledRules || []).filter((r) => {
    const w = r.when || {};
    if (w.daily) return true;
    if (w.tablet) return !!info.tablet;
    if (Array.isArray(w.days)) return w.days.includes(info.day);
    if (w.phase) return info.phase === w.phase;
    return false;
  }).map((r) => ({ id: r.id, label: r.label, detail: r.detail }));
}

/* redFlags(): interpret red_flag_rules = {metric, op, value, msg, k} */
function metricValue(e, metric) {
  switch (metric) {
    case "temp": return num(e.temp);
    case "spo2": return num(e.spo2);
    case "spo2min": return num(e.device && e.device.spo2min);
    case "sys": return num(e.sys);
    case "dia": return num(e.dia);
    case "hr": return num(e.hr);
    case "weight": return num(e.weight);
    case "pain": return Number(e.pain) || 0;
    case "bowel": return Math.max(Number(e.bowel) || 0, e.diarrhea ? 4 : 0);
    default: return NaN;
  }
}
function cmp(a, op, b) {
  if (isNaN(a)) return false;
  switch (op) { case ">=": return a >= b; case ">": return a > b; case "<=": return a <= b;
    case "<": return a < b; case "==": return a === b; case "!=": return a !== b; default: return false; }
}
function redFlags(e, plan) {
  if (!plan) return [];
  return (plan.redFlagRules || [])
    .filter((r) => cmp(metricValue(e, r.metric), r.op, r.value))
    .map((r) => ({ k: r.k, m: r.msg }));
}

/* build the client plan object from the endpoint payload */
function buildPlan(cur) {
  if (!cur) return null;
  const b = cur.blocks || {};
  return {
    carePlanId: cur.carePlanId, templateId: cur.templateId, name: cur.planName, code: cur.planCode,
    planKind: cur.planKind,
    anchor: cur.anchorDate ? new Date(cur.anchorDate + "T00:00:00") : null,
    anchorISO: cur.anchorDate,
    cycleLength: cur.cycleLength, totalCycles: cur.totalCycles, coldCare: !!cur.coldCare,
    coldWindowDays: cur.coldWindowDays ?? COLD_WINDOW_DAYS,
    phases: b.phases || [], scheduledRules: b.scheduled_rules || [],
    prn: b.prn_items || [],
    areas: (b.tracked_areas || []).map((a) => ({ ...a, icon: AREA_ICONS[a.id] || CircleDot })),
    redFlagRules: b.red_flag_rules || [], deviceMetrics: b.device_metrics || [],
    vitals: b.vitals || [], drugs: cur.drugs || [], source: cur.source || {},
  };
}

/* entry persistence (guarded: window.storage only exists in the prototype host;
   in the real app, saving entries to companion_vital/companion_med_log is a later step) */
const _mem = {};
const store = {
  async get(k) {
    try { if (typeof window !== "undefined" && window.storage) { const r = await window.storage.get(k); return r ? r.value : null; } } catch (_) {}
    return _mem[k] ?? null;
  },
  async set(k, v) {
    try { if (typeof window !== "undefined" && window.storage) { await window.storage.set(k, v); return; } } catch (_) {}
    _mem[k] = v;
  },
};

const emptyEntry = () => ({
  temp: "", sys: "", dia: "", hr: "", spo2: "", weight: "",
  pain: 0, areas: [], meds: {}, prn: {}, bowel: 0, diarrhea: false, notes: "",
  device: { synced: false, steps: "", active: "", restHr: "", spo2min: "", sleep: "" },
  src: {},
});
const PRN_VAL = (e, id) => Number(e.prn[id] || 0);

/* default loader — calls the endpoint with the patient's bearer token.
   Inject getAccessToken (e.g. () => supabase.auth.getSession() token) from the app. */
async function defaultLoad(endpoint, getAccessToken, carePlanId) {
  const headers = { accept: "application/json" };
  if (getAccessToken) { const t = await getAccessToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  const u = carePlanId ? `${endpoint}?carePlanId=${carePlanId}` : endpoint;
  const res = await fetch(u, { headers, credentials: "include" });
  let body = null; try { body = await res.json(); } catch (_) {}
  return { status: res.status, body };
}

async function defaultSave(endpoint, getAccessToken, payload) {
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (getAccessToken) { const t = await getAccessToken(); if (t) headers.Authorization = `Bearer ${t}`; }
  const res = await fetch(endpoint, { method: "POST", headers, credentials: "include", body: JSON.stringify(payload) });
  let body = null; try { body = await res.json(); } catch (_) {}
  return { status: res.status, body };
}

export default function CompanionDailyLog({
  endpoint = DEFAULT_ENDPOINT,
  saveEndpoint = DEFAULT_SAVE_ENDPOINT,
  getAccessToken,        // async () => string | null
  loadCarePlan,          // optional override: async (carePlanId) => ({status, body})
  saveDay,               // optional override: async (payload) => ({status, body})
} = {}) {
  const today = new Date();
  const [state, setState] = useState("loading"); // loading|ok|no_plan|error|unauthorized
  const [plan, setPlan] = useState(null);
  const [available, setAvailable] = useState([]);
  const [needsReview, setNeedsReview] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const [view, setView] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(ISO(today));
  const [entries, setEntries] = useState({});
  const [draft, setDraft] = useState(emptyEntry());
  const [loadedEntries, setLoadedEntries] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle|saving|saved|error
  const [copied, setCopied] = useState(false);

  const loader = loadCarePlan || ((id) => defaultLoad(endpoint, getAccessToken, id));
  const saver = saveDay || ((payload) => defaultSave(saveEndpoint, getAccessToken, payload));

  const load = useCallback(async (carePlanId) => {
    setState("loading"); setErrMsg("");
    try {
      const { status, body } = await loader(carePlanId);
      if (status === 401) { setState("unauthorized"); return; }
      if (status === 404) { setAvailable(body?.available || []); setState("no_plan"); return; }
      if (status >= 400 || !body?.current) { setErrMsg(body?.error || `HTTP ${status}`); setState("error"); return; }
      const p = buildPlan(body.current);
      setPlan(p);
      setAvailable(body.available || []);
      setNeedsReview(!!(p.source && p.source.needsReview));
      if (p.anchor) { setView(new Date(p.anchor.getFullYear(), p.anchor.getMonth(), 1)); setSelected(p.anchorISO); }
      setState("ok");
    } catch (e) {
      setErrMsg(String(e && e.message ? e.message : e)); setState("error");
    }
  }, [loader]);

  useEffect(() => { load(null); }, [load]);

  // load saved entries once
  useEffect(() => {
    (async () => { try { const v = await store.get("companion-care-log"); if (v) setEntries(JSON.parse(v)); } catch (_) {} setLoadedEntries(true); })();
  }, []);

  const keyFor = (iso) => `${plan ? plan.carePlanId : "x"}::${iso}`;
  useEffect(() => {
    if (!plan) return;
    const k = keyFor(selected);
    setDraft(entries[k] ? { ...emptyEntry(), ...entries[k] } : emptyEntry());
  }, [selected, entries, plan]);

  const info = useMemo(() => (plan ? timeline(new Date(selected + "T00:00:00"), plan) : null), [selected, plan]);
  const meds = useMemo(() => (plan && info ? scheduled(info, plan) : []), [plan, info]);
  const flags = useMemo(() => (plan ? redFlags(draft, plan) : []), [draft, plan]);

  const cells = useMemo(() => {
    const first = new Date(view.getFullYear(), view.getMonth(), 1);
    const start = new Date(first); start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  }, [view]);

  async function save() {
    if (!plan) return;
    const next = { ...entries, [keyFor(selected)]: draft };
    setEntries(next);
    try { await store.set("companion-care-log", JSON.stringify(next)); } catch (_) {}  // local cache (offline + areas/notes)
    setSaveState("saving");
    try {
      const vitals = {};
      ["temp", "sys", "dia", "hr", "spo2", "weight", "pain"].forEach((k) => {
        if (draft[k] !== "" && draft[k] != null) vitals[k] = String(draft[k]);
      });
      const payload = {
        carePlanId: plan.carePlanId, logDate: selected, vitals,
        meds: draft.meds, prn: draft.prn,
        bowel: Number(draft.bowel) || 0, diarrhea: !!draft.diarrhea,
      };
      const { status, body } = await saver(payload);
      setSaveState(status === 200 && body && body.state === "ok" ? "saved" : "error");
    } catch (_) {
      setSaveState("error");
    }
    setTimeout(() => setSaveState("idle"), 2200);
  }
  function syncMobile() {
    const dev = { synced: true, steps: "5,820", active: "34", restHr: "71", spo2min: "93", sleep: "6.8" };
    setDraft((d) => ({ ...d, device: dev, hr: d.hr || "71", spo2: d.spo2 || "94", weight: d.weight || "93.4",
      src: { ...d.src, hr: d.hr ? d.src.hr : "device", spo2: d.spo2 ? d.src.spo2 : "device", weight: d.weight ? d.src.weight : "device" } }));
  }
  function copySummary() {
    if (!plan) return;
    const d = new Date(selected + "T00:00:00");
    const has = (k) => plan.vitals.includes(k);
    const lines = [
      plan.name,
      `Daily log — ${d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })} · ${info.label}`,
      [has("temp") ? `Temp ${draft.temp || "—"} °C` : "", (has("sys") || has("dia")) ? `BP ${draft.sys || "—"}/${draft.dia || "—"}` : "",
       has("hr") ? `HR ${draft.hr || "—"}` : "", has("spo2") ? `SpO2 ${draft.spo2 || "—"}%` : "", has("weight") ? `Wt ${draft.weight || "—"} kg` : ""].filter(Boolean).join(" · "),
      has("pain") ? `Pain ${draft.pain}/10${draft.areas.length ? " · Areas: " + draft.areas.map((a) => plan.areas.find((x) => x.id === a)?.label).join(", ") : ""}` : "",
      `Bowel movements ${draft.bowel}${draft.diarrhea ? " (diarrhea)" : ""}`,
      `PRN: ${plan.prn.map((p) => `${p.label} ${PRN_VAL(draft, p.id)}`).join(", ")}`,
      draft.device.synced ? `Mobile: ${draft.device.steps} steps, sleep ${draft.device.sleep} h, rest HR ${draft.device.restHr}, overnight SpO2 low ${draft.device.spo2min}%` : "",
      draft.notes ? `Notes: ${draft.notes}` : "",
      flags.length ? "FLAGS: " + flags.map((f) => f.k).join("; ") : "",
    ].filter(Boolean);
    try { navigator.clipboard.writeText(lines.join("\n")); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch (_) {}
  }

  /* ---------------- non-OK states ---------------- */
  if (state !== "ok") {
    return (
      <div style={{ background: C.paper, color: C.ink, fontFamily: "ui-sans-serif, system-ui, sans-serif" }} className="flex min-h-screen w-full items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border p-6 text-center" style={{ borderColor: C.line, background: "#fff" }}>
          {state === "loading" && (<><Loader2 size={22} className="mx-auto mb-3 animate-spin" style={{ color: C.teal }} /><p className="text-sm" style={{ color: "#6B7680" }}>Loading your treatment plan…</p></>)}
          {state === "unauthorized" && (<><Stethoscope size={22} className="mx-auto mb-3" style={{ color: C.navy }} /><h2 className="mb-1 text-lg font-semibold" style={{ color: C.navy }}>Please sign in</h2><p className="text-sm" style={{ color: "#6B7680" }}>Sign in to your Companion account to see your plan.</p></>)}
          {state === "no_plan" && (<><CircleDot size={22} className="mx-auto mb-3" style={{ color: C.teal }} /><h2 className="mb-1 text-lg font-semibold" style={{ color: C.navy }}>No active plan yet</h2><p className="text-sm" style={{ color: "#6B7680" }}>Your care team hasn't activated a treatment plan. It will appear here once your order is processed.</p></>)}
          {state === "error" && (<><AlertTriangle size={22} className="mx-auto mb-3" style={{ color: C.red }} /><h2 className="mb-1 text-lg font-semibold" style={{ color: C.navy }}>Couldn't load your plan</h2><p className="mb-3 text-sm" style={{ color: "#6B7680" }}>{errMsg || "Something went wrong."}</p><button onClick={() => load(null)} className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: C.navy }}>Try again</button></>)}
        </div>
      </div>
    );
  }

  const phaseColor = (p) => {
    const blk = (plan.phases || []).find((x) => x.phase === p);
    return blk && blk.tint ? blk.tint : "#fff";
  };
  const has = (k) => plan.vitals.includes(k);

  /* ---------------- OK: the daily log ---------------- */
  return (
    <div style={{ background: C.paper, color: C.ink, fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif" }} className="min-h-screen w-full p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">

        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest" style={{ color: C.teal }}>
              <Stethoscope size={14} /> PatientTrac Companion · Daily Log
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: C.navy }}>Treatment journal</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {available.length > 1 ? (
                <select value={plan.carePlanId} onChange={(e) => load(Number(e.target.value))}
                  className="rounded-md border px-2 py-1.5 text-sm font-medium focus:outline-none" style={{ borderColor: C.line, color: C.navy, background: "#fff" }}>
                  {available.map((a) => <option key={a.carePlanId} value={a.carePlanId}>{a.planName} · {a.anchorDate}</option>)}
                </select>
              ) : (
                <span className="text-sm font-medium" style={{ color: C.navy }}>{plan.name}</span>
              )}
              {plan.source.autoCreated && <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "#EEF2F6", color: C.navy }}>Auto-created</span>}
            </div>
            <p className="mt-1 text-xs" style={{ color: "#9AA3AB" }}>Care plan #{plan.carePlanId} · starts {plan.anchorISO}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: C.line, background: "#fff" }}>
            {(plan.phases || []).map((p, i) => <LegendDot key={i} c={p.tint || "#fff"} t={p.label} b={(p.tint || "").toUpperCase() === "#FFFFFF"} />)}
            {plan.coldCare && <span className="flex items-center gap-1" style={{ color: C.navy }}><Snowflake size={13} /> Cold-care</span>}
          </div>
        </header>

        {needsReview && (
          <div className="mb-4 rounded-lg border p-3 text-sm" style={{ borderColor: C.amber, background: "#FCF4E4", color: "#7A5311" }}>
            <b>Pending clinician review.</b> This plan was created from an uploaded order and is awaiting confirmation. Details may change.
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
          {/* Calendar */}
          <section className="lg:col-span-3 rounded-xl border p-3 sm:p-4" style={{ borderColor: C.line, background: "#fff" }}>
            <div className="mb-3 flex items-center justify-between">
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))} className="rounded-md p-2 hover:bg-stone-100" aria-label="Previous month"><ChevronLeft size={18} /></button>
              <div className="text-base font-semibold tracking-tight" style={{ color: C.navy }}>{view.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</div>
              <button onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))} className="rounded-md p-2 hover:bg-stone-100" aria-label="Next month"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide" style={{ color: "#9AA3AB" }}>
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                const iso = ISO(d);
                const inMonth = d.getMonth() === view.getMonth();
                const ci = timeline(d, plan);
                const e = entries[keyFor(iso)];
                const logged = !!e;
                const hasFlag = e ? redFlags(e, plan).length > 0 : false;
                const isSel = iso === selected;
                const isToday = iso === ISO(today);
                return (
                  <button key={i} onClick={() => setSelected(iso)} className="relative aspect-square rounded-lg border text-left transition"
                    style={{ background: inMonth ? phaseColor(ci.phase) : "#FAFAF8", borderColor: isSel ? C.navy : C.line,
                      borderWidth: isSel ? 2 : 1, opacity: inMonth ? 1 : 0.45, boxShadow: hasFlag ? `inset 0 0 0 2px ${C.red}` : "none" }}>
                    <span className="absolute left-1.5 top-1 text-xs font-semibold" style={{ color: isToday ? C.teal : C.ink }}>{d.getDate()}</span>
                    {isToday && <span className="absolute right-1 top-1 text-[8px] font-bold uppercase" style={{ color: C.teal }}>Today</span>}
                    {ci.cold && inMonth && <Snowflake size={11} className="absolute right-1 top-4" style={{ color: "#5B8FD6" }} />}
                    {ci.mark === "infusion" && inMonth && <Syringe size={11} className="absolute left-1.5 bottom-4" style={{ color: C.teal }} />}
                    {ci.mark === "surgery" && inMonth && <Scissors size={11} className="absolute left-1.5 bottom-4" style={{ color: C.red }} />}
                    <span className="absolute bottom-1 left-1.5 flex items-center gap-1">
                      {logged && <span className="h-1.5 w-1.5 rounded-full" style={{ background: hasFlag ? C.red : C.green }} />}
                      {hasFlag && <AlertTriangle size={10} style={{ color: C.red }} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs" style={{ color: "#9AA3AB" }}>Tap any day to log it. The overlay comes from your plan; the pattern repeats every {plan.cycleLength || "—"} days.</p>
          </section>

          {/* Day panel */}
          <section className="lg:col-span-2 rounded-xl border p-4" style={{ borderColor: C.line, background: "#fff" }}>
            <div className="mb-1 text-xs font-medium uppercase tracking-widest" style={{ color: C.teal }}>{info.label}</div>
            <h2 className="mb-3 text-lg font-semibold tracking-tight" style={{ color: C.navy }}>
              {new Date(selected + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long" })}
            </h2>

            {flags.length > 0 && (
              <div className="mb-4 rounded-lg border p-3" style={{ borderColor: C.red, background: "#F8E9E8" }}>
                <div className="mb-1 flex items-center gap-2 text-sm font-semibold" style={{ color: C.red }}><AlertTriangle size={15} /> Check before you continue</div>
                <ul className="space-y-1 text-xs" style={{ color: "#7A2E2E" }}>{flags.map((f, i) => <li key={i}><b>{f.k}.</b> {f.m}</li>)}</ul>
              </div>
            )}

            {plan.vitals.length > 0 && <SectionLabel icon={Activity} text="Vitals" />}
            <div className="mb-4 grid grid-cols-2 gap-2">
              {has("temp") && <Field icon={Thermometer} label="Temp" unit="°C" val={draft.temp} onChange={(v) => setDraft({ ...draft, temp: v })} step="0.1" />}
              {has("weight") && <Field icon={Scale} label="Weight" unit="kg" val={draft.weight} onChange={(v) => setDraft({ ...draft, weight: v })} step="0.1" source={draft.src.weight} />}
              {(has("sys") || has("dia") || has("hr") || has("spo2")) && (
                <div className="col-span-2 grid grid-cols-2 gap-2">
                  {(has("sys") || has("dia")) && (
                    <div className="rounded-lg border p-2" style={{ borderColor: C.line }}>
                      <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: "#8A939B" }}><Heart size={12} /> Blood pressure</div>
                      <div className="flex items-center gap-1">
                        <NumIn val={draft.sys} onChange={(v) => setDraft({ ...draft, sys: v })} ph="sys" />
                        <span style={{ color: "#B6BCC2" }}>/</span>
                        <NumIn val={draft.dia} onChange={(v) => setDraft({ ...draft, dia: v })} ph="dia" />
                      </div>
                    </div>
                  )}
                  <div className="grid grid-rows-2 gap-2">
                    {has("hr") && <Field icon={Heart} label="Pulse" unit="bpm" val={draft.hr} onChange={(v) => setDraft({ ...draft, hr: v })} tight source={draft.src.hr} />}
                    {has("spo2") && <Field icon={Wind} label="SpO₂" unit="%" val={draft.spo2} onChange={(v) => setDraft({ ...draft, spo2: v })} tight source={draft.src.spo2} />}
                  </div>
                </div>
              )}
            </div>

            {/* Mobile & device data */}
            {plan.deviceMetrics.length > 0 && (
              <div className="mb-4 rounded-lg border p-3" style={{ borderColor: C.line, background: "#F4F8FB" }}>
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#8A939B" }}><Smartphone size={13} /> From your phone &amp; watch</div>
                  <button onClick={syncMobile} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium" style={{ borderColor: C.teal, color: C.teal, background: "#fff" }}>
                    <RefreshCw size={12} /> {draft.device.synced ? "Re-sync" : "Sync"}
                  </button>
                </div>
                {draft.device.synced ? (
                  <div className="grid grid-cols-3 gap-2">
                    {plan.deviceMetrics.map((m) => { const meta = DEVICE_META[m] || { label: m, icon: Activity };
                      return <Metric key={m} icon={meta.icon} label={meta.label} val={draft.device[m]} unit={meta.unit} />; })}
                  </div>
                ) : (
                  <p className="text-xs" style={{ color: "#8A939B" }}>Pull today's steps, sleep, resting heart rate and overnight oxygen from the PatientTrac mobile app and your connected watch &amp; scale.</p>
                )}
              </div>
            )}

            {has("pain") && (<>
              <SectionLabel icon={Activity} text={`Pain — ${draft.pain}/10`} />
              <input type="range" min="0" max="10" value={draft.pain} onChange={(e) => setDraft({ ...draft, pain: Number(e.target.value) })}
                className="mb-1 w-full" style={{ accentColor: draft.pain >= 7 ? C.red : draft.pain >= 4 ? C.amber : C.teal }} />
              <div className="mb-4 flex justify-between text-[10px]" style={{ color: "#9AA3AB" }}><span>None</span><span>Moderate</span><span>Worst</span></div>
            </>)}

            {plan.areas.length > 0 && <SectionLabel icon={MapPin} text="Where it shows up" />}
            <div className="mb-4 flex flex-wrap gap-1.5">
              {plan.areas.map((a) => { const on = draft.areas.includes(a.id); const I = a.icon;
                return (
                  <button key={a.id} onClick={() => setDraft({ ...draft, areas: on ? draft.areas.filter((x) => x !== a.id) : [...draft.areas, a.id] })}
                    className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition"
                    style={{ borderColor: on ? C.teal : C.line, background: on ? C.teal : "#fff", color: on ? "#fff" : C.ink }}>
                    <I size={12} /> {a.label}
                  </button>
                );
              })}
            </div>

            <SectionLabel icon={Pill} text="Plan tasks today" />
            <div className="mb-3 space-y-1">
              {meds.length === 0 && <p className="text-xs" style={{ color: "#9AA3AB" }}>No scheduled items for this day.</p>}
              {meds.map((m) => { const on = !!draft.meds[m.id];
                return (
                  <button key={m.id} onClick={() => setDraft({ ...draft, meds: { ...draft.meds, [m.id]: !on } })}
                    className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition" style={{ borderColor: on ? C.green : C.line, background: on ? "#EFF6EF" : "#fff" }}>
                    <span className="flex h-5 w-5 items-center justify-center rounded border" style={{ borderColor: on ? C.green : "#C7CDD2", background: on ? C.green : "#fff" }}>{on && <Check size={13} color="#fff" />}</span>
                    <span className="flex-1"><span className="block text-sm font-medium" style={{ color: C.ink }}>{m.label}</span><span className="block text-[11px]" style={{ color: "#8A939B" }}>{m.detail}</span></span>
                  </button>
                );
              })}
            </div>

            <div className="mb-3 space-y-1.5">
              {plan.prn.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border px-2.5 py-1.5" style={{ borderColor: C.line }}>
                  <span className="text-sm">{p.label} <span className="text-[11px]" style={{ color: "#9AA3AB" }}>({p.note})</span></span>
                  <Stepper val={PRN_VAL(draft, p.id)} onChange={(v) => setDraft({ ...draft, prn: { ...draft.prn, [p.id]: v } })} />
                </div>
              ))}
              <div className="flex items-center justify-between rounded-lg border px-2.5 py-1.5" style={{ borderColor: draft.diarrhea ? C.amber : C.line, background: draft.diarrhea ? "#FCF4E4" : "#fff" }}>
                <button onClick={() => setDraft({ ...draft, diarrhea: !draft.diarrhea })} className="text-sm">Bowel movements {draft.diarrhea && <span className="font-semibold" style={{ color: C.amber }}>· diarrhea</span>}</button>
                <Stepper val={draft.bowel} onChange={(v) => setDraft({ ...draft, bowel: v })} />
              </div>
            </div>

            <SectionLabel icon={NotebookPen} text="Notes" />
            <textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} rows={3}
              placeholder="How you felt, appetite, sleep, anything you want the team to know…"
              className="mb-4 w-full rounded-lg border p-2 text-sm focus:outline-none" style={{ borderColor: C.line }} />

            <div className="flex gap-2">
              <button onClick={save} disabled={saveState === "saving"} className="flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold text-white transition"
                style={{ background: saveState === "saved" ? C.green : saveState === "error" ? C.red : C.navy }}>
                {saveState === "saving" ? <><Loader2 size={16} className="animate-spin" /> Saving</>
                  : saveState === "saved" ? <><Check size={16} /> Saved</>
                  : saveState === "error" ? <><AlertTriangle size={16} /> Save failed — retry</>
                  : <><Save size={16} /> Save day</>}
              </button>
              <button onClick={copySummary} className="flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium" style={{ borderColor: C.line, color: C.navy }}>
                {copied ? <><Check size={16} /> Copied</> : <><ClipboardCopy size={16} /> For the team</>}
              </button>
            </div>
          </section>
        </div>

        <p className="mx-auto mt-5 max-w-3xl text-center text-[11px]" style={{ color: "#9AA3AB" }}>
          This journal helps you track and share your care. It doesn't replace your team — for anything urgent, contact your care team.
        </p>
      </div>
    </div>
  );
}

/* ---------- small components ---------- */
function LegendDot({ c, t, b }) {
  return <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border" style={{ background: c, borderColor: b ? "#C7CDD2" : c }} /> {t}</span>;
}
function SectionLabel({ icon: I, text }) {
  return <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "#8A939B" }}><I size={13} /> {text}</div>;
}
function Field({ icon: I, label, unit, val, onChange, step, tight, source }) {
  const dev = source === "device";
  return (
    <div className="rounded-lg border p-2" style={{ borderColor: dev ? C.teal : C.line }}>
      <div className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide" style={{ color: "#8A939B" }}>
        <I size={12} /> {label}{dev && <Smartphone size={10} style={{ color: C.teal, marginLeft: "auto" }} />}
      </div>
      <div className="flex items-baseline gap-1">
        <input type="number" inputMode="decimal" step={step || "1"} value={val} onChange={(e) => onChange(e.target.value)} placeholder="—"
          className={`w-full bg-transparent font-mono ${tight ? "text-base" : "text-xl"} focus:outline-none`} style={{ color: C.navy }} />
        <span className="text-xs" style={{ color: "#A6ACB2" }}>{unit}</span>
      </div>
    </div>
  );
}
function Metric({ icon: I, label, val, unit, small }) {
  return (
    <div className="rounded-md border bg-white p-2" style={{ borderColor: C.line }}>
      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide" style={{ color: "#9AA3AB" }}><I size={11} /> {label}</div>
      <div className={`font-mono ${small ? "text-xs" : "text-base"} font-semibold`} style={{ color: C.navy }}>
        {val || "—"}{unit && val ? <span className="ml-0.5 text-[10px]" style={{ color: "#A6ACB2" }}>{unit}</span> : null}
      </div>
    </div>
  );
}
function NumIn({ val, onChange, ph }) {
  return <input type="number" inputMode="numeric" value={val} onChange={(e) => onChange(e.target.value)} placeholder={ph}
    className="w-full bg-transparent text-center font-mono text-xl focus:outline-none" style={{ color: C.navy }} />;
}
function Stepper({ val, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(Math.max(0, Number(val) - 1))} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ borderColor: C.line }} aria-label="minus"><Minus size={14} /></button>
      <span className="w-5 text-center font-mono text-sm font-semibold" style={{ color: C.navy }}>{val}</span>
      <button onClick={() => onChange(Number(val) + 1)} className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ borderColor: C.line }} aria-label="plus"><Plus size={14} /></button>
    </div>
  );
}
