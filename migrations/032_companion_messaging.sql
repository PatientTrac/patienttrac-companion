-- =============================================================================
-- Migration 032 — PatientTrac Companion: patient ↔ care-team messaging
-- -----------------------------------------------------------------------------
-- A single async thread per patient. Non-urgent by design (the patient-facing
-- UI carries an emergency disclaimer). Security model:
--   * Reads/updates are RLS-scoped (patient sees own thread; staff see their org).
--   * There is intentionally NO direct INSERT policy — all sends go through the
--     SECURITY DEFINER RPCs below, which set sender_role/sender_id server-side.
--     This prevents a patient from fabricating a 'staff'-authored message in
--     their own thread by posting directly to PostgREST.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cr.companion_message (
  id              SERIAL PRIMARY KEY,
  patient_id      INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id          UUID    NOT NULL,
  sender_role     TEXT    NOT NULL CHECK (sender_role IN ('patient', 'staff')),
  sender_id       UUID,                                   -- staff member (saas.org_members) when role='staff'
  body            TEXT    NOT NULL,
  read_by_staff   BOOLEAN NOT NULL DEFAULT FALSE,         -- patient→staff message acknowledged by care team
  read_by_patient BOOLEAN NOT NULL DEFAULT FALSE,         -- staff→patient message seen by patient
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_msg_patient    ON cr.companion_message(patient_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comp_msg_org_unread ON cr.companion_message(org_id, read_by_staff);

ALTER TABLE cr.companion_message ENABLE ROW LEVEL SECURITY;

-- Patient: read + mark-read own thread (no insert — see header).
DROP POLICY IF EXISTS companion_message_patient_select ON cr.companion_message;
CREATE POLICY companion_message_patient_select ON cr.companion_message
  FOR SELECT USING (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_message_patient_update ON cr.companion_message;
CREATE POLICY companion_message_patient_update ON cr.companion_message
  FOR UPDATE USING (patient_id = cr.current_patient_id())
             WITH CHECK (patient_id = cr.current_patient_id());

-- Staff: read + mark-read any thread in their org (no insert — see header).
DROP POLICY IF EXISTS companion_message_staff_select ON cr.companion_message;
CREATE POLICY companion_message_staff_select ON cr.companion_message
  FOR SELECT USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));
DROP POLICY IF EXISTS companion_message_staff_update ON cr.companion_message;
CREATE POLICY companion_message_staff_update ON cr.companion_message
  FOR UPDATE USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
             WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

-- ── Send RPCs (role forced server-side) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION cr.companion_patient_send_message(p_body TEXT)
RETURNS cr.companion_message
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_pid INTEGER; v_org UUID; v_row cr.companion_message;
BEGIN
  v_pid := cr.current_patient_id();
  IF v_pid IS NULL THEN RAISE EXCEPTION 'no linked patient for this session'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN RAISE EXCEPTION 'message is empty'; END IF;
  SELECT org_id INTO v_org FROM cr.patient_account WHERE patient_id = v_pid;
  INSERT INTO cr.companion_message (patient_id, org_id, sender_role, body)
  VALUES (v_pid, v_org, 'patient', btrim(p_body))
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION cr.companion_staff_send_message(p_patient_id INTEGER, p_body TEXT)
RETURNS cr.companion_message
LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_uid UUID := auth.uid(); v_org UUID; v_row cr.companion_message;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'no authenticated session'; END IF;
  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN RAISE EXCEPTION 'message is empty'; END IF;
  SELECT org_id INTO v_org FROM cr.patient_account WHERE patient_id = p_patient_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'patient % is not enrolled in Companion', p_patient_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members WHERE id = v_uid AND org_id = v_org) THEN
    RAISE EXCEPTION 'not authorized for this patient';
  END IF;
  INSERT INTO cr.companion_message (patient_id, org_id, sender_role, sender_id, body)
  VALUES (p_patient_id, v_org, 'staff', v_uid, btrim(p_body))
  RETURNING * INTO v_row;
  RETURN v_row;
END $$;

REVOKE ALL    ON FUNCTION cr.companion_patient_send_message(TEXT)        FROM public;
GRANT  EXECUTE ON FUNCTION cr.companion_patient_send_message(TEXT)        TO authenticated;
REVOKE ALL    ON FUNCTION cr.companion_staff_send_message(INTEGER, TEXT) FROM public;
GRANT  EXECUTE ON FUNCTION cr.companion_staff_send_message(INTEGER, TEXT) TO authenticated;

-- ── Roster: surface unread patient messages to the care team ────────────────
-- Re-create the 030 view verbatim, adding one column.
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
     WHERE v.patient_id = pa.patient_id)                                  AS last_vital_at,
  (SELECT count(*) FROM cr.companion_message m
     WHERE m.patient_id = pa.patient_id
       AND m.sender_role = 'patient' AND m.read_by_staff = false)         AS unread_from_patient
FROM cr.patient_account pa;

GRANT SELECT ON cr.companion_roster TO authenticated;

-- Mark-read is done client-side under RLS:
--   patient: update read_by_patient=true where sender_role='staff'
--   staff:   update read_by_staff=true  where sender_role='patient' and patient_id=<id>
