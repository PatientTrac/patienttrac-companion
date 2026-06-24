# PatientTrac Companion

The post-registration patient companion — keeps the care relationship going **between visits**.
Built for recovery- and treatment-heavy journeys: oncology, post-surgery, chronic care.

**Stack:** React 18 + TypeScript + Vite 5 · React Router · Supabase (shared `mskormozwekezjmtcylv`) · Netlify
**Brand:** PatientTrac HUD — navy `#060e1c`, gold `#c9a96e`, cyan `#00d4ff`, Companion accent mint `#34d399`. Poppins / Rajdhani / DM Sans.

## What it does (Phase 1)
1. **Medications** — daily adherence logging
2. **Diet** — meal & fluid journal
3. **Vitals & devices** — manual vitals + connect Apple Health / Health Connect / Fitbit / Withings (informational, not diagnostic)
4. **Journal** — daily check-in (mood / pain / symptoms) with red-flag awareness → care-team alerts
5. **Treatment & learning** — care-plan summary + guardrailed AI education (never diagnoses, never changes meds, routes to the care team)

## Architecture
- **Patients authenticate via Supabase Auth** (separate from staff TOTP), linked to `cr.patient` through `cr.patient_account`.
- Data model in `migrations/028_companion_module.sql` — patient-only + staff RLS on every table.
- AI runs server-side via `netlify/functions/companion-ai.ts` (key never in the browser) under strict non-diagnostic guardrails.
- This scaffold persists to `localStorage` so it runs immediately; swap each page's `useLocal` for the Supabase tables as the next step.

## Dev
```bash
npm install
npm run dev      # http://localhost:5177
```

## Env (Netlify)
```
VITE_SUPABASE_URL=...        # client
VITE_SUPABASE_ANON_KEY=...   # client
ANTHROPIC_API_KEY=...        # server-only (companion-ai function)
```

## Compliance notes
- Consumer-wearable vitals are informational, not diagnostic (disclaimers in-app).
- Billable RPM (CMS 99453/99454/99457/99458) requires FDA-cleared devices + ≥16 days of readings — gate on `cr.companion_vital.is_medical_grade`; not enabled in Phase 1.
- The education assistant is intentionally constrained and is not a medical device.

*PatientTrac Companion · v0.1.0 · HIPAA-aligned*

---

## Phase 2 — Patient auth & live data (this build)

Companion now uses **Supabase Auth** for patients and reads/writes the real `cr` tables (RLS-scoped per patient). `localStorage` is gone.

**Required env (client):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
**Required env (server):** `ANTHROPIC_API_KEY` (AI panels)

**DB:** apply migrations in order — `028_companion_module.sql`, then `029_companion_patient_linking.sql`.

**Account linking (secure):** a patient's login is bound to a `cr.patient` record only by a staff-issued, single-use invite code — never by self-claimed email. Flow: patient signs up / signs in → enters invite code → `cr.redeem_patient_invite()` links `auth.uid()` to the patient.

**To test the whole loop:** in the SQL editor (as a staff/super_admin session) issue a code for a seeded patient:
```sql
select cr.create_patient_invite(<patient_id>);
```
Then in the app: sign up → enter that code → log a med / meal / check-in and confirm rows land in the `cr.companion_*` tables.

**Next (Phase 3):** the care-team dashboard (staff view of adherence, journal red-flags, vitals trends), device sync (Apple Health / Health Connect / Fitbit / Withings), and care-plan authoring from Forge.
