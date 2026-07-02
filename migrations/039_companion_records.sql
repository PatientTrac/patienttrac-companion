-- 039_companion_records.sql
-- Patient health records + document uploads: implants/devices, surgical
-- procedures, laboratory, radiology.
--
-- Mirrors the existing companion upload pattern (browser uploads straight to a
-- storage bucket keyed on auth.uid(), then an RPC records the metadata).
--
-- Apply by pasting this ENTIRE file into psql against the production database.
-- Idempotent: safe to re-run.

-- ── 1. Storage bucket (private) ──────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('companion-records', 'companion-records', false)
ON CONFLICT (id) DO NOTHING;

-- A patient may read/write only objects under their own auth-uid folder
-- (path convention: "<auth.uid()>/<uuid>.<ext>").
DROP POLICY IF EXISTS companion_records_obj_rw ON storage.objects;
CREATE POLICY companion_records_obj_rw ON storage.objects
  FOR ALL TO authenticated
  USING      (bucket_id = 'companion-records' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'companion-records' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ── 2. Records table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cr.companion_record (
  id           SERIAL PRIMARY KEY,
  patient_id   INTEGER NOT NULL REFERENCES cr.patient(patient_id) ON DELETE CASCADE,
  org_id       UUID    NOT NULL,
  kind         TEXT    NOT NULL CHECK (kind IN ('implant','surgical','lab','radiology')),
  title        TEXT,
  record_date  DATE,
  detail       JSONB   NOT NULL DEFAULT '{}'::jsonb,  -- category fields (UDI/REF/LOT/site/modality/…)
  files        JSONB   NOT NULL DEFAULT '[]'::jsonb,  -- [{path,name,mime,size}]
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comp_record_patient_kind
  ON cr.companion_record(patient_id, kind, record_date DESC);

ALTER TABLE cr.companion_record ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS companion_record_patient_rw ON cr.companion_record;
CREATE POLICY companion_record_patient_rw ON cr.companion_record
  USING (patient_id = cr.current_patient_id())
  WITH CHECK (patient_id = cr.current_patient_id());

DROP POLICY IF EXISTS companion_record_staff_ro ON cr.companion_record;
CREATE POLICY companion_record_staff_ro ON cr.companion_record
  FOR SELECT
  USING (org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid()));

-- ── 3. Org helper (definer — resolves the caller's org without RLS on cr.patient) ─
CREATE OR REPLACE FUNCTION cr.current_patient_org() RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = cr, public STABLE AS $$
  SELECT org_id FROM cr.patient_account WHERE patient_id = cr.current_patient_id() LIMIT 1
$$;

-- ── 4. RPCs (invoker rights — RLS enforced) ─────────────────────────────────
CREATE OR REPLACE FUNCTION cr.companion_create_record(
  p_kind TEXT, p_title TEXT, p_record_date DATE, p_detail JSONB, p_files JSONB, p_notes TEXT
) RETURNS INTEGER
LANGUAGE plpgsql SECURITY INVOKER SET search_path = cr, public AS $$
DECLARE v_patient_id INTEGER; v_org_id UUID; v_id INTEGER;
BEGIN
  v_patient_id := cr.current_patient_id();
  IF v_patient_id IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_kind NOT IN ('implant','surgical','lab','radiology') THEN RAISE EXCEPTION 'bad_kind'; END IF;
  v_org_id := cr.current_patient_org();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'no_org'; END IF;

  INSERT INTO cr.companion_record (patient_id, org_id, kind, title, record_date, detail, files, notes)
  VALUES (v_patient_id, v_org_id, p_kind, NULLIF(p_title, ''), p_record_date,
          COALESCE(p_detail, '{}'::jsonb), COALESCE(p_files, '[]'::jsonb), NULLIF(p_notes, ''))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION cr.companion_my_records(p_kind TEXT DEFAULT NULL)
RETURNS SETOF cr.companion_record
LANGUAGE sql SECURITY INVOKER SET search_path = cr, public AS $$
  SELECT * FROM cr.companion_record
  WHERE patient_id = cr.current_patient_id()
    AND (p_kind IS NULL OR kind = p_kind)
  ORDER BY COALESCE(record_date, created_at::date) DESC, id DESC;
$$;

CREATE OR REPLACE FUNCTION cr.companion_delete_record(p_id INTEGER)
RETURNS JSONB
LANGUAGE plpgsql SECURITY INVOKER SET search_path = cr, public AS $$
DECLARE v_files JSONB;
BEGIN
  DELETE FROM cr.companion_record
  WHERE id = p_id AND patient_id = cr.current_patient_id()
  RETURNING files INTO v_files;
  IF v_files IS NULL THEN RETURN jsonb_build_object('state', 'not_found'); END IF;
  RETURN jsonb_build_object('state', 'ok', 'files', v_files);
END; $$;

GRANT EXECUTE ON FUNCTION cr.current_patient_org() TO authenticated;
GRANT EXECUTE ON FUNCTION cr.companion_create_record(TEXT, TEXT, DATE, JSONB, JSONB, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cr.companion_my_records(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cr.companion_delete_record(INTEGER) TO authenticated;
