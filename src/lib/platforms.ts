import { supabase } from './supabase';
import { generateOAuthState } from './oauthState';
export { getMetaAuthUrl, getThreadsAuthUrl, disconnectMeta, disconnectThreads } from './meta';

export interface PlatformStatus {
  platform: 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube';
  connected: boolean;
  username?: string;
  followers?: number;
  lastSynced?: string;
  /** Extra display label (e.g. Facebook Page name) */
  label?: string;
}

export async function getPlatformStatus(userId: string): Promise<PlatformStatus[]> {
  const { data: profile } = await supabase
    .from('profiles')
    .select([
      // Meta / Facebook / Instagram Business / Threads
      'facebook_page_access_token', 'facebook_page_name', 'facebook_page_followers', 'last_facebook_sync',
      'instagram_access_token', 'instagram_handle', 'instagram_followers', 'last_instagram_sync',
      'threads_access_token', 'threads_handle', 'threads_followers', 'last_threads_sync',
      // TikTok / YouTube
      'tiktok_access_token', 'tiktok_handle', 'tiktok_followers', 'last_tiktok_sync',
      'youtube_access_token', 'youtube_handle', 'youtube_followers', 'last_youtube_sync',
    ].join(', '))
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    return [
      { platform: 'facebook', connected: false },
      { platform: 'instagram', connected: false },
      { platform: 'threads', connected: false },
      { platform: 'tiktok', connected: false },
      { platform: 'youtube', connected: false },
    ];
  }

  return [
    {
      platform: 'facebook',
      connected: !!(profile.facebook_page_access_token),
      username: profile.facebook_page_name || undefined,
      label: profile.facebook_page_name || undefined,
      followers: profile.facebook_page_followers || undefined,
      lastSynced: profile.last_facebook_sync || undefined,
    },
    {
      platform: 'instagram',
      connected: !!(profile.instagram_access_token),
      username: profile.instagram_handle || undefined,
      followers: profile.instagram_followers || undefined,
      lastSynced: profile.last_instagram_sync || undefined,
    },
    {
      platform: 'threads',
      connected: !!(profile.threads_access_token),
      username: profile.threads_handle || undefined,
      followers: profile.threads_followers || undefined,
      lastSynced: profile.last_threads_sync || undefined,
    },
    {
      platform: 'tiktok',
      connected: !!(profile.tiktok_access_token),
      username: profile.tiktok_handle || undefined,
      followers: profile.tiktok_followers || undefined,
      lastSynced: profile.last_tiktok_sync || undefined,
    },
    {
      platform: 'youtube',
      connected: !!(profile.youtube_refresh_token || profile.youtube_channel_id),
      username: profile.youtube_handle || undefined,
      followers: profile.youtube_followers || undefined,
      lastSynced: profile.last_youtube_sync || undefined,
    },
  ];
}

export function getInstagramAuthUrl(): string {
  const appId = import.meta.env.VITE_INSTAGRAM_APP_ID || '';
  const redirectUri = import.meta.env.VITE_INSTAGRAM_REDIRECT_URI || `${window.location.origin}/settings?platform=instagram`;
  const scope = 'instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list,pages_read_engagement,instagram_manage_insights';
  return `https://www.facebook.com/v25.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
}

export function getTikTokAuthUrl(): string {
  const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY || '';
  const redirectUri = import.meta.env.VITE_TIKTOK_REDIRECT_URI || `${window.location.origin}/settings?platform=tiktok`;
  const scope = 'user.info.basic,video.list,video.upload';
  return `https://www.tiktok.com/v2/auth/authorize?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export function getYouTubeAuthUrl(): string {
  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID || '';
  // Always use the dedicated callback route — never the settings page fallback
  const redirectUri = `${window.location.origin}/auth/youtube/callback`;
  const scope = [
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube.readonly',
    'https://www.googleapis.com/auth/yt-analytics.readonly',
  ].join(' ');
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope,
    access_type: 'offline',
    // prompt=consent forces Google to re-issue a refresh_token every time.
    // Without this, refresh_token is only returned on the very first authorization.
    prompt: 'consent',
    state: generateOAuthState('youtube'),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function disconnectPlatform(
  userId: string,
  platform: 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube'
): Promise<void> {
  const updates: Record<string, any> = {};

  switch (platform) {
    case 'facebook':
      // Disconnecting Facebook clears tokens but preserves page/account IDs.
      // facebook_page_id and instagram_business_account_id are stable identifiers
      // needed by the New Pages Experience fallback on reconnect — do not clear them.
      updates.meta_user_id = '';
      updates.meta_access_token = '';
      updates.meta_token_expires_at = null;
      updates.facebook_page_access_token = '';
      updates.instagram_access_token = '';
      updates.last_facebook_sync = null;
      updates.last_instagram_sync = null;
      break;
    case 'instagram':
      updates.instagram_access_token = '';
      updates.instagram_user_id = '';
      updates.instagram_business_account_id = '';
      updates.last_instagram_sync = null;
      break;
    case 'threads':
      updates.threads_user_id = '';
      updates.threads_access_token = '';
      updates.threads_token_expires_at = null;
      updates.threads_handle = '';
      updates.threads_followers = 0;
      updates.last_threads_sync = null;
      break;
    case 'tiktok':
      updates.tiktok_access_token = '';
      updates.tiktok_user_id = '';
      break;
    case 'youtube':
      updates.youtube_access_token = '';
      updates.youtube_refresh_token = '';
      updates.youtube_channel_id = '';
      updates.youtube_token_expires_at = null;
      break;
  }

  await supabase.from('profiles').update(updates).eq('id', userId);

  await supabase
    .from('platform_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('platform', platform);
}

export async function syncPlatform(
  platform: 'instagram' | 'facebook' | 'threads' | 'tiktok' | 'youtube'
): Promise<void> {
  // Only instagram/tiktok/youtube have sync edge functions. Facebook and Threads
  // sync from their dedicated pages; calling this for them is a no-op.
  const syncablePlatforms = ['instagram', 'tiktok', 'youtube'] as const;
  if (!syncablePlatforms.includes(platform as typeof syncablePlatforms[number])) {
    return;
  }

  // invoke() sends the current user's session JWT in the Authorization header,
  // which the edge function verifies to derive userId. No tokens are sent
  // from the client — the edge function fetches them from the DB itself.
  const { error } = await supabase.functions.invoke(`${platform}-sync`);
  if (error) {
    throw new Error(error.message || `Failed to sync ${platform}`);
  }
}
