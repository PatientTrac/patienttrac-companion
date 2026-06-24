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
