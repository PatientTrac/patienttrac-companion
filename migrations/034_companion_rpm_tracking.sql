-- =============================================================================
-- Migration 034 — PatientTrac Companion: RPM eligibility TRACKING (not billing)
-- -----------------------------------------------------------------------------
-- Surfaces, for billing staff only, how many qualifying device-reading days each
-- enrolled patient has in a rolling 30-day window. This is a TRACKING aid, not a
-- billing determination and NOT an auto-coder:
--   * Only FDA-cleared device data counts (cr.companion_vital.is_medical_grade).
--     Manual / consumer-wearable readings are excluded, so this stays empty until
--     medical-grade device sync is live — by design.
--   * CPT 99454 needs >= 16 reading-days per 30-day period; we expose the count and
--     a directional flag, nothing more. Time-based codes (99457/99458) require
--     documented clinical time, which is not tracked here.
--   * Access is restricted to billing / admin / super_admin via a role check, in
--     keeping with the platform rule that billing surfaces are separate from
--     clinical surfaces and billing-staff scoped.
-- A human biller always confirms eligibility before anything is claimed.
-- =============================================================================

-- ── Roster: one row per enrolled patient with medical-grade readings in 30d ──
CREATE OR REPLACE FUNCTION cr.companion_rpm_roster()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_uid UUID := auth.uid(); v JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no authenticated session'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members
                  WHERE id = v_uid AND role IN ('billing','admin','super_admin')) THEN
    RAISE EXCEPTION 'RPM tracking is restricted to billing and admin roles';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'patient_id',               r.patient_id,
           'name',                     btrim(coalesce(r.first_name,'') || ' ' || coalesce(r.last_name,'')),
           'medical_grade_days_30d',   r.days,
           'total_medical_readings_30d', r.readings,
           'last_medical_reading_at',  r.last_at,
           'meets_99454',              (r.days >= 16)
         ) ORDER BY r.days DESC), '[]'::jsonb)
  INTO v
  FROM (
    SELECT pa.patient_id,
           p.first_name, p.last_name,
           count(DISTINCT v.recorded_at::date) AS days,
           count(*)                            AS readings,
           max(v.recorded_at)                  AS last_at
    FROM cr.patient_account pa
    JOIN cr.patient p ON p.patient_id = pa.patient_id
    JOIN cr.companion_vital v
      ON v.patient_id = pa.patient_id
     AND v.is_medical_grade = TRUE
     AND v.recorded_at::date >= current_date - 29
    WHERE pa.org_id IN (SELECT org_id FROM saas.org_members
                          WHERE id = v_uid AND role IN ('billing','admin','super_admin'))
    GROUP BY pa.patient_id, p.first_name, p.last_name
  ) r;

  RETURN v;
END $$;

-- ── Per-patient daily breakdown (audit view for the biller) ─────────────────
CREATE OR REPLACE FUNCTION cr.companion_rpm_detail(p_patient_id INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_uid UUID := auth.uid(); v_org UUID; v JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no authenticated session'; END IF;
  SELECT org_id INTO v_org FROM cr.patient_account WHERE patient_id = p_patient_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'patient not enrolled in Companion'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members
                  WHERE id = v_uid AND org_id = v_org AND role IN ('billing','admin','super_admin')) THEN
    RAISE EXCEPTION 'RPM tracking is restricted to billing and admin roles for this patient';
  END IF;

  SELECT jsonb_build_object(
    'patient_id', p_patient_id,
    'window_days', 30,
    'medical_grade_days_30d', (
       SELECT count(DISTINCT recorded_at::date) FROM cr.companion_vital
        WHERE patient_id = p_patient_id AND is_medical_grade AND recorded_at::date >= current_date - 29),
    'meets_99454', (
       SELECT count(DISTINCT recorded_at::date) >= 16 FROM cr.companion_vital
        WHERE patient_id = p_patient_id AND is_medical_grade AND recorded_at::date >= current_date - 29),
    'days', (
       SELECT coalesce(jsonb_agg(jsonb_build_object('d', d, 'readings', n, 'types', types) ORDER BY d), '[]'::jsonb)
       FROM (SELECT recorded_at::date AS d, count(*) AS n,
                    jsonb_agg(DISTINCT type) AS types
               FROM cr.companion_vital
              WHERE patient_id = p_patient_id AND is_medical_grade AND recorded_at::date >= current_date - 29
              GROUP BY recorded_at::date) dd)
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL    ON FUNCTION cr.companion_rpm_roster()            FROM public;
GRANT  EXECUTE ON FUNCTION cr.companion_rpm_roster()            TO authenticated;
REVOKE ALL    ON FUNCTION cr.companion_rpm_detail(INTEGER)      FROM public;
GRANT  EXECUTE ON FUNCTION cr.companion_rpm_detail(INTEGER)     TO authenticated;
