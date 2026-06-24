-- =============================================================================
-- Migration 031 — PatientTrac Companion: care-plan authoring from Forge
-- -----------------------------------------------------------------------------
-- Staff already hold org-scoped RW RLS on cr.care_plan (028). This adds a single
-- staff entry point that the Forge care-team dashboard calls to create/edit a
-- patient's care plan, and that enforces the invariant the Companion patient app
-- relies on: getActivePlan() reads the most-recent status='active' row, so there
-- must be at most one active plan per patient.
--
-- The plain_language field is the only care-plan text the Companion AI assistant
-- is allowed to explain — authoring it here is what makes the patient-side
-- Treatment page and its guardrailed education assistant meaningful.
-- =============================================================================

CREATE OR REPLACE FUNCTION cr.upsert_care_plan(
  p_patient_id     INTEGER,
  p_title          TEXT,
  p_condition      TEXT    DEFAULT NULL,
  p_plain_language TEXT    DEFAULT NULL,
  p_status         TEXT    DEFAULT 'active',     -- active | completed | paused
  p_start_date     DATE    DEFAULT NULL,
  p_end_date       DATE    DEFAULT NULL,
  p_encounter_id   INTEGER DEFAULT NULL,
  p_care_plan_id   INTEGER DEFAULT NULL          -- NULL = create new, else update existing
) RETURNS cr.care_plan
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org UUID;
  v_row cr.care_plan;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'no authenticated session';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) = 0 THEN
    RAISE EXCEPTION 'care plan title is required';
  END IF;
  IF p_status NOT IN ('active', 'completed', 'paused') THEN
    RAISE EXCEPTION 'invalid status: %', p_status;
  END IF;

  -- Resolve the patient's org from their Companion enrollment, then confirm the
  -- caller is a staff member of that org (same check pattern as 030).
  SELECT org_id INTO v_org FROM cr.patient_account WHERE patient_id = p_patient_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'patient % is not enrolled in Companion', p_patient_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members WHERE id = v_uid AND org_id = v_org) THEN
    RAISE EXCEPTION 'not authorized for this patient';
  END IF;

  IF p_care_plan_id IS NULL THEN
    INSERT INTO cr.care_plan
      (patient_id, org_id, encounter_id, title, condition, plain_language,
       status, start_date, end_date, created_by)
    VALUES
      (p_patient_id, v_org, p_encounter_id, btrim(p_title), p_condition, p_plain_language,
       p_status, p_start_date, p_end_date, v_uid)
    RETURNING * INTO v_row;
  ELSE
    UPDATE cr.care_plan
       SET title          = btrim(p_title),
           condition      = p_condition,
           plain_language = p_plain_language,
           status         = p_status,
           start_date     = p_start_date,
           end_date       = p_end_date,
           encounter_id   = COALESCE(p_encounter_id, encounter_id),
           updated_at     = now()
     WHERE id = p_care_plan_id
       AND org_id = v_org              -- defense in depth: stay inside caller's org
     RETURNING * INTO v_row;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'care plan % not found in your organization', p_care_plan_id;
    END IF;
  END IF;

  -- One active plan per patient: archive any other active plans.
  IF v_row.status = 'active' THEN
    UPDATE cr.care_plan
       SET status = 'completed', updated_at = now()
     WHERE patient_id = p_patient_id
       AND id <> v_row.id
       AND status = 'active';
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL    ON FUNCTION cr.upsert_care_plan(INTEGER, TEXT, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) FROM public;
GRANT  EXECUTE ON FUNCTION cr.upsert_care_plan(INTEGER, TEXT, TEXT, TEXT, TEXT, DATE, DATE, INTEGER, INTEGER) TO authenticated;

-- Forge reads the plan list directly under the existing staff RW RLS:
--   supabase.schema('cr').from('care_plan').select('*').eq('patient_id', <id>)
-- Companion reads the active plan under patient RLS via getActivePlan() — no change.
