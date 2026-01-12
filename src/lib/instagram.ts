import { supabase } from './supabase';

const INSTAGRAM_APP_ID = import.meta.env.VITE_INSTAGRAM_APP_ID || '';
const INSTAGRAM_REDIRECT_URI = import.meta.env.VITE_INSTAGRAM_REDIRECT_URI || window.location.origin + '/instagram/callback';

export interface InstagramMedia {
  id: string;
  caption: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_url: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

export interface InstagramInsights {
  impressions: number;
  reach: number;
  engagement: number;
  saved: number;
  video_views?: number;
}

export interface InstagramProfile {
  id: string;
  username: string;
  account_type: string;
  media_count: number;
  followers_count: number;
  follows_count: number;
}

export function getInstagramAuthUrl(): string {
  const scope = 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement';
  return `https://www.facebook.com/v18.0/dialog/oauth?client_id=${INSTAGRAM_APP_ID}&redirect_uri=${encodeURIComponent(INSTAGRAM_REDIRECT_URI)}&scope=${scope}&response_type=code`;
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-auth`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ code, redirect_uri: INSTAGRAM_REDIRECT_URI }),
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  const data = await response.json();
  return data.access_token;
}

export async function getInstagramProfile(accessToken: string): Promise<InstagramProfile> {
  const response = await fetch(`https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${accessToken}`);

  if (!response.ok) {
    throw new Error('Failed to fetch Instagram profile');
  }

  return response.json();
}

export async function getInstagramMedia(accessToken: string, limit = 25): Promise<InstagramMedia[]> {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
  const response = await fetch(`https://graph.instagram.com/me/media?fields=${fields}&limit=${limit}&access_token=${accessToken}`);

  if (!response.ok) {
    throw new Error('Failed to fetch Instagram media');
  }

  const data = await response.json();
  return data.data || [];
}

export async function getMediaInsights(mediaId: string, accessToken: string): Promise<InstagramInsights> {
  const metrics = 'impressions,reach,engagement,saved';
  const response = await fetch(`https://graph.instagram.com/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`);

  if (!response.ok) {
    throw new Error('Failed to fetch media insights');
  }

  const data = await response.json();
  const insights: any = {};

  data.data?.forEach((item: any) => {
    insights[item.name] = item.values[0]?.value || 0;
  });

  return insights;
}

export async function publishToInstagram(imageUrl: string, caption: string, accessToken: string): Promise<string> {
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to publish to Instagram');
  }

  const data = await response.json();
  return data.id;
}

export async function saveInstagramToken(userId: string, accessToken: string, instagramUserId: string) {
  const { error } = await supabase
    .from('profiles')
    .update({
      instagram_access_token: accessToken,
      instagram_user_id: instagramUserId,
    })
    .eq('id', userId);

  if (error) throw error;
}

export async function syncInstagramData(userId: string) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('instagram_access_token')
    .eq('id', userId)
    .maybeSingle();

  if (!profile?.instagram_access_token) {
    throw new Error('Instagram not connected');
  }

  const [instagramProfile, media] = await Promise.all([
    getInstagramProfile(profile.instagram_access_token),
    getInstagramMedia(profile.instagram_access_token, 50),
  ]);

  await supabase
    .from('profiles')
    .update({
      instagram_handle: instagramProfile.username,
      instagram_followers: instagramProfile.media_count,
    })
    .eq('id', userId);

  for (const item of media) {
    const existingPost = await supabase
      .from('content_posts')
      .select('id')
      .eq('instagram_post_id', item.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!existingPost.data) {
      await supabase.from('content_posts').insert({
        user_id: userId,
        platform: 'instagram',
        caption: item.caption || '',
        media_url: item.media_url,
        media_type: item.media_type === 'CAROUSEL_ALBUM' ? 'carousel' : item.media_type.toLowerCase(),
        instagram_post_id: item.id,
        published_date: item.timestamp,
        status: 'published',
        likes: item.like_count || 0,
        comments: item.comments_count || 0,
      });
    }
  }

  return { profile: instagramProfile, mediaCount: media.length };
}
