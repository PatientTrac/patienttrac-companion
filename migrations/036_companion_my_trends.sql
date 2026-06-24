-- =============================================================================
-- Migration 036 — PatientTrac Companion: patient-facing progress trends
-- -----------------------------------------------------------------------------
-- companion_patient_trends (033) is staff-gated (org-membership check), so a
-- patient can't call it. This is the patient-scoped twin: it resolves the caller
-- via cr.current_patient_id() and returns trends for THEIR OWN data only.
-- Same JSON shape as 033 so the UI logic is shared. Read-only; reflects back what
-- the patient already logged. Framing/guardrails live in the patient UI.
-- =============================================================================

CREATE OR REPLACE FUNCTION cr.companion_my_trends(p_days INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE
  v_pid         INTEGER := cr.current_patient_id();
  v_days        INTEGER := greatest(7, least(coalesce(p_days, 30), 180));
  v_from        DATE    := current_date - (v_days - 1);
  v_active_meds INTEGER;
  v             JSONB;
BEGIN
  IF v_pid IS NULL THEN RAISE EXCEPTION 'no linked patient for this session'; END IF;

  SELECT count(*) INTO v_active_meds FROM cr.companion_medication WHERE patient_id = v_pid AND active;

  SELECT jsonb_build_object(
    'window_days', v_days,
    'active_meds', v_active_meds,
    'adherence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) ORDER BY d), '[]'::jsonb)
      FROM (SELECT taken_at::date AS d, count(*) AS n
              FROM cr.companion_med_log
             WHERE patient_id = v_pid AND status = 'taken' AND taken_at::date >= v_from
             GROUP BY 1) a
    ),
    'journal', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('d', d, 'mood', mood, 'pain', pain, 'energy', energy) ORDER BY d), '[]'::jsonb)
      FROM (SELECT entry_date AS d,
                   round(avg(mood)::numeric, 1)   AS mood,
                   round(avg(pain)::numeric, 1)   AS pain,
                   round(avg(energy)::numeric, 1) AS energy
              FROM cr.companion_journal
             WHERE patient_id = v_pid AND entry_date >= v_from
             GROUP BY 1) j
    ),
    'vitals', (
      SELECT coalesce(jsonb_object_agg(type, series), '{}'::jsonb)
      FROM (SELECT type, jsonb_agg(jsonb_build_object('d', d, 'v', v) ORDER BY d) AS series
              FROM (SELECT type, recorded_at::date AS d, round(avg(value)::numeric, 2) AS v
                      FROM cr.companion_vital
                     WHERE patient_id = v_pid AND recorded_at::date >= v_from
                       AND type IN ('weight_kg','bp_systolic','bp_diastolic','heart_rate','spo2','glucose','temp_c')
                     GROUP BY type, recorded_at::date) vv
             GROUP BY type) t
    ),
    'summary', jsonb_build_object(
      'avg_mood', (SELECT round(avg(mood)::numeric, 1) FROM cr.companion_journal WHERE patient_id = v_pid AND entry_date >= v_from),
      'avg_pain', (SELECT round(avg(pain)::numeric, 1) FROM cr.companion_journal WHERE patient_id = v_pid AND entry_date >= v_from),
      'adherence_rate', CASE WHEN v_active_meds > 0 THEN
        least(100, round(100.0 * (SELECT count(*) FROM cr.companion_med_log
                                    WHERE patient_id = v_pid AND status = 'taken' AND taken_at::date >= v_from)
                         / (v_active_meds * v_days)::numeric))
        ELSE NULL END,
      'pain_trend', (
        SELECT CASE
                 WHEN s.first IS NULL OR s.second IS NULL THEN 'insufficient'
                 WHEN s.second <= s.first - 1 THEN 'improving'
                 WHEN s.second >= s.first + 1 THEN 'worsening'
                 ELSE 'stable' END
        FROM (SELECT avg(pain) FILTER (WHERE entry_date <  v_from + (v_days / 2)) AS first,
                     avg(pain) FILTER (WHERE entry_date >= v_from + (v_days / 2)) AS second
                FROM cr.companion_journal
               WHERE patient_id = v_pid AND entry_date >= v_from) s
      )
    )
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL    ON FUNCTION cr.companion_my_trends(INTEGER) FROM public;
GRANT  EXECUTE ON FUNCTION cr.companion_my_trends(INTEGER) TO authenticated;
