import { generateOAuthState } from './oauthState';

/**
 * Starts the direct Google OAuth flow for YouTube.
 *
 * This is SEPARATE from the Post for Me connection on the same page. Post for
 * Me holds its own credentials and handles publishing plus per-post metrics.
 * This grant exists for one thing Post for Me cannot supply at all: the
 * subscriber count, which `youtube-sync` reads from the YouTube Data API.
 *
 * The app had a callback handler for this flow (`YoutubeCallback.tsx`) and an
 * edge function to exchange the code (`youtube-auth`), but nothing that
 * actually started it — so a disconnected YouTube could never be reconnected
 * from the UI. This is that missing piece.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/**
 * Only youtube.readonly. The sync calls `youtube/v3/channels?mine=true` and
 * nothing else — it stopped touching the Analytics API when per-post metrics
 * moved to Post for Me, so the narrower Analytics scope is no longer needed.
 */
const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly'];

export function youtubeRedirectUri(): string {
  return `${window.location.origin}/auth/youtube/callback`;
}

export function isYouTubeOAuthConfigured(): boolean {
  return Boolean(import.meta.env.VITE_YOUTUBE_CLIENT_ID);
}

/**
 * Builds the consent URL. Two parameters here are the difference between this
 * working and silently doing nothing:
 *
 *   access_type=offline  asks for a refresh token at all. Without it the grant
 *                        lasts an hour and the nightly sync breaks by morning.
 *
 *   prompt=consent       forces Google to issue a NEW refresh token. Google
 *                        returns one only on first consent otherwise, so a
 *                        RE-connect would come back with an access token and no
 *                        refresh token — the flow would look successful and the
 *                        sync would fail again the next day with the same
 *                        invalid_grant it was meant to fix.
 */
export function buildYouTubeAuthUrl(): string {
  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID as string | undefined;
  if (!clientId) {
    throw new Error('VITE_YOUTUBE_CLIENT_ID is not set');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: youtubeRedirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state: generateOAuthState('youtube'),
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

/** Sends the browser to Google's consent screen. */
export function startYouTubeConnect(): void {
  window.location.href = buildYouTubeAuthUrl();
}
