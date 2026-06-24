-- =============================================================================
-- Migration 035 — PatientTrac Companion: device-sync backbone (provider-agnostic)
-- -----------------------------------------------------------------------------
-- Server-side OAuth token store for direct device integrations (Fitbit, Withings,
-- and any future server-side provider). The sync edge functions are the ONLY
-- thing that should ever read these tokens.
--
-- Security: RLS is enabled with NO policies on purpose. That means no PostgREST
-- caller — patient or staff — can read or write this table. Only the service role
-- (used by edge functions) bypasses RLS, so refresh tokens never reach a browser.
--
-- Readings land in the existing cr.companion_vital table; the edge function sets
-- `source` (the provider) and `is_medical_grade` per device class. is_medical_grade
-- stays FALSE unless the device is a known FDA-cleared line — consumer Fitbit data
-- must NOT be flagged medical-grade, so it never falsely satisfies RPM (034).
-- =============================================================================

CREATE TABLE IF NOT EXISTS cr.companion_oauth_token (
  id               SERIAL PRIMARY KEY,
  patient_id       INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id           UUID    NOT NULL,
  provider         TEXT    NOT NULL CHECK (provider IN ('fitbit','withings')),
  external_user_id TEXT,                                  -- provider's user id (Fitbit encoded id / Withings userid)
  access_token     TEXT    NOT NULL,
  refresh_token    TEXT,
  scopes           TEXT[],
  expires_at       TIMESTAMPTZ,
  connected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_sync_at     TIMESTAMPTZ,
  UNIQUE (patient_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_comp_oauth_patient ON cr.companion_oauth_token(patient_id, provider);

ALTER TABLE cr.companion_oauth_token ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies: service role only.

-- Link a connected device row to the provider's account id (idempotent).
ALTER TABLE cr.companion_device ADD COLUMN IF NOT EXISTS external_user_id TEXT;
