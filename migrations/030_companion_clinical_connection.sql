-- =============================================================================
-- Migration 030 — PatientTrac Companion: clinical connection (care-team layer)
-- Exposes patient Companion data to clinical staff (org-scoped), drives the
-- care-team dashboard, and automates red-flag/missed-dose alerting.
-- Staff already have org-scoped RLS on every cr.companion_* table (028); this
-- adds the read model + automation the staff UI consumes.
-- =============================================================================

-- ── 1. Care-team roster: one row per enrolled Companion patient ─────────────
-- security_invoker = true → respects the caller's RLS (staff see only their org;
-- a patient would see only their own row, which is harmless).
CREATE OR REPLACE VIEW cr.companion_roster
WITH (security_invoker = true) AS
SELECT
  pa.patient_id,
  pa.org_id,
  (SELECT count(*) FROM cr.companion_med_log l
     WHERE l.patient_id = pa.patient_id AND l.status = 'taken'
       AND l.taken_at >= now() - interval '7 days')                       AS doses_logged_7d,
  (SELECT max(j.entry_date) FROM cr.companion_journal j
     WHERE j.patient_id = pa.patient_id)                                  AS last_checkin,
  (SELECT count(*) FROM cr.companion_alert a
     WHERE a.patient_id = pa.patient_id AND a.resolved = false)           AS open_alerts,
  (SELECT count(*) FROM cr.companion_alert a
     WHERE a.patient_id = pa.patient_id AND a.resolved = false
       AND a.severity = 'urgent')                                         AS urgent_alerts,
  (SELECT max(v.recorded_at) FROM cr.companion_vital v
     WHERE v.patient_id = pa.patient_id)                                  AS last_vital_at
FROM cr.patient_account pa;

GRANT SELECT ON cr.companion_roster TO authenticated;

-- ── 2. Patient overview for the care team (JSON feed) ───────────────────────
-- SECURITY DEFINER with an explicit org-membership check so only staff in the
-- patient's org can read it.
CREATE OR REPLACE FUNCTION cr.companion_patient_overview(p_patient_id INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_org UUID; v JSONB;
BEGIN
  SELECT org_id INTO v_org FROM cr.patient_account WHERE patient_id = p_patient_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'patient not enrolled in Companion'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members WHERE id = auth.uid() AND org_id = v_org) THEN
    RAISE EXCEPTION 'not authorized for this patient';
  END IF;

  SELECT jsonb_build_object(
    'patient_id', p_patient_id,
    'adherence_7d', (SELECT count(*) FROM cr.companion_med_log
                       WHERE patient_id = p_patient_id AND status = 'taken'
                         AND taken_at >= now() - interval '7 days'),
    'medications', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'id', id, 'name', name, 'dose', dose, 'frequency', frequency, 'active', active) ORDER BY id), '[]'::jsonb)
                      FROM cr.companion_medication WHERE patient_id = p_patient_id),
    'journal', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                    'date', entry_date, 'mood', mood, 'pain', pain, 'note', note, 'flagged', flagged) ORDER BY entry_date DESC), '[]'::jsonb)
                  FROM (SELECT * FROM cr.companion_journal WHERE patient_id = p_patient_id ORDER BY entry_date DESC LIMIT 14) j),
    'vitals', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'type', type, 'value', value, 'unit', unit, 'at', recorded_at) ORDER BY recorded_at DESC), '[]'::jsonb)
                 FROM (SELECT * FROM cr.companion_vital WHERE patient_id = p_patient_id ORDER BY recorded_at DESC LIMIT 30) v),
    'diet', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'meal', meal, 'description', description, 'at', logged_at) ORDER BY logged_at DESC), '[]'::jsonb)
               FROM (SELECT * FROM cr.companion_diet_log WHERE patient_id = p_patient_id ORDER BY logged_at DESC LIMIT 20) d),
    'activity', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'name', name, 'detail', detail, 'at', logged_at) ORDER BY logged_at DESC), '[]'::jsonb)
                   FROM (SELECT * FROM cr.companion_activity WHERE patient_id = p_patient_id ORDER BY logged_at DESC LIMIT 20) a),
    'alerts', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                   'id', id, 'kind', kind, 'detail', detail, 'severity', severity, 'resolved', resolved, 'at', created_at) ORDER BY created_at DESC), '[]'::jsonb)
                 FROM cr.companion_alert WHERE patient_id = p_patient_id),
    'education_count', (SELECT count(*) FROM cr.companion_education WHERE patient_id = p_patient_id)
  ) INTO v;
  RETURN v;
END $$;

GRANT EXECUTE ON FUNCTION cr.companion_patient_overview(INTEGER) TO authenticated;

-- ── 3. Automated missed-medication alerting ─────────────────────────────────
-- Inserts a 'missed_meds' alert (once/day) for patients with active meds who
-- have logged nothing today. Safe to run repeatedly (dedups per day).
CREATE OR REPLACE FUNCTION cr.flag_missed_meds()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE n INTEGER := 0;
BEGIN
  INSERT INTO cr.companion_alert (patient_id, org_id, kind, detail, severity)
  SELECT m.patient_id, m.org_id, 'missed_meds', 'No medications logged today', 'warning'
  FROM (SELECT DISTINCT patient_id, org_id FROM cr.companion_medication WHERE active) m
  WHERE NOT EXISTS (
          SELECT 1 FROM cr.companion_med_log l
          WHERE l.patient_id = m.patient_id AND l.taken_at::date = current_date)
    AND NOT EXISTS (
          SELECT 1 FROM cr.companion_alert a
          WHERE a.patient_id = m.patient_id AND a.kind = 'missed_meds'
            AND a.created_at::date = current_date);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- Schedule it nightly if pg_cron is available (best-effort; ignore if absent).
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('companion-missed-meds');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule('companion-missed-meds', '0 21 * * *', $cron$SELECT cr.flag_missed_meds();$cron$);
  END IF;
END $do$;

-- =============================================================================
-- Care-team reads:  select * from cr.companion_roster;            (org-scoped)
--                   select cr.companion_patient_overview(<id>);   (full feed)
-- Alerts resolve via the existing staff RLS:
--   update cr.companion_alert set resolved = true where id = <id>;
-- =============================================================================
