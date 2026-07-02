-- 038_companion_day_log_history.sql
-- Daily Log read-back + full-entry persistence.
--
-- Problem this fixes: the Daily Log UI saved via companion_log_day (fan-out to
-- cr.companion_vital / cr.companion_med_log) but nothing ever read entries back,
-- and areas/notes/device readings were never persisted at all (they lived in a
-- prototype-only client store). This migration adds:
--
--   1. cr.companion_day_log — one JSONB snapshot per (patient, care plan, local date).
--      Source of truth for re-hydrating the Daily Log calendar. RLS: patient rw,
--      staff read within org.
--   2. cr.companion_save_day_log(...) — SECURITY INVOKER upsert of the snapshot,
--      then delegates to the existing public.companion_log_day(...) RPC so the
--      clinical fan-out (companion_vital / companion_med_log) is unchanged.
--   3. cr.companion_log_history(...) — SECURITY INVOKER ranged read of snapshots.
--
-- p_log_date is the PATIENT-LOCAL calendar date supplied by the client and is
-- stored verbatim (DATE). Nothing here re-derives dates from now()/UTC.
--
-- Apply by pasting this ENTIRE file into psql against the production database
-- (do not copy from terminal output). Idempotent: safe to re-run.

-- ── 1. Snapshot table ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_day_log (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  care_plan_id  INTEGER NOT NULL REFERENCES cr.care_plan(id) ON DELETE CASCADE,
  log_date      DATE    NOT NULL,
  entry         JSONB   NOT NULL DEFAULT '{}'::jsonb,  -- {vitals,meds,prn,bowel,diarrhea,areas,notes,device}
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT companion_day_log_uniq UNIQUE (patient_id, care_plan_id, log_date)
);
CREATE INDEX IF NOT EXISTS idx_comp_daylog_plan_date
  ON cr.companion_day_log(care_plan_id, log_date);

ALTER TABLE cr.companion_day_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companion_day_log_patient_rw ON cr.companion_day_log;
CREATE POLICY companion_day_log_patient_rw ON cr.companion_day_log
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());

DROP POLICY IF EXISTS companion_day_log_staff_ro ON cr.companion_day_log;
CREATE POLICY companion_day_log_staff_ro ON cr.companion_day_log
  FOR SELECT
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

-- ── 2. Save wrapper (invoker rights — RLS enforced) ─────────────────────────
CREATE OR REPLACE FUNCTION cr.companion_save_day_log(
  p_care_plan_id INTEGER,
  p_log_date     DATE,
  p_entry        JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = cr, public AS $$
DECLARE
  v_patient_id INTEGER;
  v_org_id     UUID;
  v_fanout     JSONB;
BEGIN
  v_patient_id := cr.current_patient_id();
  IF v_patient_id IS NULL THEN
    RETURN jsonb_build_object('state', 'unauthorized');
  END IF;

  -- Plan must belong to the calling patient (RLS on care_plan also enforces this).
  SELECT org_id INTO v_org_id
  FROM cr.care_plan
  WHERE id = p_care_plan_id AND patient_id = v_patient_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'not_found');
  END IF;

  INSERT INTO cr.companion_day_log (patient_id, org_id, care_plan_id, log_date, entry, updated_at)
  VALUES (v_patient_id, v_org_id, p_care_plan_id, p_log_date, COALESCE(p_entry, '{}'::jsonb), now())
  ON CONFLICT ON CONSTRAINT companion_day_log_uniq
  DO UPDATE SET entry = EXCLUDED.entry, updated_at = now();

  -- Preserve the existing clinical fan-out exactly as before.
  v_fanout := public.companion_log_day(
    p_care_plan_id,
    p_log_date,
    COALESCE(p_entry->'vitals', '{}'::jsonb),
    COALESCE(p_entry->'meds',   '{}'::jsonb),
    COALESCE(p_entry->'prn',    '{}'::jsonb),
    NULLIF(p_entry->>'bowel', '')::INTEGER,
    COALESCE((p_entry->>'diarrhea')::BOOLEAN, FALSE)
  );

  RETURN jsonb_build_object('state', 'ok', 'fanout', v_fanout);
END;
$$;

-- ── 3. History read (invoker rights — RLS enforced) ─────────────────────────
CREATE OR REPLACE FUNCTION cr.companion_log_history(
  p_care_plan_id INTEGER,
  p_from         DATE,
  p_to           DATE
) RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = cr, public AS $$
DECLARE
  v_patient_id INTEGER;
  v_days       JSONB;
BEGIN
  v_patient_id := cr.current_patient_id();
  IF v_patient_id IS NULL THEN
    RETURN jsonb_build_object('state', 'unauthorized');
  END IF;

  IF p_to < p_from OR p_to - p_from > 400 THEN
    RETURN jsonb_build_object('state', 'bad_range');
  END IF;

  SELECT COALESCE(jsonb_object_agg(to_char(log_date, 'YYYY-MM-DD'), entry), '{}'::jsonb)
  INTO v_days
  FROM cr.companion_day_log
  WHERE patient_id = v_patient_id
    AND care_plan_id = p_care_plan_id
    AND log_date BETWEEN p_from AND p_to;

  RETURN jsonb_build_object('state', 'ok', 'days', v_days);
END;
$$;

GRANT EXECUTE ON FUNCTION cr.companion_save_day_log(INTEGER, DATE, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION cr.companion_log_history(INTEGER, DATE, DATE) TO authenticated;

-- ── 4. Patient-chosen display name ("Friendly name") ────────────────────────
-- Companion-level preference: what the app calls the patient (e.g. "Wayne"
-- instead of legal first/middle/last). Lives on cr.patient_account (the
-- Companion account link), NOT cr.patient — clinical demographics stay
-- clinician-owned and read-only to patients.
ALTER TABLE cr.patient_account ADD COLUMN IF NOT EXISTS friendly_name TEXT;
