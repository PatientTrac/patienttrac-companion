-- =============================================================================
-- Migration 033 — PatientTrac Companion: longitudinal recovery analytics
-- -----------------------------------------------------------------------------
-- A read-only trends feed for the care team, computed over a rolling window
-- from the data Companion already collects (med adherence, journal PROs, vitals).
-- SECURITY DEFINER with the same org-membership check as companion_patient_overview.
-- No new tables — pure aggregation.
-- =============================================================================

CREATE OR REPLACE FUNCTION cr.companion_patient_trends(p_patient_id INTEGER, p_days INTEGER DEFAULT 30)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE
  v_org         UUID;
  v_days        INTEGER := greatest(7, least(coalesce(p_days, 30), 180));
  v_from        DATE    := current_date - (v_days - 1);
  v_active_meds INTEGER;
  v             JSONB;
BEGIN
  SELECT org_id INTO v_org FROM cr.patient_account WHERE patient_id = p_patient_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'patient not enrolled in Companion'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members WHERE id = auth.uid() AND org_id = v_org) THEN
    RAISE EXCEPTION 'not authorized for this patient';
  END IF;

  SELECT count(*) INTO v_active_meds FROM cr.companion_medication WHERE patient_id = p_patient_id AND active;

  SELECT jsonb_build_object(
    'patient_id',  p_patient_id,
    'window_days', v_days,
    'active_meds', v_active_meds,

    -- Doses logged per day
    'adherence', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('d', d, 'n', n) ORDER BY d), '[]'::jsonb)
      FROM (SELECT taken_at::date AS d, count(*) AS n
              FROM cr.companion_med_log
             WHERE patient_id = p_patient_id AND status = 'taken' AND taken_at::date >= v_from
             GROUP BY 1) a
    ),

    -- Daily patient-reported outcomes (averaged if >1 entry/day)
    'journal', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
                 'd', d, 'mood', mood, 'pain', pain, 'energy', energy) ORDER BY d), '[]'::jsonb)
      FROM (SELECT entry_date AS d,
                   round(avg(mood)::numeric, 1)   AS mood,
                   round(avg(pain)::numeric, 1)   AS pain,
                   round(avg(energy)::numeric, 1) AS energy
              FROM cr.companion_journal
             WHERE patient_id = p_patient_id AND entry_date >= v_from
             GROUP BY 1) j
    ),

    -- Numeric vitals, one daily-averaged series per type
    'vitals', (
      SELECT coalesce(jsonb_object_agg(type, series), '{}'::jsonb)
      FROM (SELECT type, jsonb_agg(jsonb_build_object('d', d, 'v', v) ORDER BY d) AS series
              FROM (SELECT type, recorded_at::date AS d, round(avg(value)::numeric, 2) AS v
                      FROM cr.companion_vital
                     WHERE patient_id = p_patient_id AND recorded_at::date >= v_from
                       AND type IN ('weight_kg','bp_systolic','bp_diastolic','heart_rate','spo2','glucose','temp_c')
                     GROUP BY type, recorded_at::date) vv
             GROUP BY type) t
    ),

    'summary', jsonb_build_object(
      'avg_mood', (SELECT round(avg(mood)::numeric, 1) FROM cr.companion_journal WHERE patient_id = p_patient_id AND entry_date >= v_from),
      'avg_pain', (SELECT round(avg(pain)::numeric, 1) FROM cr.companion_journal WHERE patient_id = p_patient_id AND entry_date >= v_from),
      -- Approximate: doses logged / (active meds × days). Surfaced as a directional metric, not a billing figure.
      'adherence_rate', CASE WHEN v_active_meds > 0 THEN
        least(100, round(100.0 * (SELECT count(*) FROM cr.companion_med_log
                                    WHERE patient_id = p_patient_id AND status = 'taken' AND taken_at::date >= v_from)
                         / (v_active_meds * v_days)::numeric))
        ELSE NULL END,
      -- Compare avg pain in the first vs second half of the window
      'pain_trend', (
        SELECT CASE
                 WHEN s.first IS NULL OR s.second IS NULL THEN 'insufficient'
                 WHEN s.second <= s.first - 1 THEN 'improving'
                 WHEN s.second >= s.first + 1 THEN 'worsening'
                 ELSE 'stable' END
        FROM (SELECT avg(pain) FILTER (WHERE entry_date <  v_from + (v_days / 2)) AS first,
                     avg(pain) FILTER (WHERE entry_date >= v_from + (v_days / 2)) AS second
                FROM cr.companion_journal
               WHERE patient_id = p_patient_id AND entry_date >= v_from) s
      )
    )
  ) INTO v;

  RETURN v;
END $$;

REVOKE ALL    ON FUNCTION cr.companion_patient_trends(INTEGER, INTEGER) FROM public;
GRANT  EXECUTE ON FUNCTION cr.companion_patient_trends(INTEGER, INTEGER) TO authenticated;
