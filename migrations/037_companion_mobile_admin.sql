-- =============================================================================
-- Migration 037 — PatientTrac Companion: Mobile Admin Panel
-- -----------------------------------------------------------------------------
-- Adds six tables to the cr schema for the Companion Mobile control plane:
--   companion_mobile_tenant_config  — per-tenant mobile settings
--   companion_mobile_invite         — patient pairing invites (hashed codes)
--   companion_mobile_session        — paired mobile sessions (hashed tokens)
--   companion_mobile_sync_batch     — ingestion batch telemetry
--   companion_mobile_audit_event    — append-only security/admin audit trail
--   companion_mobile_pairing_attempt — rate-limiting for pairing endpoint
--
-- Design rules:
--   tenant_id TEXT stores org_id::text (UUID cast to text).
--   patient_external_id TEXT stores patient_id::text (INTEGER cast to text).
--   Raw pairing codes and tokens are NEVER stored — only HMAC-SHA256 hashes.
--   All RLS policies are staff-scoped (saas.org_members) or service-role-only.
--   Patients have no direct access to any of these tables.
-- =============================================================================

-- ── 1. Tenant/client mobile configuration ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_mobile_tenant_config (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               TEXT        NOT NULL,
  enabled                 BOOLEAN     NOT NULL DEFAULT FALSE,
  client_display_name     TEXT        NOT NULL,
  allowed_vital_types     JSONB       NOT NULL DEFAULT '[]',
  default_backfill_days   INTEGER     NOT NULL DEFAULT 30
                            CHECK (default_backfill_days BETWEEN 0 AND 365),
  invite_expiration_hours INTEGER     NOT NULL DEFAULT 168
                            CHECK (invite_expiration_hours BETWEEN 1 AND 720),
  support_phone           TEXT,
  support_email           TEXT,
  privacy_notice_url      TEXT,
  terms_url               TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_mobile_tenant_config UNIQUE (tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_mobile_config_tenant  ON cr.companion_mobile_tenant_config(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mobile_config_enabled ON cr.companion_mobile_tenant_config(enabled);

ALTER TABLE cr.companion_mobile_tenant_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mobile_config_staff ON cr.companion_mobile_tenant_config;
CREATE POLICY mobile_config_staff ON cr.companion_mobile_tenant_config
  USING     (tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK(tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()));

-- ── 2. Patient pairing invites ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_mobile_invite (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT        NOT NULL,
  patient_external_id TEXT        NOT NULL,
  code_hash           TEXT        NOT NULL,
  code_last4          TEXT,
  status              TEXT        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','redeemed','expired','revoked')),
  expires_at          TIMESTAMPTZ NOT NULL,
  max_redemptions     INTEGER     NOT NULL DEFAULT 1 CHECK (max_redemptions >= 1),
  redemption_count    INTEGER     NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  created_by          TEXT        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at         TIMESTAMPTZ,
  redeemed_session_id UUID,
  revoked_at          TIMESTAMPTZ,
  revoked_by          TEXT,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT uq_mobile_invite_code_hash UNIQUE (code_hash)
);
CREATE INDEX IF NOT EXISTS idx_mobile_invite_code          ON cr.companion_mobile_invite(code_hash);
CREATE INDEX IF NOT EXISTS idx_mobile_invite_tenant_patient ON cr.companion_mobile_invite(tenant_id, patient_external_id);
CREATE INDEX IF NOT EXISTS idx_mobile_invite_tenant_status  ON cr.companion_mobile_invite(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_mobile_invite_expires        ON cr.companion_mobile_invite(expires_at);

ALTER TABLE cr.companion_mobile_invite ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mobile_invite_staff ON cr.companion_mobile_invite;
CREATE POLICY mobile_invite_staff ON cr.companion_mobile_invite
  USING     (tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()))
  WITH CHECK(tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()));

-- ── 3. Paired mobile sessions ─────────────────────────────────────────────────
-- access_token_hash and refresh_token_hash store HMAC-SHA256 of the raw tokens.
-- Raw tokens are returned once (on pair/refresh) and never persisted.
-- access_expires_at / refresh_expires_at added per amendment 1.
CREATE TABLE IF NOT EXISTS cr.companion_mobile_session (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT        NOT NULL,
  patient_external_id  TEXT        NOT NULL,
  platform             TEXT        NOT NULL DEFAULT 'unknown'
                         CHECK (platform IN ('ios','android','unknown')),
  app_version          TEXT,
  device_name          TEXT,
  device_id_hash       TEXT,
  access_token_hash    TEXT        NOT NULL,
  refresh_token_hash   TEXT,
  access_expires_at    TIMESTAMPTZ,
  refresh_expires_at   TIMESTAMPTZ,
  paired_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at         TIMESTAMPTZ,
  last_sync_at         TIMESTAMPTZ,
  revoked_at           TIMESTAMPTZ,
  revoked_by           TEXT,
  permissions_snapshot JSONB       NOT NULL DEFAULT '{}',
  allowed_vital_types  JSONB       NOT NULL DEFAULT '[]',
  metadata             JSONB       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_mobile_session_tenant_patient ON cr.companion_mobile_session(tenant_id, patient_external_id);
CREATE INDEX IF NOT EXISTS idx_mobile_session_tenant_revoked ON cr.companion_mobile_session(tenant_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_mobile_session_last_sync      ON cr.companion_mobile_session(last_sync_at);
CREATE INDEX IF NOT EXISTS idx_mobile_session_device         ON cr.companion_mobile_session(device_id_hash);
-- Hot-path lookups for token validation
CREATE INDEX IF NOT EXISTS idx_mobile_session_access_token   ON cr.companion_mobile_session(access_token_hash);
CREATE INDEX IF NOT EXISTS idx_mobile_session_refresh_token  ON cr.companion_mobile_session(refresh_token_hash);

ALTER TABLE cr.companion_mobile_session ENABLE ROW LEVEL SECURITY;
-- Staff can read their org's sessions; no patient policy; service role writes via Netlify functions
DROP POLICY IF EXISTS mobile_session_staff_r ON cr.companion_mobile_session;
CREATE POLICY mobile_session_staff_r ON cr.companion_mobile_session
  FOR SELECT
  USING (tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()));

-- ── 4. Sync batch telemetry ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_mobile_sync_batch (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          UUID        NOT NULL,
  tenant_id           TEXT        NOT NULL,
  patient_external_id TEXT        NOT NULL,
  platform            TEXT,
  canonical_path      TEXT        NOT NULL DEFAULT 'cr.companion_vital',
  idempotency_key     TEXT        NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','processed','partial_failure','failed','duplicate')),
  record_count        INTEGER     NOT NULL DEFAULT 0,
  accepted_count      INTEGER     NOT NULL DEFAULT 0,
  rejected_count      INTEGER     NOT NULL DEFAULT 0,
  first_observed_at   TIMESTAMPTZ,
  last_observed_at    TIMESTAMPTZ,
  error_code          TEXT,
  error_message       TEXT,
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at        TIMESTAMPTZ,
  metadata            JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT uq_mobile_batch_idem UNIQUE (tenant_id, session_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_mobile_batch_tenant_patient ON cr.companion_mobile_sync_batch(tenant_id, patient_external_id, received_at);
CREATE INDEX IF NOT EXISTS idx_mobile_batch_status         ON cr.companion_mobile_sync_batch(status);
CREATE INDEX IF NOT EXISTS idx_mobile_batch_session        ON cr.companion_mobile_sync_batch(session_id);

ALTER TABLE cr.companion_mobile_sync_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mobile_batch_staff_r ON cr.companion_mobile_sync_batch;
CREATE POLICY mobile_batch_staff_r ON cr.companion_mobile_sync_batch
  FOR SELECT
  USING (tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()));

-- ── 5. Audit events (append-only) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_mobile_audit_event (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           TEXT        NOT NULL,
  patient_external_id TEXT,
  actor_id            TEXT,
  actor_type          TEXT        NOT NULL DEFAULT 'system'
                        CHECK (actor_type IN ('user','mobile_session','system')),
  event_type          TEXT        NOT NULL,
  event_payload       JSONB       NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mobile_audit_tenant     ON cr.companion_mobile_audit_event(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mobile_audit_patient    ON cr.companion_mobile_audit_event(patient_external_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mobile_audit_event_type ON cr.companion_mobile_audit_event(event_type, created_at);

ALTER TABLE cr.companion_mobile_audit_event ENABLE ROW LEVEL SECURITY;
-- Staff can read; only service role can INSERT; no UPDATE/DELETE (append-only by design)
DROP POLICY IF EXISTS mobile_audit_staff_r ON cr.companion_mobile_audit_event;
CREATE POLICY mobile_audit_staff_r ON cr.companion_mobile_audit_event
  FOR SELECT
  USING (tenant_id IN (SELECT org_id::text FROM saas.org_members WHERE id = auth.uid()));

-- ── 6. Pairing attempt rate limiting (amendment 4) ────────────────────────────
-- Tracks failed pairing attempts by hashed IP. Raw IPs are never stored.
-- ip_hash = HMAC-SHA256(ip, MOBILE_PAIRING_CODE_SECRET)
CREATE TABLE IF NOT EXISTS cr.companion_mobile_pairing_attempt (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash      TEXT        NOT NULL,
  ua_hash      TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  succeeded    BOOLEAN     NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_mobile_pair_attempt ON cr.companion_mobile_pairing_attempt(ip_hash, attempted_at);
-- Service role only; no RLS policies
ALTER TABLE cr.companion_mobile_pairing_attempt ENABLE ROW LEVEL SECURITY;

-- ── 7. Helper: resolve patient from mobile external IDs ─────────────────────
-- Used by Netlify functions to convert (tenant_id TEXT, patient_external_id TEXT)
-- back to the typed (patient_id INTEGER, org_id UUID) required by cr.companion_vital.
CREATE OR REPLACE FUNCTION cr.mobile_resolve_patient(p_tenant_id text, p_ext_id text)
RETURNS TABLE(patient_id integer, org_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = cr, public AS $$
  SELECT pa.patient_id, pa.org_id
  FROM   cr.patient_account pa
  WHERE  pa.org_id::text = p_tenant_id
    AND  pa.patient_id::text = p_ext_id
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION cr.mobile_resolve_patient(text, text) TO service_role;

-- =============================================================================
-- DEV SEED DATA — uncomment in development/staging only, never run in production
-- =============================================================================
/*
DO $$
DECLARE v_org uuid := '<your-dev-org-id-here>';
BEGIN
  -- Tenant config
  INSERT INTO cr.companion_mobile_tenant_config
    (tenant_id, enabled, client_display_name, allowed_vital_types,
     default_backfill_days, invite_expiration_hours,
     support_email, privacy_notice_url, terms_url)
  VALUES
    (v_org::text, true, 'Demo Clinic',
     '["heart_rate","blood_pressure","weight","steps","oxygen_saturation"]'::jsonb,
     30, 168, 'support@patienttrac.com',
     'https://patienttrac.com/privacy', 'https://patienttrac.com/terms')
  ON CONFLICT (tenant_id) DO NOTHING;

  -- The following rows require valid patient_external_id values.
  -- Replace '1' with a real patient_id from your dev database.

  -- Pending invite (code_hash is a placeholder — not a real HMAC)
  INSERT INTO cr.companion_mobile_invite
    (tenant_id, patient_external_id, code_hash, code_last4, status, expires_at, created_by)
  VALUES
    (v_org::text, '1', 'dev-placeholder-invite-hash', 'WXYZ',
     'active', now() + interval '7 days', 'dev-seed')
  ON CONFLICT DO NOTHING;

  -- Paired iOS session (access/refresh hashes are placeholders)
  INSERT INTO cr.companion_mobile_session
    (tenant_id, patient_external_id, platform, app_version, device_name,
     access_token_hash, refresh_token_hash,
     access_expires_at, refresh_expires_at, allowed_vital_types)
  VALUES
    (v_org::text, '1', 'ios', '1.0.0', 'Dev iPhone',
     'dev-access-hash-ios', 'dev-refresh-hash-ios',
     now() + interval '24 hours', now() + interval '30 days',
     '["heart_rate","steps"]'::jsonb)
  ON CONFLICT DO NOTHING;

  -- Paired Android session
  INSERT INTO cr.companion_mobile_session
    (tenant_id, patient_external_id, platform, app_version, device_name,
     access_token_hash, refresh_token_hash,
     access_expires_at, refresh_expires_at, allowed_vital_types)
  VALUES
    (v_org::text, '1', 'android', '1.0.0', 'Dev Pixel',
     'dev-access-hash-android', 'dev-refresh-hash-android',
     now() + interval '24 hours', now() + interval '30 days',
     '["heart_rate","weight"]'::jsonb)
  ON CONFLICT DO NOTHING;

  -- Successful sync batch
  INSERT INTO cr.companion_mobile_sync_batch
    (session_id, tenant_id, patient_external_id, platform,
     idempotency_key, status, record_count, accepted_count, completed_at)
  SELECT id, tenant_id, patient_external_id, platform,
         'dev-batch-ok-1', 'processed', 5, 5, now()
  FROM   cr.companion_mobile_session
  WHERE  tenant_id = v_org::text AND platform = 'ios'
  LIMIT 1
  ON CONFLICT DO NOTHING;

  -- Failed sync batch
  INSERT INTO cr.companion_mobile_sync_batch
    (session_id, tenant_id, patient_external_id, platform,
     idempotency_key, status, record_count, accepted_count, rejected_count,
     error_code, completed_at)
  SELECT id, tenant_id, patient_external_id, platform,
         'dev-batch-fail-1', 'failed', 3, 0, 3,
         'VITAL_TYPE_NOT_ALLOWED', now()
  FROM   cr.companion_mobile_session
  WHERE  tenant_id = v_org::text AND platform = 'android'
  LIMIT 1
  ON CONFLICT DO NOTHING;
END $$;
*/
