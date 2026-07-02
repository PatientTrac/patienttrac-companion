#!/usr/bin/env bash
set -euo pipefail

# ── configure ──────────────────────────────────────────────────────────────
REPO=~/patienttrac/patienttrac-companion
DL=~/Downloads
PROJECT_REF=mskormozwekezjmtcylv
COMPANION_SRC="src/components"     # adjust to where components live in THIS repo

cd "$REPO"
git checkout -b feat/companion-caretrack || git checkout feat/companion-caretrack

# ── 1. component ─────────────────────────────────────────────────────────────
mkdir -p "$COMPANION_SRC"
cp "$DL/CompanionDailyLog.jsx" "$COMPANION_SRC/CompanionDailyLog.jsx"

# ── 2. edge functions (rename flattened *.index.ts -> <fn>/index.ts) ─────────
for fn in companion-care-plan-current companion-log-day extract-physician-order; do
  mkdir -p "supabase/functions/$fn"
  cp "$DL/$fn.index.ts" "supabase/functions/$fn/index.ts"
done

# ── 3. migrations: pull what the MCP already applied to the remote ───────────
supabase link --project-ref "$PROJECT_REF"      # one-time; prompts for DB password
supabase migration list                          # confirm the 7 applied migrations show as remote
supabase db pull                                  # writes them into supabase/migrations/

# ── 4. secrets (custom ones only; SUPABASE_URL/ANON/SERVICE_ROLE are auto-injected) ─
supabase secrets set ANTHROPIC_API_KEY="sk-ant-..."           --project-ref "$PROJECT_REF"
supabase secrets set ORDER_WEBHOOK_SECRET="$(openssl rand -hex 24)" --project-ref "$PROJECT_REF"

# ── 5. deploy the functions ──────────────────────────────────────────────────
supabase functions deploy companion-care-plan-current --project-ref "$PROJECT_REF"
supabase functions deploy companion-log-day           --project-ref "$PROJECT_REF"
supabase functions deploy extract-physician-order     --project-ref "$PROJECT_REF"

# ── 6. commit ─────────────────────────────────────────────────────────────────
git add "$COMPANION_SRC/CompanionDailyLog.jsx" supabase/functions supabase/migrations
git commit -m "feat(companion): template-driven CareTrack — DB-backed daily log, logging endpoints, order extraction

- CompanionDailyLog.jsx reads care_plan + care_plan_template via /api/companion-care-plan-current
- companion-log-day writes vitals/adherence to cr.companion_vital + cr.companion_med_log
- extract-physician-order: server-side Claude extraction -> cr.apply_extraction (auto-create vs needs_review)
- migrations: template catalog, physician_order ingestion, cold_window_days, logging setup, RPCs"
git push -u origin feat/companion-caretrack
