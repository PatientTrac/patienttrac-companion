// src/lib/auth/loginPrefs.ts
// "Stay signed in" (persistent session) and "prefill email". Pure client-side, no DB.

const STAY_KEY = 'ptc.staySignedIn';
const EMAIL_KEY = 'ptc.lastEmail';

export function getStaySignedIn(): boolean {
  try { return localStorage.getItem(STAY_KEY) === 'true'; } catch { return false; }
}

export function setStaySignedIn(value: boolean): void {
  try { localStorage.setItem(STAY_KEY, value ? 'true' : 'false'); } catch { /* ignore */ }
}

export function getLastEmail(): string {
  try { return localStorage.getItem(EMAIL_KEY) ?? ''; } catch { return ''; }
}

export function setLastEmail(email: string): void {
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* ignore */ }
}

export function clearLastEmail(): void {
  try { localStorage.removeItem(EMAIL_KEY); } catch { /* ignore */ }
}

/**
 * Storage backing for the Supabase auth session, chosen by the "stay signed in" preference.
 *   true  -> localStorage  (session survives browser/tab close)
 *   false -> sessionStorage (session dropped when the tab closes)
 *
 * Use this when constructing the Supabase client (see HANDOFF.md "Persistent session"):
 *   createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, storage: pickAuthStorage() } })
 *
 * The choice is read at client-construction time, so toggling it takes effect on the next full load.
 */
export function pickAuthStorage(): Storage {
  if (typeof window === 'undefined') return undefined as unknown as Storage;
  return getStaySignedIn() ? window.localStorage : window.sessionStorage;
}
