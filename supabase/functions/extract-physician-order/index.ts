// supabase/functions/extract-physician-order/index.ts
//
// Server-side AI extraction for an uploaded Physician Order.
// Trigger: Supabase DB webhook on INSERT into cr.physician_order (status='uploaded'),
//          or direct invoke with { orderId }.
//
// Flow:
//   1) auth the webhook (shared secret)            5) write physician_order_extraction (+ audit)
//   2) set order status='extracting'              6) call cr.apply_extraction() -> deterministic
//   3) download the PDF from Storage                 plan creation (auto-create vs needs_review)
//   4) Claude -> STRICT JSON (4 field groups)      7) failure -> status='failed', error_detail
//
// The ANTHROPIC_API_KEY lives ONLY in Edge Function secrets — never on the client.
// The PDF (PHI) goes device -> your server -> Anthropic; your server stays in the
// path (the place a BAA covers). A PHI-free row is written to cr.ai_audit_log.
//
// NOTE: confirm the model string against current availability before deploy.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MODEL = "claude-sonnet-4-6";
const PROMPT_VERSION = "po-extract-v1";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const SYSTEM = `You extract structured data from an oncology/clinical physician order.
Return ONLY a JSON object, no prose, no markdown fences. Use null when a field is not stated.
Shape:
{
  "treatment_start_date": "YYYY-MM-DD|null",
  "regimen_name": "string|null",            // e.g. "XELOX", "CAPOX"
  "cycle_length_days": number|null,
  "total_cycles": number|null,
  "drugs": [ { "name": string, "role": "antineoplastic|premed|supportive|prn",
              "dose": "string|null", "route": "string|null", "schedule": "string|null" } ],
  "confidence": number,                     // 0..1 overall
  "field_confidence": { "treatment_start_date": number, "regimen_name": number,
                        "cycle_length_days": number, "drugs": number }
}
Rules: dates ISO. Do not invent values. If the order is not a treatment order, set confidence to 0.`;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (req.headers.get("x-webhook-secret") !== Deno.env.get("ORDER_WEBHOOK_SECRET")) {
    return json({ error: "forbidden" }, 403);
  }

  // orderId from a direct call or from a Supabase DB webhook payload
  let orderId: number | null = null;
  try {
    const body = await req.json();
    orderId = body?.orderId ?? body?.record?.order_id ?? null;
  } catch { /* ignore */ }
  if (!Number.isInteger(orderId)) return json({ error: "bad_request", detail: "orderId required" }, 400);

  // service-role client (server-side; bypasses RLS for the controlled pipeline)
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const fail = async (detail: string, status = 500) => {
    await admin.from("physician_order").update({ status: "failed", error_detail: detail }).eq("order_id", orderId).schema?.("cr");
    return json({ error: detail }, status);
  };

  // 1) mark extracting + load the order
  const { data: order, error: oErr } = await admin
    .schema("cr").from("physician_order")
    .update({ status: "extracting" }).eq("order_id", orderId).select("*").single();
  if (oErr || !order) return json({ error: "order_not_found" }, 404);

  // 2) download the PDF
  const { data: file, error: dErr } = await admin.storage.from(order.storage_bucket).download(order.storage_path);
  if (dErr || !file) return fail(`download_failed: ${dErr?.message ?? "no file"}`);
  const b64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));

  // 3) Claude extraction (server-side key)
  const t0 = Date.now();
  let aiRes: Response;
  try {
    aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        messages: [{
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } },
            { type: "text", text: "Extract the order as the specified JSON only." },
          ],
        }],
      }),
    });
  } catch (e) { return fail(`ai_call_failed: ${e}`); }
  const latency = Date.now() - t0;
  if (!aiRes.ok) return fail(`ai_http_${aiRes.status}: ${await aiRes.text()}`);

  const ai = await aiRes.json();
  const text = (ai.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n");
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/```json|```/g, "").trim()); }
  catch { return fail("ai_json_parse_failed"); }

  // 4) write extraction row (with server-side audit fields)
  const { data: ext, error: xErr } = await admin.schema("cr").from("physician_order_extraction").insert({
    order_id: orderId,
    patient_id: order.patient_id,
    org_id: order.org_id,
    source: "edge_function",
    treatment_start_date: parsed.treatment_start_date,
    regimen_name: parsed.regimen_name,
    cycle_length: parsed.cycle_length_days ?? null,
    total_cycles: parsed.total_cycles ?? null,
    extracted: parsed,
    confidence: parsed.confidence ?? null,
    field_confidence: parsed.field_confidence ?? {},
    model_used: MODEL,
    prompt_version: PROMPT_VERSION,
    input_tokens: ai.usage?.input_tokens ?? null,
    output_tokens: ai.usage?.output_tokens ?? null,
    latency_ms: latency,
    raw_response: ai,
  }).select("extraction_id").single();
  if (xErr || !ext) return fail(`extraction_insert_failed: ${xErr?.message}`);

  // PHI-free audit trail (cr.ai_audit_log)
  await admin.schema("cr").from("ai_audit_log").insert({
    function_name: "extract-physician-order", action: "extract", org_id: order.org_id,
    model_used: MODEL, phi_scrubbed: true, latency_ms: latency,
  });

  // 5) deterministic plan creation / needs_review (RPC proven in DB)
  const { data: applied, error: aErr } = await admin.rpc("apply_extraction", { p_extraction_id: ext.extraction_id });
  if (aErr) return fail(`apply_extraction_failed: ${aErr.message}`);

  await admin.from("physician_order"); // noop keep-alive
  return json({ ok: true, extractionId: ext.extraction_id, ...applied }, 200);
});
