// src/lib/auth/directLogin.ts
// Orchestrates the DIRECT email+password login for Companion. This is NOT used on the cross-app
// entry path (Profiler/Forge -> Companion via redeem_cross_app_token); that path establishes the
// session upstream and routes straight in with no TOTP and no trusted-device check.
//
// App-entry gate:  identity AND ( session is AAL2  OR  this device is trusted  OR  cross-app token )
// Data layer:      identity only, via SECURITY DEFINER RPCs (cr.current_patient_id()). Never AAL2-gated.
//
// NOTE: fix the import below to match the actual Supabase client module path in this repo.
import { supabase } from '../supabase';
import { setLastEmail } from './loginPrefs';
import { getVerifiedTotpFactorId, mfaChallengeNeeded, challengeAndVerify, beginEnrollment, EnrollResult } from './mfa';
import { isThisDeviceTrusted, trustThisDevice } from './trustedDevice';

export type LoginStep =
  | { status: 'authenticated' }                       // enter the app
  | { status: 'enroll_required'; enroll: EnrollResult } // first-ever login: must set up TOTP
  | { status: 'totp_required'; factorId: string };      // verified factor exists: prompt 6-digit code

/**
 * Step 1: email + password, then resolve what (if anything) is still required before entry.
 * MFA is MANDATORY for patients (PHI) — a patient with no verified factor is sent to enrollment.
 */
export async function startDirectLogin(email: string, password: string): Promise<LoginStep> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;            // surface invalid-credentials to the form
  setLastEmail(email);

  const factorId = await getVerifiedTotpFactorId();
  if (!factorId) {
    const enroll = await beginEnrollment('Companion');
    return { status: 'enroll_required', enroll };
  }

  // Session somehow already AAL2 (e.g. unusual provider state) -> straight in.
  if (!(await mfaChallengeNeeded())) return { status: 'authenticated' };

  // Trusted device skips the TOTP prompt for its window. App enters at AAL1 by design.
  if (await isThisDeviceTrusted()) return { status: 'authenticated' };

  return { status: 'totp_required', factorId };
}

/**
 * Step 2a: confirm first-time enrollment with the 6-digit code, optionally trusting this device.
 * On success the session is AAL2 and the user enters the app.
 */
export async function completeEnrollment(
  factorId: string,
  code: string,
  rememberDevice: boolean,
  trustDays = 30,
): Promise<LoginStep> {
  await challengeAndVerify(factorId, code);
  if (rememberDevice) await trustThisDevice(trustDays);
  return { status: 'authenticated' };
}

/**
 * Step 2b: verify the login TOTP code, optionally trusting this device for next time.
 */
export async function completeTotp(
  factorId: string,
  code: string,
  rememberDevice: boolean,
  trustDays = 30,
): Promise<LoginStep> {
  await challengeAndVerify(factorId, code);
  if (rememberDevice) await trustThisDevice(trustDays);
  return { status: 'authenticated' };
}
