/**
 * OAuth CSRF state helpers.
 *
 * Generates a cryptographically random state token before each OAuth redirect
 * and verifies it on callback. Without this, an attacker who can deliver a
 * crafted callback URL to a logged-in user can attach the user's account to
 * the attacker's third-party identity (Meta/Threads/YouTube).
 *
 * State is stored in sessionStorage scoped per provider so the value lives
 * only for the current tab + flow and dies on tab close.
 */

type Provider = 'meta' | 'threads' | 'youtube';

const KEY = (p: Provider) => `oauth_state_${p}`;

function randomState(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // Fallback for environments without crypto.randomUUID
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateOAuthState(provider: Provider): string {
  const state = randomState();
  try {
    sessionStorage.setItem(KEY(provider), state);
  } catch {
    // sessionStorage unavailable (private mode quirk); state will fail to verify
    // on return, which surfaces as a CSRF error — a safe failure mode.
  }
  return state;
}

/**
 * Verify and consume the state. Returns true only if the state matches the
 * stored value. The stored value is always cleared, even on mismatch, to
 * prevent replay.
 */
export function consumeOAuthState(provider: Provider, received: string | null): boolean {
  let stored: string | null = null;
  try {
    stored = sessionStorage.getItem(KEY(provider));
    sessionStorage.removeItem(KEY(provider));
  } catch {
    return false;
  }
  if (!stored || !received) return false;
  return stored === received;
}
