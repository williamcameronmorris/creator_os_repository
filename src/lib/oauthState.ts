/**
 * OAuth CSRF state helpers.
 *
 * Generates a cryptographically random state token before each OAuth redirect
 * and verifies it on callback. Without this, an attacker who can deliver a
 * crafted callback URL to a logged-in user can attach the user's account to
 * the attacker's third-party identity (Meta/Threads/YouTube).
 *
 * State is stored in localStorage with a 10-minute TTL. localStorage (rather
 * than sessionStorage) is required because some auth flows cross a tab/window
 * boundary or land in a different browser process than the one that initiated
 * them — most notably the iOS Capacitor webview hand-off to system Safari for
 * Google's consent screen, which loses sessionStorage entirely. The 10-minute
 * TTL is a safety floor: a user who abandons the OAuth flow won't have a
 * stale CSRF token sitting around forever.
 */

type Provider = 'meta' | 'threads' | 'youtube';

const KEY = (p: Provider) => `oauth_state_${p}`;
const TTL_MS = 10 * 60 * 1000; // 10 minutes

interface StoredState {
  state: string;
  expiresAt: number;
}

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
  const stored: StoredState = { state, expiresAt: Date.now() + TTL_MS };
  try {
    localStorage.setItem(KEY(provider), JSON.stringify(stored));
  } catch {
    // localStorage unavailable (private mode quirk, disabled storage); state
    // will fail to verify on return, which surfaces as a CSRF error — a safe
    // failure mode.
  }
  return state;
}

/**
 * Verify and consume the state. Returns true only if the state matches the
 * stored value AND has not expired. The stored value is always cleared, even
 * on mismatch or expiry, to prevent replay.
 */
export function consumeOAuthState(provider: Provider, received: string | null): boolean {
  let parsed: StoredState | null = null;
  try {
    const raw = localStorage.getItem(KEY(provider));
    localStorage.removeItem(KEY(provider));
    if (raw) {
      const candidate = JSON.parse(raw) as StoredState;
      if (typeof candidate?.state === 'string' && typeof candidate?.expiresAt === 'number') {
        parsed = candidate;
      }
    }
  } catch {
    return false;
  }
  if (!parsed || !received) return false;
  if (Date.now() > parsed.expiresAt) return false;
  return parsed.state === received;
}
