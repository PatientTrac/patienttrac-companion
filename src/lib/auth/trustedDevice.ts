// src/lib/auth/trustedDevice.ts
// "Trusted device": after a successful TOTP verification the patient may mark this device
// trusted for N days. On subsequent DIRECT logins, a valid trusted-device token lets the app
// skip the TOTP prompt. Possession of the device-bound token is the second factor for that
// window (password is still required every login).
//
// The raw token lives ONLY in this device's localStorage. The server stores sha256(token) and
// scopes every lookup to the calling auth.uid(), so a stolen token is useless to another account.
//
// Backend (already applied — migration `companion_patient_trusted_devices`):
//   cr.patient_register_trusted_device(p_raw_token, p_label, p_user_agent, p_days) -> json
//   cr.patient_check_trusted_device(p_raw_token) -> boolean
//   cr.patient_revoke_trusted_device(p_raw_token | null) -> json   (null revokes ALL devices)
//
// NOTE: fix the import below to match the actual Supabase client module path in this repo.
import { supabase } from '../supabase';

const DEVICE_TOKEN_KEY = 'ptc.deviceToken';
const DEFAULT_TRUST_DAYS = 30;

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function getRawToken(): string | null {
  try { return localStorage.getItem(DEVICE_TOKEN_KEY); } catch { return null; }
}

function ensureRawToken(): string {
  let t = getRawToken();
  if (!t) {
    t = randomToken();
    try { localStorage.setItem(DEVICE_TOKEN_KEY, t); } catch { /* private mode: token is ephemeral */ }
  }
  return t;
}

/** Mark THIS device trusted for `days`. Call only after TOTP has been verified this session. */
export async function trustThisDevice(days = DEFAULT_TRUST_DAYS, label?: string): Promise<boolean> {
  const raw = ensureRawToken();
  const { data, error } = await supabase.schema('cr').rpc('patient_register_trusted_device', {
    p_raw_token: raw,
    p_label: label ?? null,
    p_user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    p_days: days,
  });
  if (error) throw error;
  return (data as any)?.state === 'ok';
}

/** Is THIS device currently trusted for the logged-in patient? Safe to call at AAL1 (pre-TOTP). */
export async function isThisDeviceTrusted(): Promise<boolean> {
  const raw = getRawToken();
  if (!raw) return false;
  const { data, error } = await supabase.schema('cr').rpc('patient_check_trusted_device', {
    p_raw_token: raw,
  });
  if (error) throw error;
  return data === true;
}

/** Stop trusting THIS device (and clear the local token). */
export async function forgetThisDevice(): Promise<void> {
  const raw = getRawToken();
  if (raw) {
    await supabase.schema('cr').rpc('patient_revoke_trusted_device', { p_raw_token: raw });
  }
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
}

/** Revoke ALL trusted devices for the logged-in patient (lost-device / "sign out everywhere"). */
export async function forgetAllDevices(): Promise<number> {
  const { data, error } = await supabase.schema('cr').rpc('patient_revoke_trusted_device', {
    p_raw_token: null,
  });
  if (error) throw error;
  try { localStorage.removeItem(DEVICE_TOKEN_KEY); } catch { /* ignore */ }
  return (data as any)?.revoked ?? 0;
}
