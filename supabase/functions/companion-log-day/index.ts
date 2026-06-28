// supabase/functions/companion-log-day/index.ts
//
// POST /functions/v1/companion-log-day   (map to /api/companion-log-day)
// Body: { carePlanId, logDate, vitals, meds, prn, bowel, diarrhea }
//
// Persists one day's daily-log entry by fanning out to cr.companion_vital
// (manual vitals, source='patient') and cr.companion_med_log (adherence),
// via the companion_log_day RPC. patient_id is resolved SERVER-SIDE from the
// caller's JWT (cr.current_patient_id()); the browser never supplies it.
//
//   200 { state:'ok', vitalsWritten, medsWritten }
//   401 unauthorized
//   404 not_found  (care plan not owned by caller)
//   400 bad_request / 500 error

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return json({ error: "unauthorized" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ error: "bad_request" }, 400); }

  const { carePlanId, logDate, vitals = {}, meds = {}, prn = {}, bowel = null, diarrhea = false } = payload ?? {};
  if (!Number.isInteger(carePlanId) || typeof logDate !== "string") {
    return json({ error: "bad_request", detail: "carePlanId (int) and logDate (YYYY-MM-DD) required" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc("companion_log_day", {
    p_care_plan_id: carePlanId,
    p_log_date: logDate,
    p_vitals: vitals,
    p_meds: meds,
    p_prn: prn,
    p_bowel: bowel,
    p_diarrhea: diarrhea,
  });

  if (error) return json({ error: error.message }, 500);
  const state = (data as any)?.state;
  if (state === "unauthorized") return json({ error: "unauthorized" }, 401);
  if (state === "not_found") return json({ error: "not_found" }, 404);
  return json(data, 200);
});
