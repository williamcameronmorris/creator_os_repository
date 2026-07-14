import { supabase } from './supabase';

/**
 * Watch feature data access.
 *
 * suggested_creators + suggested_creator_videos are shared niche-level data
 * (populated by a discovery job, cached so every user in a niche shares one
 * pull). tracked_creators is per-user pins. See migration
 * 20260702120000_watch_feature_tables.sql.
 */

export interface SuggestedCreator {
  id: string;
  platform: string;
  channel_id: string;
  handle: string | null;
  title: string;
  subscriber_count: number | null;
  avg_views: number | null;
  rank: number;
}

export interface WatchVideo {
  id: string;
  suggested_creator_id: string;
  platform: string;
  video_id: string;
  title: string;
  thumbnail_url: string | null;
  view_count: number | null;
  published_at: string | null;
  is_top: boolean;
  packaging_percentile: number | null;
  creatorTitle: string | null;
  channelId: string | null;
  creator_avg_views: number | null;
  creator_subscriber_count: number | null;
}

// Fallback niche if the user hasn't set one and resolution fails.
export const WATCH_NICHE = 'guitar';

export interface EnsureNicheResult {
  niche: string | null;
  ready: boolean;
  needsNiche?: boolean;
}

/**
 * Resolve the user's Watch niche and guarantee it has discovered creators —
 * running discovery on demand the first time a niche is seen. May take a
 * while on a cold niche while discovery runs.
 *
 * Pass the active account's PFM id to resolve the niche PER ACCOUNT
 * (user_content_profiles.niche for that account → profiles.niche_preference
 * fallback). Omit for the legacy user-level resolution.
 */
export async function ensureWatchNiche(socialAccountId?: string | null): Promise<EnsureNicheResult> {
  const { data, error } = await supabase.functions.invoke('watch-ensure-niche', {
    body: socialAccountId ? { socialAccountId } : {},
  });
  if (error) throw error;
  return (data || { niche: null, ready: false }) as EnsureNicheResult;
}

export async function getSuggestedCreators(
  platform: string,
  niche: string = WATCH_NICHE,
): Promise<SuggestedCreator[]> {
  const { data, error } = await supabase
    .from('suggested_creators')
    .select('id, platform, channel_id, handle, title, subscriber_count, avg_views, rank')
    .eq('platform', platform)
    .eq('niche', niche)
    .order('rank', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getWatchFeed(
  platform: string,
  niche: string = WATCH_NICHE,
): Promise<WatchVideo[]> {
  const creators = await getSuggestedCreators(platform, niche);
  if (creators.length === 0) return [];
  const byId = new Map(creators.map((c) => [c.id, c]));

  const { data, error } = await supabase
    .from('suggested_creator_videos')
    .select('id, suggested_creator_id, platform, video_id, title, thumbnail_url, view_count, published_at, is_top, packaging_percentile')
    .in('suggested_creator_id', [...byId.keys()])
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) throw error;

  return (data || []).map((r) => {
    const c = byId.get(r.suggested_creator_id);
    return {
      ...r,
      creatorTitle: c?.title ?? null,
      channelId: c?.channel_id ?? null,
      creator_avg_views: c?.avg_views ?? null,
      creator_subscriber_count: c?.subscriber_count ?? null,
    };
  }) as WatchVideo[];
}

export async function getCreator(id: string): Promise<SuggestedCreator | null> {
  const { data, error } = await supabase
    .from('suggested_creators')
    .select('id, platform, channel_id, handle, title, subscriber_count, avg_views, rank')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getCreatorVideos(creatorId: string): Promise<WatchVideo[]> {
  const { data, error } = await supabase
    .from('suggested_creator_videos')
    .select('id, suggested_creator_id, platform, video_id, title, thumbnail_url, view_count, published_at, is_top, packaging_percentile')
    .eq('suggested_creator_id', creatorId)
    .order('view_count', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data || []).map((r) => ({
    ...r,
    creatorTitle: null,
    channelId: null,
    creator_avg_views: null,
    creator_subscriber_count: null,
  })) as WatchVideo[];
}

export async function getTrackedChannelIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('tracked_creators').select('channel_id');
  if (error) throw error;
  return new Set((data || []).map((r) => r.channel_id as string));
}

export async function trackCreator(c: SuggestedCreator): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('You must be signed in to follow a creator.');
  const { error } = await supabase.from('tracked_creators').insert({
    user_id: user.id,
    platform: c.platform,
    channel_id: c.channel_id,
    title: c.title,
    handle: c.handle,
  });
  // Ignore unique-violation (already tracked); surface anything else.
  if (error && error.code !== '23505') throw error;
}

export async function untrackCreator(channelId: string): Promise<void> {
  // RLS scopes the delete to the caller's own rows.
  const { error } = await supabase.from('tracked_creators').delete().eq('channel_id', channelId);
  if (error) throw error;
}

export interface MyPost {
  id: string;
  caption: string | null;
  media_type: string | null;
  thumbnail_url: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  published_at: string | null;
}

/** The signed-in user's own published Instagram posts, newest first. */
export async function getMyInstagramPosts(): Promise<MyPost[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('content_posts')
    .select('id, caption, media_type, thumbnail_url, views, likes, comments, published_at, published_date')
    .eq('user_id', user.id)
    .eq('platform', 'instagram')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(40);
  if (error) throw error;
  return (data || []).map((r) => ({
    id: r.id,
    caption: r.caption,
    media_type: r.media_type,
    thumbnail_url: r.thumbnail_url,
    views: r.views,
    likes: r.likes,
    comments: r.comments,
    published_at: r.published_at || r.published_date,
  }));
}

/** Query string that hands a watched video to Studio scripting as a "make my
 * version" seed. The topic is a directive so the generator writes the creator's
 * OWN version of the proven piece — which, with the Voice feature, comes out in
 * their voice. (reasoning is UI-only; the model reads the topic + hook.) */
export function clioParams(v: WatchVideo): string {
  const creator = v.creatorTitle ?? 'a top creator';
  const views = v.view_count ? ` (${formatCount(v.view_count)} views)` : '';
  return new URLSearchParams({
    autostart: '1',
    idea: `Make my own version of this proven short: "${v.title}"`,
    platform: 'youtube',
    type: 'short',
    hook: v.title,
    reasoning: `Your take on ${creator}'s top-performing short${views} — written in your voice.`,
  }).toString();
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}
