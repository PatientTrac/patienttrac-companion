# PatientTrac Companion

The post-registration patient companion — keeps the care relationship going **between visits**.

Built for recovery- and treatment-heavy journeys: oncology, post-surgery, chronic care, medication adherence, symptom tracking, patient education, and medical billing.

Companion is the **patient-facing app**. The care-team monitoring dashboard ships inside **PatientTrac Forge** at `Admin → Companion` (`/admin/companion`).

**Stack:** React 18 + TypeScript + Vite 5 · React Router · Supabase (shared PatientTrac clinical schema `cr`) · Netlify Functions · Anthropic Claude API  
**Brand:** PatientTrac HUD — navy `#060e1c`, gold `#c9a96e`, cyan `#00d4ff`, Companion accent mint `#34d399`. Poppins / Rajdhani / DM Sans / DM Mono.

---

## Current capabilities

| # | Screen | What the patient can do |
|---|--------|------------------------|
| 1 | **Today** | Daily summary — meds taken, check-in status, latest vital, meals/activity count |
| 2 | **Medications** | Daily adherence logging; mark doses taken |
| 3 | **Diet** | Meal and fluid journal with AI nutrition Q&A |
| 4 | **Exercise** | Movement and rehab log with AI education |
| 5 | **Vitals & devices** | Manual vitals entry; consumer-device OAuth backbone (Fitbit / Withings) |
| 6 | **Journal** | Daily check-in — mood, pain (0–10), free-text note; red-flag alerts to care team |
| 7 | **Treatment & learning** | Care-plan display and guardrailed AI education assistant |
| 8 | **Messages** | Async patient ↔ care-team messaging |
| 9 | **Progress** | 30-day adherence trends, pain/mood charting |
| 10 | **My health record** | Care plan, active medications, lab results (via `@patienttrac/clinical-viewer`), device readings, education entries |
| 11 | **Billing & accounting** | Invoices, payments, insurance reimbursements, coverage card (primary, co-pay, deductible, co-insurance, OOP), multi-currency (USD + COP); AI document extraction with patient review gate; Edit extraction / Remove with required reason (soft void) |

**AI education assistant constraints:** does not diagnose, does not change medications, routes clinical concerns back to the care team.

---

## Architecture

### Auth & accounts

- Patients authenticate through **Supabase Auth**, separate from staff TOTP authentication.
- Patient accounts are linked to `cr.patient` through `cr.patient_account`.
- Account linking uses staff-issued, single-use invite codes (never self-claimed by email).

### Database migrations (`cr` schema)

| Migration | Content |
|-----------|---------|
| 028 | Companion core module — meds, diet, exercise, vitals, journal |
| 029 | Patient account linking, invite codes |
| 030 | Clinical connection — Forge care-team dashboard, missed-med flagging |
| 031 | Messages (patient ↔ care team) |
| 032 | Patient–care-team messaging schema |
| 033 | Longitudinal analytics |
| 034 | RPM eligibility tracking |
| 035 | Device-sync backbone — Fitbit / Withings OAuth |
| 036 | Self-Chart Viewer Phase 4 + companion-translate edge function |
| 037 | Companion Mobile pairing infrastructure |
| 038 | Patient medical accounting — invoices, payments, ERA |
| 039 | Billing multi-currency and summary RPCs |
| 040 | Billing upload infrastructure — AI extraction, storage |
| 041 | Co-insurance column; `companion_commit_billing_upload` RPC |
| 042 | Void + edit-extraction RPCs; `voided` status on billing uploads |

### Netlify functions

| Function | Purpose |
|----------|---------|
| `companion-ai` | Guardrailed AI for treatment / diet / exercise screens |
| `companion-billing-extract` | AI billing extraction (Claude); extract-only, no auto-post |
| `companion-connect` | Device OAuth initiation (Fitbit / Withings) |
| `companion-oauth-callback` | Device OAuth callback |
| `companion-sync` | Ingest device data |
| `companion-pair` | Mobile app pairing |
| `companion-ingest` | Mobile vitals ingest |
| `companion-refresh` | Mobile session refresh |
| `mobile-staff-me` | Staff identity for Mobile Admin |
| `mobile-config` | Org config for Mobile Admin |
| `mobile-invites` | Invite management for Mobile Admin |
| `mobile-invite-action` | Issue / revoke invites |
| `mobile-sessions` | Session list for Mobile Admin |
| `mobile-session-action` | Revoke mobile sessions |
| `mobile-sync-monitor` | Sync event log |
| `mobile-patient-status` | Per-patient status for Mobile Admin |
| `mobile-audit` | Audit log |
| `mobile-patient-search` | Patient search for Mobile Admin |
| `mobile-stats` | Org-level stats for Mobile Admin |

### Data flow — billing uploads

```
patient picks file
  → supabase.storage 'billing-uploads' (private bucket)
  → cr.companion_create_billing_upload RPC (registers row)
  → companion-billing-extract function (Claude reads doc, sets extracted/needs_review)
  → patient reviews extracted data in Uploads list
  → patient clicks "Post to billing"
  → cr.companion_commit_billing_upload RPC (inserts ledger rows, idempotent)
  → patient can Edit extraction (re-evaluates postability) or Remove (void with reason)
  → voided rows hidden by cr.companion_my_billing_uploads; file kept for audit
```

---

## Dev

```bash
npm install
npm run dev      # http://localhost:5177
```

## Env

### Client (Vite)

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

### Netlify function env (set in Netlify site settings → Environment variables)

```
ANTHROPIC_API_KEY=...            # companion-ai, companion-billing-extract
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...    # companion-billing-extract (service role for storage download)
```

---

## Patient auth & live data

**Required migrations (in order):** `028` through `042` — see table above.

A patient's login is bound to a `cr.patient` record only through a staff-issued, single-use invite code. Patients do not self-claim their clinical record by email.

**Flow:**

```
patient signs up / signs in
  → enters invite code
  → cr.redeem_patient_invite()
  → auth.uid() links to the patient record
  → patient logs medications, diet, vitals, journal entries, education, billing docs
  → care team monitors activity in Forge → /admin/companion
```

**To issue an invite code for a seeded patient:**

```sql
select cr.create_patient_invite(<patient_id>);
```

---

## Clinical connection in Forge

**Location:** `patienttrac-scheduling/src/pages/admin/CompanionCare.tsx` → `/admin/companion`

**The dashboard provides:**
- Org-scoped Companion patient roster
- Per-patient monitoring drawer: 7-day medication adherence, journal red flags, vitals, diet, activity feed, open/urgent alerts
- Invite / enroll workflow

**Key DB objects (migration 030):**
- `cr.companion_roster` — org-scoped view
- `cr.companion_patient_overview(p_patient_id)` — full per-patient feed
- `cr.flag_missed_meds()` — nightly pg_cron job at 21:00

---

## i18n

Three locales: **EN · ES · FR**. Locale is persisted in `localStorage` (`cmp_lang`) and auto-detected from `navigator.language` on first visit. All patient-facing strings are in `src/lib/i18n.tsx`.

---

## Compliance notes

- Consumer-wearable vitals are informational and not diagnostic (disclaimers in-app).
- Billable RPM workflows (CMS 99453 / 99454 / 99457 / 99458) require appropriate operational controls and FDA-cleared devices where applicable. RPM billing is gated on `cr.companion_vital.is_medical_grade` and is **not** enabled by default.
- The education assistant is not a medical device — it does not diagnose, prescribe, or alter medication instructions.
- Billing uploads and extracted data are retained for audit; no hard deletes. Void sets `extraction_status = 'voided'` with a required patient-supplied reason.

---

## Still ahead

- Apple Health / Google Health Connect sync
- Care-plan authoring from Forge
- Staff billing review in Forge (void + reason + who/when, same audit provenance as Companion)
- Expanded RPM workflows
- Push notifications for care-team replies

---

*PatientTrac Companion · HIPAA-aligned patient engagement, recovery monitoring, and medical billing*
