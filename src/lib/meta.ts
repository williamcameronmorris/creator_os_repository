/**
 * meta.ts
 *
 * Comprehensive Meta Graph API library covering:
 *   - OAuth URL generation (Facebook Login → Pages, Instagram Business, Messenger)
 *   - Threads OAuth URL generation (separate flow)
 *   - Facebook Page management and analytics
 *   - Instagram Business Account (publishing, insights, comments, DMs)
 *   - Threads (posts, publishing, replies, insights)
 *   - Facebook Messenger (conversations, messages)
 *   - Token storage helpers
 *
 * Architecture:
 *   - App ID lives in VITE_META_APP_ID (safe for frontend)
 *   - App Secret lives ONLY in Supabase Edge Function secrets (never in frontend)
 *   - Token exchange happens via the meta-auth / threads-auth edge functions
 */

import { supabase } from './supabase';

const META_APP_ID = import.meta.env.VITE_META_APP_ID || '';
const THREADS_APP_ID = import.meta.env.VITE_THREADS_APP_ID || META_APP_ID;
const META_REDIRECT_URI =
  import.meta.env.VITE_META_REDIRECT_URI || `${windw.location.origin}/auth/meta/callback`;
const THREADS_REDIRECT_URI =
  import.meta.env.VITE_THREADS_REDIRECT_URI || `${window.location.origin}/auth/threads/callback`;

const GRAPH_API = 'https://graph.facebook.com/v25.0';
const THREADS_API = 'https://graph.threads.net/v1.0';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface MetaPage {
  id: string;
  name: string;
  fanCount: number;
  instagramBusinessAccountId: string | null;
  instagramUsername: string | null;
  instagramFollowers: number;
}

export interface MetaAuthResult {
  success: boolean;
  metaUserId: string;
  metaUserName: string;
  tokenExpiresAt: string;
  pages: MetaPage[];
  primaryPage: { id: string; name: string; fanCount: number } | null;
}

export interface FacebookPageInsights {
  impressions: number;
  reach: number;
  engagedUsers: number;
  pageFanAdds: number;
  pageViews: number;
}

export interface FacebookPost {
  id: string;
  message?: string;
  story?: string;
  created_time: string;
  full_picture?: string;
  permalink_url?: string;
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
  shares?: { count: number };
}

export interface InstagramBusinessMedia {
  id: string;
  caption?: string;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
  like_count?: number;
  comments_count?: number;
}

export interface InstagramInsights {
  impressions: number;
  reach: number;
  engagement?: number;
  saved?: number;
  video_views?: number;
  profile_visits?: number;
  website_clicks?: number;
}

export interface InstagramComment {
  id: string;
  text: string;
  timestamp: string;
  username?: string;
  from?: { id: string; username: string };
  replies?: InstagramComment[];
}

export interface MessengerConversation {
  id: string;
  updated_time: string;
  participants?: { data: Array<{ id: string; name: string; email?: string }> };
  messages?: {
    data: Array<{
      id: string;
      message: string;
      created_time: string;
      from: { id: string; name: string };
    }>;
  };
}

export interface InstagramDMConversation {
  id: string;
  updated_time: string;
  messages?: {
    data: Array<{
      id: string;
      text: string;
      created_time: string;
      from: { username: string; id: string };
    }>;
  };
}

export interface ThreadsPost {
  id: string;
  text?: string;
  media_type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL';
  media_url?: string;
  permalink?: string;
  timestamp: string;
  like_count?: number;
  replies_count?: number;
  reposts_count?: number;
  quotes_count?: number;
}

export interface ThreadsInsights {
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAUTH URL GENERATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate the Facebook Login URL for the unified Meta connection.
 * Covers: Facebook Pages, Instagram Business, Messenger.
 */
export function getMetaAuthUrl(): string {
  if (!META_APP_ID) throw new Error('VITE_META_APP_ID is not set in your .env file');

  const scopes = [
    // Facebook Pages
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'pages_manage_metadata',
    'pages_read_user_content',
    'pages_manage_engagement',
    // Instagram Business
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
    'instagram_manage_comments',
    'instagram_manage_messages',
  ].join(',');

  const params = new URLSearchParams({
    client_id: META_APP_ID,
    redirect_uri: META_REDIRECT_URI,
    scope: scopes,
    response_type: 'code',
  });

  return `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`;
}

/**
 * Generate the Threads OAuth authorization URL.
 * Note: Threads has a SEPARATE OAuth flow from Facebook Login.
 */
export function getThreadsAuthUrl(): string {
  const threadsId = THREADS_APP_ID || META_APP_ID;
  if (!threadsId) throw new Error('VITE_THREADS_APP_ID (or VITE_META_APP_ID) is not set in your .env file');

  const scopes = [
    'threads_basic',
    'threads_content_publish',
    'threads_manage_replies',
    'threads_read_replies',
    'threads_manage_insights',
  ].join(',');

  const params = new URLSearchParams({
    client_id: threadsId,
    redirect_uri: THREADS_REDIRECT_URI,
    scope: scopes,
    response_type: 'code',
  });

  return `https://threads.net/oauth/authorize?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN EXCHANGE (calls Supabase Edge Functions)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exchange the OAuth authorization code for Meta tokens.
 * Calls the meta-auth edge function which securely uses the App Secret.
 */
export async function exchangeMetaCode(
  code: string,
  userId: string
): Promise<MetaAuthResult> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/meta-auth`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code, redirect_uri: META_REDIRECT_URI, userId }),
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Meta OAuth exchange failed');
  }

  return data as MetaAuthResult;
}

/**
 * Exchange the Threads authorization code for Threads tokens.
 * Calls the threads-auth edge function.
 */
export async function exchangeThreadsCode(
  code: string,
  userId: string
): Promise<{ success: boolean; threadsHandle: string; threadsFollowers: number }> {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/threads-auth`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code, redirect_uri: THREADS_REDIRECT_URI, userId }),
    }
  );

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || 'Threads OAuth exchange failed');
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// FACEBOOK PAGE FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch page insights for a date range.
 * @param pageId - Facebook Page ID
 * @param pageAccessToken - Page-level access token
 * @param since - Unix timestamp or YYYY-MM-DD
 * @param until - Unix timestamp or YYYY-MM-DD
 */
export async function getFacebookPageInsights(
  pageId: string,
  pageAccessToken: string,
  since?: string,
  until?: string
): Promise<FacebookPageInsights> {
  const metrics = [
    'page_impressions',
    'page_reach',
    'page_engaged_users',
    'page_fan_adds',
    'page_views_total',
  ].join(',');

  const params = new URLSearchParams({
    metric: metrics,
    period: 'day',
    access_token: pageAccessToken,
  });
  if (since) params.set('since', since);
  if (until) params.set('until', until);

  const res = await fetch(`${GRAPH_API}/${pageId}/insights?${params.toString()}`);
  const data = await res.json();

  if (data.error) throw new Error(`Page insights error: ${data.error.message}`);

  const insights: Record<string, number> = {};
  (data.data || []).forEach((metric: any) => {
    const total = (metric.values || []).reduce(
      (sum: number, v: any) => sum + (v.value || 0),
      0
    );
    insights[metric.name] = total;
  });

  return {
    impressions: insights['page_impressions'] || 0,
    reach: insights['page_reach'] || 0,
    engagedUsers: insights['page_engaged_users'] || 0,
    pageFanAdds: insights['page_fan_adds'] || 0,
    pageViews: insights['page_views_total'] || 0,
  };
}

/**
 * Fetch recent posts from a Facebook Page.
 */
export async function getFacebookPagePosts(
  pageId: string,
  pageAccessToken: string,
  limit = 25
): Promise<FacebookPost[]> {
  const fields = 'id,message,story,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares';
  const res = await fetch(
    `${GRAPH_API}/${pageId}/posts?fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`Facebook posts error: ${data.error.message}`);
  return data.data || [];
}

/**
 * Publish a post to a Facebook Page.
 */
export async function publishToFacebookPage(
  pageId: string,
  pageAccessToken: string,
  options: {
    message?: string;
    link?: string;
    imageUrl?: string;
    scheduledTime?: number; // Unix timestamp for scheduled publishing
  }
): Promise<string> {
  const body: Record<string, string | number> = {};

  if (options.message) body.message = options.message;
  if (options.link) body.link = options.link;
  if (options.scheduledTime) {
    body.scheduled_publish_time = options.scheduledTime;
    body.published = 0;
  }

  const endpoint = options.imageUrl
    ? `${GRAPH_API}/${pageId}/photos`
    : `${GRAPH_API}/${pageId}/feed`;

  if (options.imageUrl) body.url = options.imageUrl;
  body.access_token = pageAccessToken;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (data.error) throw new Error(`Facebook publish error: ${data.error.message}`);
  return data.id;
}

/**
 * Reply to a Facebook Page comment.
 */
export async function replyToFacebookComment(
  commentId: string,
  message: string,
  pageAccessToken: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${commentId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });
  const data = await res.json();

  if (data.error) throw new Error(`Comment reply error: ${data.error.message}`);
  return data.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTAGRAM BUSINESS ACCOUNT FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get Instagram Business Account profile.
 * Uses the page access token and the IG Business Account ID.
 */
export async function getInstagramBusinessProfile(
  igBusinessAccountId: string,
  pageAccessToken: string
): Promise<{
  id: string;
  username: string;
  name: string;
  biography?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url?: string;
  website?: string;
}> {
  const fields = 'id,username,name,biography,followers_count,follows_count,media_count,profile_picture_url,website';
  const res = await fetch(
    `${GRAPH_API}/${igBusinessAccountId}?fields=${fields}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`IG Business profile error: ${data.error.message}`);
  return data;
}

/**
 * Get recent Instagram Business media.
 */
export async function getInstagramBusinessMedia(
  igBusinessAccountId: string,
  pageAccessToken: string,
  limit = 25
): Promise<InstagramBusinessMedia[]> {
  const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
  const res = await fetch(
    `${GRAPH_API}/${igBusinessAccountId}/media?fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`IG Business media error: ${data.error.message}`);
  return data.data || [];
}

/**
 * Get Instagram Business Account insights (account-level).
 */
export async function getInstagramAccountInsights(
  igBusinessAccountId: string,
  pageAccessToken: string,
  period: 'day' | 'week' | 'month' = 'day',
  since?: string,
  until?: string
): Promise<InstagramInsights> {
  const metrics = [
    'impressions',
    'reach',
    'profile_views',
    'website_clicks',
  ].join(',');

  const params = new URLSearchParams({
    metric: metrics,
    period,
    access_token: pageAccessToken,
  });
  if (since) params.set('since', since);
  if (until) params.set('until', until);

  const res = await fetch(
    `${GRAPH_API}/${igBusinessAccountId}/insights?${params.toString()}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`IG insights error: ${data.error.message}`);

  const result: Record<string, number> = {};
  (data.data || []).forEach((m: any) => {
    result[m.name] = (m.values || []).reduce(
      (sum: number, v: any) => sum + (v.value || 0),
      0
    );
  });

  return {
    impressions: result['impressions'] || 0,
    reach: result['reach'] || 0,
    profile_visits: result['profile_views'] || 0,
    website_clicks: result['website_clicks'] || 0,
  };
}

/**
 * Get insights for a specific Instagram media post.
 */
export async function getInstagramMediaInsights(
  mediaId: string,
  pageAccessToken: string
): Promise<InstagramInsights> {
  const metrics = 'impressions,reach,engagement,saved,video_views';
  const res = await fetch(
    `${GRAPH_API}/${mediaId}/insights?metric=${metrics}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`IG media insights error: ${data.error.message}`);

  const result: Record<string, number> = {};
  (data.data || []).forEach((m: any) => {
    result[m.name] = m.values?.[0]?.value || 0;
  });

  return {
    impressions: result['impressions'] || 0,
    reach: result['reach'] || 0,
    engagement: result['engagement'] || 0,
    saved: result['saved'] || 0,
    video_views: result['video_views'] || 0,
  };
}

/**
 * Publish a single image or video to Instagram Business.
 * Step 1: Create a media container. Step 2: Publish the container.
 */
export async function publishToInstagramBusiness(
  igBusinessAccountId: string,
  pageAccessToken: string,
  options: {
    imageUrl?: string;
    videoUrl?: string;
    caption?: string;
    mediaType?: 'IMAGE' | 'VIDEO' | 'REELS';
  }
): Promise<string> {
  const containerBody: Record<string, string> = {
    access_token: pageAccessToken,
  };

  if (options.caption) containerBody.caption = options.caption;

  if (options.mediaType === 'REELS' && options.videoUrl) {
    containerBody.media_type = 'REELS';
    containerBody.video_url = options.videoUrl;
  } else if (options.videoUrl) {
    containerBody.media_type = 'VIDEO';
    containerBody.video_url = options.videoUrl;
  } else if (options.imageUrl) {
    containerBody.image_url = options.imageUrl;
  } else {
    throw new Error('Either imageUrl or videoUrl is required');
  }

  // Step 1: Create container
  const containerRes = await fetch(`${GRAPH_API}/${igBusinessAccountId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });
  const containerData = await containerRes.json();

  if (containerData.error) {
    throw new Error(`IG container creation error: ${containerData.error.message}`);
  }

  const containerId: string = containerData.id;

  // Step 2: Publish the container
  const publishRes = await fetch(`${GRAPH_API}/${igBusinessAccountId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: containerId, access_token: pageAccessToken }),
  });
  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error(`IG publish error: ${publishData.error.message}`);
  }

  return publishData.id;
}

/**
 * Get comments on an Instagram Business media post.
 */
export async function getInstagramMediaComments(
  mediaId: string,
  pageAccessToken: string
): Promise<InstagramComment[]> {
  const fields = 'id,text,timestamp,username,from,replies{id,text,timestamp,username}';
  const res = await fetch(
    `${GRAPH_API}/${mediaId}/comments?fields=${fields}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`IG comments error: ${data.error.message}`);
  return data.data || [];
}

/**
 * Reply to an Instagram Business comment.
 */
export async function replyToInstagramComment(
  mediaId: string,
  message: string,
  pageAccessToken: string,
  replyToCommentId?: string
): Promise<string> {
  const body: Record<string, string> = {
    message,
    access_token: pageAccessToken,
  };
  if (replyToCommentId) body.reply_to_id = replyToCommentId;

  const res = await fetch(`${GRAPH_API}/${mediaId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();

  if (data.error) throw new Error(`IG comment reply error: ${data.error.message}`);
  return data.id;
}

/**
 * Get Instagram Business DM conversations (Instagram Messaging).
 */
export async function getInstagramDMConversations(
  igBusinessAccountId: string,
  pageAccessToken: string,
  limit = 20
): Promise<InstagramDMConversation[]> {
  const fields = 'id,updated_time,messages{id,text,created_time,from}';
  const res = await fetch(
    `${GRAPH_API}/${igBusinessAccountId}/conversations?platform=instagram&fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`IG DM conversations error: ${data.error.message}`);
  return data.data || [];
}

/**
 * Send a message in an Instagram DM conversation.
 */
export async function sendInstagramDM(
  igBusinessAccountId: string,
  recipientId: string,
  message: string,
  pageAccessToken: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${igBusinessAccountId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: message },
      access_token: pageAccessToken,
    }),
  });
  const data = await res.json();

  if (data.error) throw new Error(`IG DM send error: ${data.error.message}`);
  return data.message_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// FACEBOOK MESSENGER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get Messenger conversations for a Facebook Page.
 */
export async function getMessengerConversations(
  pageId: string,
  pageAccessToken: string,
  limit = 20
): Promise<MessengerConversation[]> {
  const fields = 'id,updated_time,participants,messages{id,message,created_time,from}';
  const res = await fetch(
    `${GRAPH_API}/${pageId}/conversations?fields=${fields}&limit=${limit}&access_token=${pageAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`Messenger conversations error: ${data.error.message}`);
  return data.data || [];
}

/**
 * Send a Messenger message from a Facebook Page to a user.
 */
export async function sendMessengerMessage(
  pageId: string,
  recipientId: string,
  messageText: string,
  pageAccessToken: string
): Promise<string> {
  const res = await fetch(`${GRAPH_API}/${pageId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text: messageText },
      access_token: pageAccessToken,
    }),
  });
  const data = await res.json();

  if (data.error) throw new Error(`Messenger send error: ${data.error.message}`);
  return data.message_id;
}

// ─────────────────────────────────────────────────────────────────────────────
// THREADS FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get Threads user profile.
 */
export async function getThreadsProfile(
  threadsAccessToken: string
): Promise<{
  id: string;
  username: string;
  name?: string;
  biography?: string;
  followers_count: number;
  threads_profile_picture_url?: string;
}> {
  const fields = 'id,username,name,biography,followers_count,threads_profile_picture_url';
  const res = await fetch(
    `${THREADS_API}/me?fields=${fields}&access_token=${threadsAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`Threads profile error: ${data.error.message}`);
  return data;
}

/**
 * Get recent Threads posts.
 */
export async function getThreadsPosts(
  threadsUserId: string,
  threadsAccessToken: string,
  limit = 25
): Promise<ThreadsPost[]> {
  const fields = 'id,text,media_type,media_url,permalink,timestamp,like_count,replies_count,reposts_count,quotes_count';
  const res = await fetch(
    `${THREADS_API}/${threadsUserId}/threads?fields=${fields}&limit=${limit}&access_token=${threadsAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`Threads posts error: ${data.error.message}`);
  return data.data || [];
}

/**
 * Publish a Threads post.
 * Step 1: Create a container. Step 2: Publish it.
 */
export async function publishToThreads(
  threadsUserId: string,
  threadsAccessToken: string,
  options: {
    text?: string;
    imageUrl?: string;
    videoUrl?: string;
    mediaType?: 'TEXT' | 'IMAGE' | 'VIDEO';
  }
): Promise<string> {
  const containerBody: Record<string, string> = {
    access_token: threadsAccessToken,
  };

  const mediaType = options.mediaType || (options.imageUrl ? 'IMAGE' : options.videoUrl ? 'VIDEO' : 'TEXT');
  containerBody.media_type = mediaType;

  if (options.text) containerBody.text = options.text;
  if (options.imageUrl) containerBody.image_url = options.imageUrl;
  if (options.videoUrl) containerBody.video_url = options.videoUrl;

  // Step 1: Create container
  const containerRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(containerBody),
  });
  const containerData = await containerRes.json();

  if (containerData.error) {
    throw new Error(`Threads container error: ${containerData.error.message}`);
  }

  // Step 2: Publish
  const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerData.id,
      access_token: threadsAccessToken,
    }),
  });
  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error(`Threads publish error: ${publishData.error.message}`);
  }

  return publishData.id;
}

/**
 * Get insights for a specific Threads post.
 */
export async function getThreadsPostInsights(
  postId: string,
  threadsAccessToken: string
): Promise<ThreadsInsights> {
  const metrics = 'views,likes,replies,reposts,quotes';
  const res = await fetch(
    `${THREADS_API}/${postId}/insights?metric=${metrics}&access_token=${threadsAccessToken}`
  );
  const data = await res.json();

  if (data.error) throw new Error(`Threads insights error: ${data.error.message}`);

  const result: Record<string, number> = {};
  (data.data || []).forEach((m: any) => {
    result[m.name] = m.values?.[0]?.value || 0;
  });

  return {
    views: result['views'] || 0,
    likes: result['likes'] || 0,
    replies: result['replies'] || 0,
    reposts: result['reposts'] || 0,
    quotes: result['quotes'] || 0,
  };
}

/**
 * Reply to a Threads post.
 */
export async function replyToThreadsPost(
  threadsUserId: string,
  threadsAccessToken: string,
  replyToId: string,
  text: string
): Promise<string> {
  // Step 1: Create reply container
  const containerRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'TEXT',
      text,
      reply_to_id: replyToId,
      access_token: threadsAccessToken,
    }),
  });
  const containerData = await containerRes.json();

  if (containerData.error) {
    throw new Error(`Threads reply container error: ${containerData.error.message}`);
  }

  // Step 2: Publish reply
  const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerData.id,
      access_token: threadsAccessToken,
    }),
  });
  const publishData = await publishRes.json();

  if (publishData.error) {
    throw new Error(`Threads reply publish error: ${publishData.error.message}`);
  }

  return publishData.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN & PROFILE STORAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Disconnect Meta (Facebook/Instagram Business) — clear all Meta fields.
 */
export async function disconnectMeta(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      meta_user_id: '',
      meta_access_token: '',
      meta_token_expires_at: null,
      facebook_page_id: '',
      facebook_page_access_token: '',
      facebook_page_name: '',
      facebook_page_followers: 0,
      instagram_business_account_id: '',
      last_facebook_sync: null,
      last_instagram_sync: null,
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Disconnect Threads — clear all Threads fields.
 */
export async function disconnectThreads(userId: string): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      threads_user_id: '',
      threads_access_token: '',
      threads_token_expires_at: null,
      threads_handle: '',
      threads_followers: 0,
      last_threads_sync: null,
    })
    .eq('id', userId);

  if (error) throw error;
}

/**
 * Load the user's stored Meta credentials from Supabase.
 */
export async function loadMetaCredentials(userId: string): Promise<{
  metaUserId: string;
  metaAccessToken: string;
  facebookPageId: string;
  facebookPageAccessToken: string;
  facebookPageName: string;
  facebookPageFollowers: number;
  instagramBusinessAccountId: string;
  threadsUserId: string;
  threadsAccessToken: string;
  threadsHandle: string;
  threadsFollowers: number;
} | null> {
  const { data } = await supabase
    .from('profiles')
    .select(
      'meta_user_id,meta_access_token,facebook_page_id,facebook_page_access_token,facebook_page_name,facebook_page_followers,instagram_business_account_id,threads_user_id,threads_access_token,threads_handle,threads_followers'
    )
    .eq('id', userId)
    .maybeSingle();

  if (!data) return null;

  return {
    metaUserId: data.meta_user_id || '',
    metaAccessToken: data.meta_access_token || '',
    facebookPageId: data.facebook_page_id || '',
    facebookPageAccessToken: data.facebook_page_access_token || '',
    facebookPageName: data.facebook_page_name || '',
    facebookPageFollowers: data.facebook_page_followers || 0,
    instagramBusinessAccountId: data.instagram_business_account_id || '',
    threadsUserId: data.threads_user_id || '',
    threadsAccessToken: data.threads_access_token || '',
    threadsHandle: data.threads_handle || '',
    threadsFollowers: data.threads_followers || 0,
  };
}

/** Returns the Meta OAuth redirect URI being used (useful for Meta dashboard setup). */
export function getMetaRedirectUri(): string {
  return META_REDIRECT_URI;
}

/** Returns the Threads OAuth redirect URI being used. */
export function getThreadsRedirectUri(): string {
  return THREADS_REDIRECT_URI;
}
