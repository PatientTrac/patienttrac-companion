// src/lib/auth/mfa.ts
// Native Supabase TOTP MFA (Google Authenticator). No secret is ever stored in our own tables.
// AAL2 lands in the JWT for free. We deliberately do NOT gate data-layer RPCs on AAL2 — the
// patient read/write RPCs resolve identity via cr.current_patient_id(), so cross-app (AAL1)
// entry keeps working. MFA is enforced at the login UI only.
//
// NOTE: fix the import below to match the actual Supabase client module path in this repo.
import { supabase } from '../supabaseClient';

export type AalState = { currentLevel: string | null; nextLevel: string | null };

/** Current vs. next Authenticator Assurance Level for the live session. */
export async function getAal(): Promise<AalState> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  return { currentLevel: data.currentLevel, nextLevel: data.nextLevel };
}

/** True when a verified factor exists but the session has not been elevated to AAL2 yet. */
export async function mfaChallengeNeeded(): Promise<boolean> {
  const { currentLevel, nextLevel } = await getAal();
  return nextLevel === 'aal2' && currentLevel !== 'aal2';
}

/** The user's first verified TOTP factor, or null if none is enrolled. */
export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const totp = (data.totp ?? []).find((f) => f.status === 'verified');
  return totp?.id ?? null;
}

/** Remove any half-finished (unverified) TOTP factors so re-enrollment never collides. */
export async function clearUnverifiedFactors(): Promise<void> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const unverified = (data.totp ?? []).filter((f) => f.status !== 'verified');
  for (const f of unverified) {
    await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
}

export type EnrollResult = { factorId: string; qrCodeSvg: string; secret: string; uri: string };

/**
 * Begin TOTP enrollment. Returns a QR (SVG data-uri) to render and the manual-entry secret.
 * Call confirmEnrollment() with the 6-digit code the authenticator app shows.
 */
export async function beginEnrollment(friendlyName = 'Companion'): Promise<EnrollResult> {
  await clearUnverifiedFactors();
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    // friendlyName must be unique among the user's factors:
    friendlyName: `${friendlyName}-${Date.now()}`,
  });
  if (error) throw error;
  return {
    factorId: data.id,
    qrCodeSvg: data.totp.qr_code, // SVG data URI -> <img src={qrCodeSvg} />
    secret: data.totp.secret,     // manual-entry fallback
    uri: data.totp.uri,
  };
}

/** Verify a 6-digit code against a factor (used for both enrollment confirmation and login). */
export async function challengeAndVerify(factorId: string, code: string): Promise<void> {
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
  if (chErr) throw chErr;
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code });
  if (error) throw error; // session is now AAL2 on success
}

export const confirmEnrollment = challengeAndVerify;

/** Permanently remove a factor (admin/reset flows). */
export async function unenroll(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}
