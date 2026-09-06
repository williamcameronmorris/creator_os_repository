/**
 * Which DIRECT platform grants the app still relies on, and for what.
 *
 * Posting and per-post metrics for every platform run through Post for Me,
 * which manages its own tokens. The direct grants stored on `profiles` are
 * only used for the things Post for Me cannot do:
 *
 *   instagram  follower count (Meta Graph) and comments in the inbox
 *   youtube    subscriber count and comments in the inbox
 *   threads    comments in the inbox only
 *   tiktok     nothing any more (the direct sync was retired; publishing is PFM)
 *
 * A banner that says "reconnect to keep posting and syncing" for a dead
 * Threads token is therefore wrong, and wrong in the way that costs trust:
 * the creator checks, sees Threads posting fine, and stops believing warnings.
 */

export type TokenStatus = 'connected' | 'expired' | 'missing';
export type TokenSeverity = 'warning' | 'notice';

export interface PlatformHealth {
  platform: string;
  label: string;
  status: TokenStatus;
  severity: TokenSeverity;
  /** What actually stops working, in the creator's words. */
  impact: string;
}

export const DIRECT_GRANTS: { platform: string; label: string; severity: TokenSeverity; impact: string }[] = [
  {
    platform: 'instagram',
    label: 'Instagram',
    severity: 'warning',
    impact: 'Follower counts and comments stop updating until you reconnect. Posting and post metrics are unaffected.',
  },
  {
    platform: 'youtube',
    label: 'YouTube',
    severity: 'warning',
    impact: 'Subscriber counts and comments stop updating until you reconnect. Posting and video metrics are unaffected.',
  },
  {
    platform: 'threads',
    label: 'Threads',
    severity: 'notice',
    impact: 'Only Threads comments in the inbox stop updating. Posting and metrics are unaffected; they run through Post for Me.',
  },
];

const SOON_MS = 24 * 60 * 60 * 1000;

/**
 * Judge one grant. `connected` is whether the token exists; `expiresAt` is
 * its expiry. Pass null for `expiresAt` when the platform refreshes on demand
 * (YouTube's 1h access token), so a past value does not false-flag.
 */
export function assessGrant(
  grant: (typeof DIRECT_GRANTS)[number],
  connected: boolean | null | undefined,
  expiresAt: string | null | undefined,
  now = Date.now(),
): PlatformHealth {
  const base = { platform: grant.platform, label: grant.label, severity: grant.severity, impact: grant.impact };
  if (!connected) return { ...base, status: 'missing' };
  if (expiresAt) {
    const expMs = new Date(expiresAt).getTime();
    if (Number.isFinite(expMs) && expMs - now < SOON_MS) return { ...base, status: 'expired' };
  }
  return { ...base, status: 'connected' };
}

export interface TokenHealthRow {
  instagram_connected?: boolean | null;
  instagram_token_expires_at?: string | null;
  youtube_connected?: boolean | null;
  youtube_token_expires_at?: string | null;
  threads_connected?: boolean | null;
  threads_token_expires_at?: string | null;
}

/** Every direct grant that was ever connected, judged. Never-connected platforms are left out. */
export function assessTokenHealth(row: TokenHealthRow | null | undefined, now = Date.now()): PlatformHealth[] {
  if (!row) return [];
  const byPlatform: Record<string, [boolean | null | undefined, string | null | undefined]> = {
    instagram: [row.instagram_connected, row.instagram_token_expires_at],
    // YouTube's stored expiry is the 1h access token, refreshed on demand from
    // the refresh token. Judge it by the refresh token's presence only.
    youtube: [row.youtube_connected, null],
    threads: [row.threads_connected, row.threads_token_expires_at],
  };
  return DIRECT_GRANTS.map((g) => assessGrant(g, ...byPlatform[g.platform], now)).filter((h) => h.status !== 'missing');
}
