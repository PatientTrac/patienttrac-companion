# Handoff — Companion direct-login: TOTP MFA + stay-signed-in + trusted device + email prefill

**For:** Claude Code (Companion repo `PatientTrac/patienttrac-companion`)
**From:** DB/architecture session. Database work is DONE and verified; this is the client wiring.

---

## What is already applied to the database (do not re-run)

Migration `companion_patient_trusted_devices` is applied to `mskormozwekezjmtcylv`:

- Table `saas.patient_trusted_device` (uuid PK, `auth_user_id`, `patient_id`, `org_id`, `token_hash` UNIQUE = sha256 hex of the raw token, `label`, `user_agent`, `expires_at`, `last_used_at`, `revoked`). RLS on; staff org-wide SELECT only; **all writes go through the RPCs below or service role.** The raw token never reaches the server.
- `cr.patient_register_trusted_device(p_raw_token text, p_label text, p_user_agent text, p_days int) -> json` — `{state:'ok', expires_in_days}`. SECURITY DEFINER, resolves patient via `cr.current_patient_id()`. Upsert keyed on token hash, refreshes expiry, writes an `auth_audit_log` row.
- `cr.patient_check_trusted_device(p_raw_token text) -> boolean` — true iff a non-revoked, non-expired device token belongs to the caller. Bumps `last_used_at`. Safe to call at AAL1 (pre-TOTP).
- `cr.patient_revoke_trusted_device(p_raw_token text default null) -> json` — `{state:'ok', revoked:n}`. Null token revokes ALL of the caller's devices (lost-device / sign-out-everywhere).

EXECUTE on all three granted to `authenticated`. Verified end-to-end against patient 16: register → check(valid)=true → check(wrong)=false → cross-user check=false → revoke → recheck=false.

Native Supabase TOTP MFA is used for enrollment (`auth.mfa_factors` had zero factors — clean slate). **No `mfa_secret` column is added anywhere** — this avoids repeating the staff-side secret-storage pattern.

---

## Files in this package (drop into the repo)

```
src/lib/auth/mfa.ts            native Supabase TOTP helpers (enroll, challenge/verify, AAL)
src/lib/auth/trustedDevice.ts  trust/check/forget this device via the cr.* RPCs
src/lib/auth/loginPrefs.ts     stay-signed-in storage selection + email prefill
src/lib/auth/directLogin.ts    orchestrates password -> MFA gate -> trusted-device
```

**One import to fix in each lib:** they import `{ supabase }` from `'../supabaseClient'`. Repoint to the real client module path in this repo.

---

## The model (why it is built this way)

- **App-entry gate:** identity AND ( session is AAL2 **OR** this device is trusted **OR** arrived via cross-app token ).
- **Data layer:** identity only — patient RPCs resolve `cr.current_patient_id()` and are **never** AAL2-gated. This is the hook that keeps cross-app (AAL1) entry working and lets a trusted device enter at AAL1.
- **Trusted device = the second factor for its window.** Password is still required every login; possession of the device-bound random token substitutes for the TOTP code for N days (default 30). Token is scoped to the owner server-side, so theft across accounts is useless.
- **MFA is mandatory** (PHI). A patient with no verified factor is forced through enrollment on first direct login.

---

## Wiring (the two things Claude Code owns in the repo)

### 1. Direct-login component (the email/password form)

Use `startDirectLogin(email, password)` and branch on the returned step:

```ts
const step = await startDirectLogin(email, password);
switch (step.status) {
  case 'authenticated':                 // enter the app
    enterApp(); break;
  case 'enroll_required':               // render QR from step.enroll.qrCodeSvg + manual secret
    showEnroll(step.enroll); break;     // then: completeEnrollment(step.enroll.factorId, code, rememberDevice)
  case 'totp_required':                 // prompt 6-digit code
    showTotp(step.factorId); break;     // then: completeTotp(step.factorId, code, rememberDevice)
}
```

- Add a **"Stay signed in"** checkbox -> `setStaySignedIn(checked)` (from `loginPrefs`).
- Add a **"Trust this device"** checkbox on the TOTP/enroll screens -> pass as `rememberDevice` to `completeTotp` / `completeEnrollment`.
- Prefill the email field from `getLastEmail()` on mount.
- Enrollment screen: `<img src={enroll.qrCodeSvg} />` for Google Authenticator, show `enroll.secret` as manual-entry fallback, collect the 6-digit code, call `completeEnrollment`.

### 2. Persistent session (Supabase client construction)

In the existing `createClient(...)`, set the auth storage from the preference:

```ts
import { pickAuthStorage } from './lib/auth/loginPrefs';

createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, storage: pickAuthStorage() },
});
```

`pickAuthStorage()` returns `localStorage` when "stay signed in" is on, else `sessionStorage`. Read at construction time, so the choice applies on the next full load.

### 3. Cross-app entry path — LEAVE UNCHANGED

The Profiler/Forge -> Companion path (`redeem_cross_app_token`) already establishes the session and must route straight in. **Do not** call `startDirectLogin`, the MFA gate, or the trusted-device check on that branch. Just confirm the entry router cleanly separates "arrived with cross-app token" from "direct login form."

---

## "Continue with Google" stays banned

This adds Google **Authenticator** (TOTP 6-digit codes) only. No Google OAuth / Workspace / SSO anywhere on the login page.

---

## Follow-ups (not in this package)

- Lost-device reset + backup codes (shared with the staff MFA P1 follow-up). `forgetAllDevices()` exists for "sign out everywhere"; a staff-assisted `mfa.unenroll()` reset path is still to be designed.
- Optional account-settings screen: list/forget trusted devices, re-enroll TOTP.
