-- =============================================================================
-- Migration 029 — PatientTrac Companion: secure patient account linking
-- A patient's Supabase Auth login is bound to a cr.patient record ONLY via a
-- staff-issued, single-use, expiring invite token — never by self-claimed email.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cr.patient_invite (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id      UUID    NOT NULL,
  email       TEXT,
  token       TEXT    NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '14 days',
  used_at     TIMESTAMPTZ,
  created_by  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE cr.patient_invite ENABLE ROW LEVEL SECURITY;
-- Only staff in the org can see/manage invites. Patients never read this table
-- directly — redemption happens through the SECURITY DEFINER function below.
DROP POLICY IF EXISTS patient_invite_staff ON cr.patient_invite;
CREATE POLICY patient_invite_staff ON cr.patient_invite
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

-- ── Staff: create an invite for one of their patients ───────────────────────
CREATE OR REPLACE FUNCTION cr.create_patient_invite(p_patient_id INTEGER)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_org UUID; v_token TEXT;
BEGIN
  SELECT org_id INTO v_org FROM cr.patient WHERE patient_id = p_patient_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'patient not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM saas.org_members WHERE id = auth.uid() AND org_id = v_org) THEN
    RAISE EXCEPTION 'not authorized for this org';
  END IF;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO cr.patient_invite (patient_id, org_id, token, created_by)
  VALUES (p_patient_id, v_org, v_token, auth.uid());
  RETURN v_token;
END $$;

-- ── Patient: redeem an invite to bind their auth.uid() to the patient ───────
CREATE OR REPLACE FUNCTION cr.redeem_patient_invite(p_token TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = cr, public AS $$
DECLARE v_pid INTEGER; v_org UUID; v_used TIMESTAMPTZ; v_exp TIMESTAMPTZ; v_email TEXT;
BEGIN
  SELECT patient_id, org_id, used_at, expires_at
    INTO v_pid, v_org, v_used, v_exp
    FROM cr.patient_invite WHERE token = p_token;
  IF v_pid IS NULL THEN RAISE EXCEPTION 'invalid invite code'; END IF;
  IF v_used IS NOT NULL THEN RAISE EXCEPTION 'invite already used'; END IF;
  IF v_exp < now() THEN RAISE EXCEPTION 'invite expired'; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO cr.patient_account (patient_id, org_id, auth_user_id, email)
  VALUES (v_pid, v_org, auth.uid(), v_email)
  ON CONFLICT (auth_user_id) DO NOTHING;

  UPDATE cr.patient_invite SET used_at = now() WHERE token = p_token;
  RETURN v_pid;
END $$;

-- ── Grants so the client can call these + resolve identity via PostgREST ────
GRANT EXECUTE ON FUNCTION cr.current_patient_id()            TO authenticated;
GRANT EXECUTE ON FUNCTION cr.redeem_patient_invite(TEXT)     TO authenticated;
GRANT EXECUTE ON FUNCTION cr.create_patient_invite(INTEGER)  TO authenticated;

-- ── Exercise / activity log (referenced by Companion Exercise page) ─────────
CREATE TABLE IF NOT EXISTS cr.companion_activity (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id      UUID    NOT NULL,
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  name        TEXT    NOT NULL,
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_comp_activity_patient_day ON cr.companion_activity(patient_id, logged_at);
ALTER TABLE cr.companion_activity ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_activity_patient_rw ON cr.companion_activity;
CREATE POLICY companion_activity_patient_rw ON cr.companion_activity
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_activity_staff_rw ON cr.companion_activity;
CREATE POLICY companion_activity_staff_rw ON cr.companion_activity
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

-- =============================================================================
-- DEV/TEST: to try the flow, issue an invite for a seeded patient (run as a
-- staff/super_admin session), then enter the returned code in the app:
--   select cr.create_patient_invite(<patient_id>);
-- PROD: invites are issued by the practice (Forge) and emailed to the patient.
-- =============================================================================
