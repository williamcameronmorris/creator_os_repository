import { supabase } from './supabase';

export interface PlatformStatus {
  platform: 'instagram' | 'tiktok' | 'youtube';
  connected: boolean;
  username?: string;
  followers?: number;
  lastSynced?: string;
}

export async function getPlatformStatus(userId: string): Promise<PlatformStatus[]> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_handle, instagram_followers, instagram_access_token, last_instagram_sync, tiktok_handle, tiktok_followers, tiktok_access_token, last_tiktok_sync, youtube_handle, youtube_followers, youtube_access_token, last_youtube_sync')
    .eq('id', userId)
    .maybeSingle();

  if (!profile) {
    return [
      { platform: 'instagram', connected: false },
      { platform: 'tiktok', connected: false },
      { platform: 'youtube', connected: false },
    ];
  }

  return [
    {
      platform: 'instagram',
      connected: !!profile.instagram_access_token,
      username: profile.instagram_handle || undefined,
      followers: profile.instagram_followers || undefined,
      lastSynced: profile.last_instagram_sync || undefined,
    },
    {
      platform: 'tiktok',
      connected: !!profile.tiktok_access_token,
      username: profile.tiktok_handle || undefined,
      followers: profile.tiktok_followers || undefined,
      lastSynced: profile.last_tiktok_sync || undefined,
    },
    {
      platform: 'youtube',
      connected: !!profile.youtube_access_token,
      username: profile.youtube_handle || undefined,
      followers: profile.youtube_followers || undefined,
      lastSynced: profile.last_youtube_sync || undefined,
    },
  ];
}

export function getInstagramAuthUrl(): string {
  const appId = import.meta.env.VITE_INSTAGRAM_APP_ID || '';
  const redirectUri = import.meta.env.VITE_INSTAGRAM_REDIRECT_URI || `${window.location.origin}/settings?platform=instagram`;
  const scope = 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement';
  return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&response_type=code`;
}

export function getTikTokAuthUrl(): string {
  const clientKey = import.meta.env.VITE_TIKTOK_CLIENT_KEY || '';
  const redirectUri = import.meta.env.VITE_TIKTOK_REDIRECT_URI || `${window.location.origin}/settings?platform=tiktok`;
  const scope = 'user.info.basic,video.list,video.upload';
  return `https://www.tiktok.com/v2/auth/authorize?client_key=${clientKey}&scope=${scope}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}`;
}

export function getYouTubeAuthUrl(): string {
  const clientId = import.meta.env.VITE_YOUTUBE_CLIENT_ID || '';
  const redirectUri = import.meta.env.VITE_YOUTUBE_REDIRECT_URI || `${window.location.origin}/settings?platform=youtube`;
  const scope = 'https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.upload';
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline`;
}

export async function disconnectPlatform(userId: string, platform: 'instagram' | 'tiktok' | 'youtube'): Promise<void> {
  const updates: Record<string, any> = {};

  switch (platform) {
    case 'instagram':
      updates.instagram_access_token = '';
      updates.instagram_user_id = '';
      break;
    case 'tiktok':
      updates.tiktok_access_token = '';
      updates.tiktok_user_id = '';
      break;
    case 'youtube':
      updates.youtube_access_token = '';
      updates.youtube_channel_id = '';
      break;
  }

  await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId);

  await supabase
    .from('platform_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('platform', platform);
}

export async function syncPlatform(userId: string, platform: 'instagram' | 'tiktok' | 'youtube'): Promise<void> {
  const { data: profile } = await supabase
    .from('profiles')
    .select(`${platform}_access_token`)
    .eq('id', userId)
    .maybeSingle();

  const accessToken = profile?.[`${platform}_access_token`];
  if (!accessToken) {
    throw new Error(`${platform} not connected`);
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${platform}-sync`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ userId, accessToken }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `Failed to sync ${platform}`);
  }
}
