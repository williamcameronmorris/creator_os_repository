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
  creatorTitle: string | null;
  channelId: string | null;
}

// Page 1 ships YouTube for a single seeded niche. Deriving the niche per user
// from profiles.niche_preference (and running discovery per niche) is the next
// increment.
export const WATCH_NICHE = 'guitar';

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
    .select('id, suggested_creator_id, platform, video_id, title, thumbnail_url, view_count, published_at, is_top')
    .in('suggested_creator_id', [...byId.keys()])
    .order('view_count', { ascending: false, nullsFirst: false })
    .limit(30);
  if (error) throw error;

  return (data || []).map((r) => ({
    ...r,
    creatorTitle: byId.get(r.suggested_creator_id)?.title ?? null,
    channelId: byId.get(r.suggested_creator_id)?.channel_id ?? null,
  })) as WatchVideo[];
}

export function formatCount(n: number | null | undefined): string {
  if (n == null) return '';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return Math.round(n / 1_000) + 'K';
  return String(n);
}
