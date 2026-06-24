# PatientTrac Companion

The post-registration patient companion — keeps the care relationship going **between visits**.

Built for recovery- and treatment-heavy journeys: oncology, post-surgery, chronic care, medication adherence, symptom tracking, and patient education.

Companion is the **patient-facing app**. The care-team monitoring dashboard ships inside **PatientTrac Forge** at `Admin → Companion` (`/admin/companion`).

**Stack:** React 18 + TypeScript + Vite 5 · React Router · Supabase (shared PatientTrac clinical schema) · Netlify
**Brand:** PatientTrac HUD — navy `#060e1c`, gold `#c9a96e`, cyan `#00d4ff`, Companion accent mint `#34d399`. Poppins / Rajdhani / DM Sans.

---

## Current capabilities

1. **Medications** — daily adherence logging
2. **Diet** — meal and fluid journal
3. **Vitals** — manual vitals logging; consumer-device sync is planned but not yet live
4. **Journal** — daily check-in for mood, pain, symptoms, and red-flag awareness
5. **Treatment & learning** — care-plan summary and guardrailed AI education
6. **Care-team connection** — patient activity feeds into Forge care monitoring
7. **Alerts** — open/urgent alert visibility in the Forge care-team dashboard, including missed-medication flagging

The education assistant is constrained: it does not diagnose, does not change medications, and routes clinical concerns back to the care team.

---

## Architecture

- Patients authenticate through **Supabase Auth**, separate from staff TOTP authentication.
- Patient accounts are linked to `cr.patient` through `cr.patient_account`.
- Account linking uses staff-issued, single-use invite codes (never self-claimed by email).
- Data model starts in `migrations/028_companion_module.sql`.
- Patient linking is handled in `migrations/029_companion_patient_linking.sql`.
- Clinical connection to Forge is handled in `migrations/030_companion_clinical_connection.sql`.
- Companion data uses patient-scoped and staff-scoped RLS on every table.
- AI runs server-side through `netlify/functions/companion-ai.ts`; the API key is never exposed in the browser.

---

## Dev

```bash
npm install
npm run dev      # http://localhost:5177
```

## Env

Client:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Server only:

```
ANTHROPIC_API_KEY=...
```

---

## Patient auth & live data

Companion uses Supabase Auth for patients and reads/writes the real `cr` tables with RLS-scoped access.

**Required migrations (in order):**

```
028_companion_module.sql
029_companion_patient_linking.sql
030_companion_clinical_connection.sql
```

A patient's login is bound to a `cr.patient` record only through a staff-issued, single-use invite code. Patients do not self-claim their clinical record by email.

**Flow:**

```
patient signs up / signs in
  → enters invite code
  → cr.redeem_patient_invite()
  → auth.uid() links to the patient record
  → patient logs medications, diet, vitals, journal entries, and education activity
  → care team monitors activity in Forge
```

**To test the patient-linking loop,** issue an invite code for a seeded patient from a staff or super-admin SQL session:

```sql
select cr.create_patient_invite(<patient_id>);
```

Then in Companion:

```
sign up
  → enter invite code
  → log a medication, meal, vital, or check-in
  → confirm rows land in the cr.companion_* tables
  → open Forge Admin → Companion to review the patient in care monitoring
```

---

## Clinical connection in Forge

The care-team dashboard is live and ships inside **PatientTrac Forge**, not inside the patient app.

**Location:**

```
patienttrac-scheduling/src/pages/admin/CompanionCare.tsx
/admin/companion
AdminShell navigation → Companion
```

**The dashboard provides:**

- org-scoped Companion patient roster
- per-patient monitoring drawer
- 7-day medication adherence
- journal red flags
- vitals, diet, and activity feed
- open and urgent alerts
- invite/enroll workflow

**Database objects (`migrations/030_companion_clinical_connection.sql`):**

- `cr.companion_roster` — org-scoped view, one row per enrolled patient
- `cr.companion_patient_overview(p_patient_id INTEGER)` — full per-patient feed for the drawer
- `cr.flag_missed_meds()` — nightly red-flag job, scheduled via `pg_cron` as `companion-missed-meds` at 21:00 (database time)

---

## Compliance notes

- Consumer-wearable vitals are informational and not diagnostic (disclaimers in-app).
- Billable RPM workflows (CMS 99453 / 99454 / 99457 / 99458) require appropriate operational controls, FDA-cleared devices where applicable, and sufficient documented readings.
- RPM billing is gated on `cr.companion_vital.is_medical_grade` and is **not** enabled by default.
- The education assistant is constrained and is not a medical device — it does not diagnose, prescribe, alter medication instructions, or replace the care team.

---

## Still ahead

- Apple Health sync
- Google Health Connect sync
- Fitbit sync
- Withings sync
- Care-plan authoring from Forge
- Expanded RPM workflows
- Enhanced patient–provider messaging
- Longitudinal recovery analytics

---

*PatientTrac Companion · HIPAA-aligned patient engagement and recovery monitoring*
