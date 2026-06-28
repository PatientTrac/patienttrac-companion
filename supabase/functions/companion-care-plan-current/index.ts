// supabase/functions/companion-care-plan-current/index.ts
//
// GET /functions/v1/companion-care-plan-current[?carePlanId=2]
// (map to /api/companion-care-plan-current at your gateway/rewrite)
//
// Contract for CompanionDailyLog.jsx. The patient is resolved SERVER-SIDE:
// we forward the caller's Supabase JWT to the RPC, which runs SECURITY INVOKER
// so cr.current_patient_id() + RLS decide which care_plan rows are visible.
// patient_id is NEVER read from the request body or query.
//
// Returns: { current: <plan|null>, available: [...] }
//   200  ok                -> { current, available }
//   401  unauthorized      -> no/!invalid bearer, or no patient mapping
//   404  no_active_plan     -> { error, available }   (patient exists, no plan yet)
//   500  error             -> { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

Deno.serve(async (req) => {
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const raw = url.searchParams.get("carePlanId");
  const carePlanId = raw && /^\d+$/.test(raw) ? Number(raw) : null;

  // Caller's JWT is forwarded so RLS + cr.current_patient_id() apply.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  const { data, error } = await supabase.rpc("companion_care_plan_current", {
    p_care_plan_id: carePlanId,
  });

  if (error) return json({ error: error.message }, 500);

  const state = (data as any)?.state;
  if (state === "unauthorized") return json({ error: "unauthorized" }, 401);
  if (state === "no_active_plan") {
    return json({ error: "no_active_plan", available: (data as any).available ?? [] }, 404);
  }
  // state === 'ok'
  return json({ current: (data as any).current, available: (data as any).available ?? [] }, 200);
});
