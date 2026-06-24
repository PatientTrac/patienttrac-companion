-- =============================================================================
-- Migration 028 — PatientTrac Companion
-- Post-registration patient self-management: medications, diet, vitals/devices,
-- daily journal (PROs), care plans, and AI patient education.
-- Schema: cr (clinical repository).  PKs: INTEGER/SERIAL.  org_id: UUID.
-- Patients authenticate via Supabase Auth (auth.users); linked through
-- cr.patient_account.  RLS grants each patient access to ONLY their own rows,
-- and org staff (saas.org_members) access to their org's rows.
-- =============================================================================

-- ── 1. Patient ↔ auth account link ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.patient_account (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  auth_user_id  UUID    NOT NULL UNIQUE,          -- auth.users.id
  email         TEXT,
  status        TEXT    NOT NULL DEFAULT 'active', -- active | invited | disabled
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (patient_id)
);
CREATE INDEX IF NOT EXISTS idx_patient_account_auth ON cr.patient_account(auth_user_id);

-- Helper: resolve the current authenticated patient's patient_id
CREATE OR REPLACE FUNCTION cr.current_patient_id()
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT patient_id FROM cr.patient_account WHERE auth_user_id = auth.uid()
$$;

-- ── 2. Care plan (the basis for AI education — author-controlled) ────────────
CREATE TABLE IF NOT EXISTS cr.care_plan (
  id              SERIAL PRIMARY KEY,
  patient_id      INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id          UUID    NOT NULL,
  encounter_id    INTEGER,                         -- cross-app key (nullable)
  title           TEXT    NOT NULL,
  condition       TEXT,                            -- e.g. 'Breast cancer — adjuvant', 'Post-op TKA'
  plain_language  TEXT,                            -- clinician-approved summary the AI may explain
  status          TEXT    NOT NULL DEFAULT 'active', -- active | completed | paused
  start_date      DATE,
  end_date        DATE,
  created_by      UUID,                            -- authoring staff (saas.org_members)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_care_plan_patient ON cr.care_plan(patient_id);

-- ── 3. Medications + daily adherence log ────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_medication (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  care_plan_id  INTEGER REFERENCES cr.care_plan(id) ON DELETE SET NULL,
  name          TEXT    NOT NULL,
  dose          TEXT,                              -- '10 mg'
  route         TEXT,                              -- oral, topical, injection
  frequency     TEXT,                              -- 'once daily', 'BID'
  instructions  TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_med_patient ON cr.companion_medication(patient_id);

CREATE TABLE IF NOT EXISTS cr.companion_med_log (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  medication_id INTEGER NOT NULL REFERENCES cr.companion_medication(id) ON DELETE CASCADE,
  taken_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  status        TEXT    NOT NULL DEFAULT 'taken',  -- taken | skipped | late
  note          TEXT
);
CREATE INDEX IF NOT EXISTS idx_comp_medlog_patient_day ON cr.companion_med_log(patient_id, taken_at);

-- ── 4. Diet / nutrition journal ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_diet_log (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  logged_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  meal          TEXT,                              -- breakfast | lunch | dinner | snack
  description   TEXT,
  fluids_ml     INTEGER,
  notes         TEXT,
  photo_url     TEXT
);
CREATE INDEX IF NOT EXISTS idx_comp_diet_patient_day ON cr.companion_diet_log(patient_id, logged_at);

-- ── 5. Vitals + connected devices (RPM) ─────────────────────────────────────
-- Consumer-device readings are INFORMATIONAL, not diagnostic. 'source' records
-- provenance; 'is_medical_grade' flags FDA-cleared device data for any future
-- billable RPM workflow.
CREATE TABLE IF NOT EXISTS cr.companion_device (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  provider      TEXT    NOT NULL,                  -- apple_health | health_connect | fitbit | withings | manual
  device_label  TEXT,
  status        TEXT    NOT NULL DEFAULT 'connected',
  scopes        TEXT[],
  connected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS cr.companion_vital (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id           UUID    NOT NULL,
  device_id        INTEGER REFERENCES cr.companion_device(id) ON DELETE SET NULL,
  recorded_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  type             TEXT    NOT NULL,               -- heart_rate | bp_systolic | bp_diastolic | spo2 | temp_c | weight_kg | steps | sleep_min | glucose
  value            NUMERIC NOT NULL,
  unit             TEXT,
  source           TEXT    NOT NULL DEFAULT 'manual',
  is_medical_grade BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_comp_vital_patient_type ON cr.companion_vital(patient_id, type, recorded_at);

-- ── 6. Daily journal / patient-reported outcomes ────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_journal (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id      UUID    NOT NULL,
  entry_date  DATE    NOT NULL DEFAULT CURRENT_DATE,
  mood        SMALLINT,                            -- 1..5
  pain        SMALLINT,                            -- 0..10
  energy      SMALLINT,                            -- 1..5
  symptoms    TEXT[],
  note        TEXT,
  flagged     BOOLEAN NOT NULL DEFAULT FALSE,      -- red-flag for care-team review
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_journal_patient_day ON cr.companion_journal(patient_id, entry_date);

-- ── 7. AI education log (auditable; grounded, non-diagnostic) ────────────────
CREATE TABLE IF NOT EXISTS cr.companion_education (
  id            SERIAL PRIMARY KEY,
  patient_id    INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id        UUID    NOT NULL,
  care_plan_id  INTEGER REFERENCES cr.care_plan(id) ON DELETE SET NULL,
  question      TEXT    NOT NULL,
  ai_answer     TEXT    NOT NULL,
  model         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 8. Care-team alerts (e.g. red-flag journal entries, missed meds) ─────────
CREATE TABLE IF NOT EXISTS cr.companion_alert (
  id          SERIAL PRIMARY KEY,
  patient_id  INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id      UUID    NOT NULL,
  kind        TEXT    NOT NULL,                    -- red_flag | missed_meds | vital_out_of_range
  detail      TEXT,
  severity    TEXT    NOT NULL DEFAULT 'info',     -- info | warning | urgent
  resolved    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_alert_org_open ON cr.companion_alert(org_id, resolved);

-- ── 9. Row Level Security (explicit + idempotent; lint-clean) ─────────────────

ALTER TABLE cr.patient_account ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_account_patient_rw ON cr.patient_account;
CREATE POLICY patient_account_patient_rw ON cr.patient_account
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS patient_account_staff_rw ON cr.patient_account;
CREATE POLICY patient_account_staff_rw ON cr.patient_account
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.care_plan ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS care_plan_patient_rw ON cr.care_plan;
CREATE POLICY care_plan_patient_rw ON cr.care_plan
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS care_plan_staff_rw ON cr.care_plan;
CREATE POLICY care_plan_staff_rw ON cr.care_plan
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_medication ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_medication_patient_rw ON cr.companion_medication;
CREATE POLICY companion_medication_patient_rw ON cr.companion_medication
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_medication_staff_rw ON cr.companion_medication;
CREATE POLICY companion_medication_staff_rw ON cr.companion_medication
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_med_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_med_log_patient_rw ON cr.companion_med_log;
CREATE POLICY companion_med_log_patient_rw ON cr.companion_med_log
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_med_log_staff_rw ON cr.companion_med_log;
CREATE POLICY companion_med_log_staff_rw ON cr.companion_med_log
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_diet_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_diet_log_patient_rw ON cr.companion_diet_log;
CREATE POLICY companion_diet_log_patient_rw ON cr.companion_diet_log
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_diet_log_staff_rw ON cr.companion_diet_log;
CREATE POLICY companion_diet_log_staff_rw ON cr.companion_diet_log
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_device ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_device_patient_rw ON cr.companion_device;
CREATE POLICY companion_device_patient_rw ON cr.companion_device
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_device_staff_rw ON cr.companion_device;
CREATE POLICY companion_device_staff_rw ON cr.companion_device
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_vital ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_vital_patient_rw ON cr.companion_vital;
CREATE POLICY companion_vital_patient_rw ON cr.companion_vital
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_vital_staff_rw ON cr.companion_vital;
CREATE POLICY companion_vital_staff_rw ON cr.companion_vital
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_journal_patient_rw ON cr.companion_journal;
CREATE POLICY companion_journal_patient_rw ON cr.companion_journal
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_journal_staff_rw ON cr.companion_journal;
CREATE POLICY companion_journal_staff_rw ON cr.companion_journal
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_education ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_education_patient_rw ON cr.companion_education;
CREATE POLICY companion_education_patient_rw ON cr.companion_education
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_education_staff_rw ON cr.companion_education;
CREATE POLICY companion_education_staff_rw ON cr.companion_education
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

ALTER TABLE cr.companion_alert ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS companion_alert_patient_rw ON cr.companion_alert;
CREATE POLICY companion_alert_patient_rw ON cr.companion_alert
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());
DROP POLICY IF EXISTS companion_alert_staff_rw ON cr.companion_alert;
CREATE POLICY companion_alert_staff_rw ON cr.companion_alert
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

-- =============================================================================
-- NOTE — consumer-device vitals are informational, not diagnostic. Billable RPM
-- (CMS 99453/99454/99457/99458) additionally requires FDA-cleared devices and
-- >=16 days of readings/month; gate that on cr.companion_vital.is_medical_grade.
-- =============================================================================
