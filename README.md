# PatientTrac Companion

The post-registration patient companion — keeps the care relationship going **between visits**.

Built for recovery- and treatment-heavy journeys: oncology, post-surgery, chronic care, medication adherence, symptom tracking, patient education, and medical billing.

Companion is the **patient-facing web app**. The staff monitoring dashboard for Companion Mobile ships inside this same repo at `/admin/companion-mobile`.

**Stack:** React 18 + TypeScript + Vite 5 · React Router · Supabase (shared PatientTrac clinical schema `cr`) · Netlify Functions · Anthropic Claude API  
**Brand:** PatientTrac HUD — navy `#060e1c`, gold `#c9a96e`, cyan `#00d4ff`, Companion accent mint `#34d399`, admin accent violet `#8b7cff`. Poppins / Rajdhani / DM Sans / DM Mono.

---

## Patient screens

| # | Screen | Route | What the patient can do |
|---|--------|-------|------------------------|
| 1 | **Today** | `/today` | Daily summary — meds taken, check-in status, latest vital, meals/activity count |
| 2 | **Medications** | `/medications` | Daily adherence logging; mark doses taken |
| 3 | **Diet** | `/diet` | Meal and fluid journal with AI nutrition Q&A |
| 4 | **Exercise** | `/exercise` | Movement and rehab log with AI education |
| 5 | **Vitals & devices** | `/vitals` | Manual vitals entry + mobile-synced readings; friendly names, Today summary, day-grouping, and a per-vital day-by-day comparison chart (selection drives a server-side DB search); consumer-device OAuth backbone (Fitbit / Withings) |
| 6 | **Journal** | `/journal` | Daily check-in — mood, pain (0–10), free-text note; red-flag alerts to care team |
| 7 | **Treatment & learning** | `/treatment` | Care-plan display and guardrailed AI education assistant |
| 8 | **Messages** | `/messages` | Async patient ↔ care-team messaging |
| 9 | **Progress** | `/progress` | 30-day adherence trends, pain/mood charting |
| 10 | **My health record** | `/self-chart` | Care plan, active medications, lab results, device readings, education entries |
| 11 | **Billing** | `/billing` | Invoices, payments, insurance coverage card, AI document extraction with patient review gate, edit/void |
| 12 | **Daily log** | `/daily-log` | Full-day timeline view with journaling |
| 13 | **Records** | `/records` | Upload & organize health documents by category (implants/devices, surgical, labs, radiology). Implants capture UDI/REF/LOT/serial/expiry via **camera barcode scan** or manual entry. Grid of document tiles → click for a gallery/lightbox. |
| 14 | **My Profile** | `/profile` | Read-only demographics, blood type, contact info, photo upload (signed-URL avatar) |

The app renders on an ambient "Clinical Intelligence Network" backdrop (gold + cyan network glow, `AppBackdrop` in `src/lib/art.tsx` + glows/grid in `src/index.css`).

**AI education assistant:** does not diagnose, does not change medications, routes clinical concerns back to the care team.

---

## Companion Mobile

The **Companion Mobile** system allows patients to pair a native iOS (or Android) app with their PatientTrac account. Once paired, the app syncs vitals, activity, and health data directly from device sensors into the clinical record.

### Pairing flow

```
staff generates invite code in Admin → Companion Mobile → Invites
  → QR code + pairing URL generated (https://patienttraccompanion.com/pair?code=PT-XXXX-XXXX)
  → patient scans QR or taps link → opens /pair landing page
  → "Open PatientTrac Companion" button fires deep link (patienttraccompanion://pair?code=...)
  → native app sends code to /api/companion-pair
  → server verifies HMAC(code), issues access + refresh token pair
  → app syncs data via /api/companion-ingest
  → tokens refresh via /api/companion-refresh
```

### Pairing security model

- Codes are 16-char base-32 (80 bits, unbiased), display format `PT-XXXXXXXX-XXXXXXXX`
- Codes are **never stored raw** — only `HMAC-SHA256(code, MOBILE_PAIRING_CODE_SECRET)`
- IP addresses for rate limiting are stored only as HMAC hashes
- Separate secrets for pairing codes (`MOBILE_PAIRING_CODE_SECRET`) and session tokens (`MOBILE_TOKEN_HASH_SECRET`)
- 10 failed pairing attempts per IP per 15 minutes (rate-limited)
- Access tokens expire in `MOBILE_ACCESS_TOKEN_TTL_SECONDS` (default 86400 s)
- Refresh tokens expire in `MOBILE_REFRESH_TOKEN_TTL_SECONDS` (default 2592000 s / 30 days)
- Any session can be revoked instantly from the admin Sync Monitor

### Admin dashboard — `/admin/companion-mobile`

Staff-only shell (requires `saas.org_members` row). Sub-navigation:

| Section | What it shows |
|---------|--------------|
| **Overview** | Live stats — active sessions, paired devices, syncs in 24 h, failed syncs; clickable tiles navigate to filtered sub-pages |
| **Invites** | Full invite list; generate new invite with patient search autocomplete; revoke active invites |
| **Sessions** | All paired mobile sessions, platform, app version, last seen |
| **Sync Monitor** | Per-patient sync status, error codes, last batch result; filters for errors-only and no-sync-in-7d |
| **Audit Log** | Full event log — pairings, syncs, revocations |
| **Settings** | Org-level mobile config |

### `/pair` landing page

Public route (no auth). Reads `?code` from URL, shows "Open PatientTrac Companion" button with deep link scheme, and App Store fallback. Supports Universal Links via `/.well-known/apple-app-site-association` (replace `TEAMID` with Apple Team ID before App Store submission).

---

## Architecture

### Auth & accounts

- Patients authenticate through **Supabase Auth**. Staff auth is separate (TOTP via Forge).
- Patient accounts are linked to `cr.patient` through `cr.patient_account` (`auth_user_id` column).
- Account linking uses staff-issued, single-use invite codes (never self-claimed by email).
- Staff identity is verified server-side by checking `saas.org_members` with the service role key.

### Database schema (`cr`)

| Migration | Content |
|-----------|---------|
| 028 | Companion core — meds, diet, exercise, vitals, journal |
| 029 | Patient account linking, invite codes |
| 030 | Clinical connection — Forge dashboard, missed-med flagging |
| 031 | Messages (patient ↔ care team) |
| 032 | Patient–care-team messaging schema |
| 033 | Longitudinal analytics |
| 034 | RPM eligibility tracking |
| 035 | Device-sync backbone — Fitbit / Withings OAuth |
| 036 | Self-Chart Viewer Phase 4 + companion-translate edge function |
| 037 | Companion Mobile pairing infrastructure (`companion_mobile_session`, `companion_mobile_invite`, `companion_mobile_pairing_attempt`, `companion_mobile_audit_event`, `companion_vital`) |
| 038 | Patient medical accounting — invoices, payments, ERA |
| 039 | Billing multi-currency and summary RPCs |
| 040 | Billing upload infrastructure — AI extraction, storage |
| 041 | Co-insurance column; `companion_commit_billing_upload` RPC |
| 042 | Void + edit-extraction RPCs; `voided` status on billing uploads |

> ⚠️ **Migration numbering has parallel tracks** (companion / billing / clinical), so numbers repeat across `migrations/` files and the Supabase history — trust the **filename**, not the number. Recent additions (apply via `psql`, see [Deployment & operations](#deployment--operations)):
>
> | File | Content |
> |------|---------|
> | `038_companion_day_log_history.sql` | Daily Log snapshot (`cr.companion_day_log`) + `companion_save_day_log` / `companion_log_history` RPCs + `patient_account.friendly_name` |
> | `039_companion_records.sql` | Health records + uploads (`cr.companion_record`, `companion-records` bucket + RLS) + create/list/delete RPCs + `cr.current_patient_org()` helper |

### Supabase Storage buckets

| Bucket | Access | Use |
|--------|--------|-----|
| `billing-uploads` | Private | Patient-uploaded billing documents (invoices, receipts, insurance statements) |
| `patient-photos` | Private | Patient profile photos. RLS: each patient reads/writes only their own `{auth_user_id}/` folder. **Render via `createSignedUrl`, not `getPublicUrl`** (public URLs 403 on this private bucket — that was the "broken avatar" bug). |
| `companion-records` | Private | Patient health-record uploads (implants/devices, surgical, labs, radiology). RLS: `{auth_uid}/` folder per patient; served via signed URLs. |

### Netlify functions

#### Patient-facing

| Function | Method(s) | Purpose |
|----------|-----------|---------|
| `companion-ai` | POST | Guardrailed AI for treatment / diet / exercise screens |
| `companion-billing-extract` | POST | AI billing extraction (Claude); extract-only, no auto-post |
| `companion-connect` | GET | Device OAuth initiation (Fitbit / Withings) |
| `companion-oauth-callback` | GET | Device OAuth callback |
| `companion-sync` | POST | Ingest device data |
| `companion-care-plan-current` | GET | Current care plan for the patient |
| `companion-log-day` | POST | Daily log write → `cr.companion_save_day_log` (calls `.schema('cr')`) |
| `companion-log-history` | GET | Daily log read-back → `cr.companion_log_history` (calls `.schema('cr')`) |
| `companion-fx-rates` | GET | FX rates for multi-currency billing |
| `companion-invoice-mark-payment` | POST | Patient submits payment record for review |
| `companion-invoice-approve-payment` | POST | Staff approves/rejects payment record |
| `patient-profile` | GET / PATCH | Patient reads own profile; PATCH updates photo URL only |

#### Companion Mobile (staff + native app)

| Function | Method(s) | Purpose |
|----------|-----------|---------|
| `companion-pair` | POST | Mobile app pairing — verifies code, issues token pair |
| `companion-ingest` | POST | Mobile vitals/health data ingest |
| `companion-refresh` | POST | Refresh expired access token |
| `mobile-staff-me` | GET | Staff identity check (used by React auth provider) |
| `mobile-config` | GET / PATCH | Org mobile config |
| `mobile-invites` | GET | List invites (admin) |
| `mobile-invite-action` | POST | Generate / revoke invite (admin) |
| `mobile-sessions` | GET | List active sessions (admin) |
| `mobile-session-action` | POST | Revoke session (admin) |
| `mobile-sync-monitor` | GET | Per-patient sync status and error log (admin) |
| `mobile-patient-status` | GET | Single-patient mobile status (admin) |
| `mobile-audit` | GET | Audit event log (admin) |
| `mobile-patient-search` | GET | Patient search autocomplete for invite generation |
| `mobile-stats` | GET | Org-level stats for overview tiles |

### Data flow — billing uploads

```
patient picks file
  → supabase.storage 'billing-uploads' (private)
  → cr.companion_create_billing_upload RPC (registers row)
  → companion-billing-extract (Claude reads doc, sets extracted/needs_review)
  → patient reviews extracted data
  → patient clicks "Post to billing"
  → cr.companion_commit_billing_upload RPC (inserts ledger rows, idempotent)
  → patient can Edit extraction or Remove (void with required reason)
  → voided rows hidden from patient view; file kept for audit
```

---

### Data flow — records / uploads

```
patient picks a category (implant / surgical / lab / radiology)
  → optional: scan the device UDI barcode (camera; GS1 DataMatrix / Code-128; parsed by src/lib/gs1.ts)
      → auto-fills UDI-DI / LOT / serial / expiry
  → files upload to supabase.storage 'companion-records' (private, {auth_uid}/ folder)
  → cr.companion_create_record RPC (stores metadata + file refs in cr.companion_record)
  → Records page = grid of tiles (image thumbnails / doc icons)
  → click a tile → gallery/lightbox (large image or inline PDF), all served via signed URLs
```

---

## Deployment & operations

- **Prod site:** <https://patienttraccompanion.com> (Netlify), **auto-deploys on push to `master`** (build: `npm run build`). Flow: feature branch → `npm run typecheck && npm test && npm run build` → merge to `master` → auto-deploy. Confirm live via the Netlify **Deploys** tab — the served `index-*.js` hash can lag at the CDN edge, so trust the dashboard, not a `curl`.
- **Prod database:** Supabase project **PatientTrac-Clinical-Repository** (ref `mskormozwekezjmtcylv`, Postgres 17).
- **Migrations are applied by hand:** paste the whole `migrations/NNN_*.sql` into `psql` (or the Supabase SQL editor) against prod. They're written idempotent. **Apply the migration before/with the code deploy that uses it**, or new RPC calls 404.
- `/api/*` → `/.netlify/functions/*` via `netlify.toml` redirects.
- The **native iOS/Android app is a separate repo**; this repo only deep-links to it: `patienttraccompanion://pair?code=PT-XXXXXXXX-XXXXXXXX`. Pairing-code format: `PT-` + two 8-char groups; alphabet `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (excludes I/L/O and 0/1).

## Schema & data-access gotchas (read before touching `cr`)

Hard-won facts, verified against prod — these caused real bugs:

- **`cr.care_plan` PK is `id`** (not `care_plan_id`). `cr.patient` PK is `patient_id`. `cr.patient_account` links `auth_user_id` ↔ `patient_id` ↔ `org_id`.
- **PostgREST's default schema is `public`.** Browser code calls `cr` RPCs via `cr()` (= `supabase.schema('cr')`); a Netlify function's Supabase client **must** use `.schema('cr').rpc(...)` or it 404s on `public.<fn>`. Probe: `POST /rest/v1/rpc/<fn>` with no `Content-Profile` header → 404 = default is public.
- Some companion RPCs live in **`public`** (e.g. `companion_log_day`), others in `cr` — check `pg_proc` before schema-qualifying.
- **`cr` has `ALTER DEFAULT PRIVILEGES`** (owner `postgres`): new **tables** → `authenticated` (all DML) + `service_role` (all DML); new **sequences** → `authenticated` (SELECT, USAGE) **only**. A SERIAL table created as postgres auto-grants `authenticated` (no manual grants needed) — but **`service_role` gets NO sequence USAGE by default** (this caused a "permission denied for sequence" ingest failure; grant it explicitly if a `service_role` path inserts).
- **RLS patterns:** staff read = `org_id IN (SELECT org_id FROM saas.org_members WHERE id = auth.uid())`; patient rw = `patient_id = cr.current_patient_id()` (SECURITY DEFINER). For a definer org lookup use `cr.current_patient_org()`.
- **Private buckets: render via `createSignedUrl`, never `getPublicUrl`** (public URLs 403 → the broken-avatar bug).
- Exposed PostgREST schemas: `cr`, `public`, `saas`, `graphql_public`. (`saas` was once missing from the exposed list, which 406'd all `saas.*` queries.)

---

## Dev

```bash
npm install
npm run dev      # http://localhost:5177
```

---

## Environment variables

### Client (Vite — build time)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Netlify functions (Netlify site settings → Environment variables)

```
# Supabase
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...       # Required by all admin + mobile functions

# AI
ANTHROPIC_API_KEY=...               # companion-ai, companion-billing-extract

# Companion Mobile — pairing
MOBILE_PAIRING_BASE_URL=https://patienttraccompanion.com/pair
                                    # Base URL for QR code pairing links
MOBILE_PAIRING_CODE_SECRET=...      # HMAC secret for pairing codes and IP hashes
MOBILE_TOKEN_HASH_SECRET=...        # HMAC secret for access/refresh tokens (separate from pairing)
MOBILE_INGESTION_PUBLIC_URL=https://patienttraccompanion.com/api/companion-ingest
                                    # Ingest URL returned to the native app after pairing
MOBILE_ACCESS_TOKEN_TTL_SECONDS=86400    # Access token lifetime (24 h default)
MOBILE_REFRESH_TOKEN_TTL_SECONDS=2592000 # Refresh token lifetime (30 d default)

# Device OAuth (Fitbit / Withings)
FITBIT_CLIENT_ID=...
FITBIT_CLIENT_SECRET=...
WITHINGS_CLIENT_ID=...
WITHINGS_CLIENT_SECRET=...
WITHINGS_API_BASE=https://wbsapi.withings.net
WITHINGS_AUTH_BASE=https://account.withings.com
WITHINGS_MEDICAL_GRADE=false        # Set true only for FDA-cleared devices
OAUTH_STATE_SECRET=...
SYNC_CRON_SECRET=...
COMPANION_PUBLIC_URL=https://patienttraccompanion.com
```

---

## Patient auth & live data

A patient's login is bound to a `cr.patient` record only through a staff-issued, single-use invite code.

**Flow:**

```
patient signs up / signs in
  → enters invite code
  → cr.redeem_patient_invite()
  → auth_user_id links to cr.patient_account
  → patient can log medications, diet, vitals, journal, billing docs, view profile
  → staff monitors in /admin/companion-mobile
```

**To issue an invite code for a seeded patient (SQL):**

```sql
select cr.create_patient_invite(<patient_id>);
```

**To generate a mobile pairing invite (UI):**  
Admin → Companion Mobile → Invites → Generate Invite → search patient name or ID → Generate

---

## Clinical connection in Forge

**Location:** `patienttrac-scheduling/src/pages/admin/CompanionCare.tsx` → `/admin/companion`

Provides:
- Org-scoped Companion patient roster
- Per-patient monitoring drawer: 7-day adherence, journal red flags, vitals, diet, activity, alerts
- Invite / enroll workflow

**Key DB objects (migration 030):**
- `cr.companion_roster` — org-scoped view
- `cr.companion_patient_overview(p_patient_id)` — full per-patient feed
- `cr.flag_missed_meds()` — nightly pg_cron at 21:00

---

## i18n

Three locales: **EN · ES · FR**. Locale persists in `localStorage` (`cmp_lang`), auto-detected from `navigator.language` on first visit. All patient-facing strings live in `src/lib/i18n.tsx`.

---

## Compliance notes

- Consumer-wearable vitals are informational and not diagnostic (disclaimers in-app).
- Billable RPM workflows (CMS 99453 / 99454 / 99457 / 99458) require appropriate operational controls and FDA-cleared devices. RPM billing is gated on `cr.companion_vital.is_medical_grade` and **not** enabled by default.
- The education assistant is not a medical device — it does not diagnose, prescribe, or alter medication instructions.
- Billing uploads and extracted data are retained for audit; no hard deletes. Void sets `extraction_status = 'voided'` with a required patient-supplied reason.
- Profile photo upload uses Supabase Storage RLS so patients can only write to their own folder; photos are not linked to clinical records.
- Pairing codes and IP rate-limit data are stored only as HMAC hashes — no raw codes or raw IPs persist after redemption.

---

## Still ahead

- Apple Health / Google Health Connect sync
- Push notifications for care-team replies
- Care-plan authoring from Forge
- Staff billing review in Forge (void + reason + audit provenance)
- Expanded RPM workflows
- Apple Team ID for Universal Links AASA (replace `TEAMID` placeholder before App Store submission)

---

*PatientTrac Companion · HIPAA-aligned patient engagement, recovery monitoring, and medical billing*
