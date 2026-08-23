import { supabase } from './supabase';

/**
 * Reads the `post_performance` view, which scores each post against the
 * creator's OWN trailing median for the same (platform, media_type).
 *
 * The view only includes posts postforme-sync refreshed in the last 7 days.
 * That deliberately excludes legacy rows whose metrics used an incompatible
 * definition (the old youtube-sync stored 90-day windowed views, not lifetime),
 * which would otherwise drag every median down and make good posts look bad.
 *
 * Multiples are NULL, not 1 and not 0, whenever `baseline_n < 8`. Null means
 * "not enough history to judge" and must render differently from "average".
 * Printing a confident-looking multiple off three prior posts is exactly the
 * kind of thing that makes a creator stop trusting their own dashboard.
 */

export interface PostPerformance {
  id: string;
  platform: string;
  media_type: string | null;
  lane_id: string | null;
  lane_slug: string | null;
  lane_name: string | null;
  winning_looks_like: string | null;
  published_at: string;
  thumbnail_url: string | null;
  title: string | null;
  caption: string | null;
  platform_post_id: string | null;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  engagement_rate: number;
  baseline_n: number;
  med_views: number | null;
  med_saves: number | null;
  med_reach: number | null;
  med_er: number | null;
  views_multiple: number | null;
  saves_multiple: number | null;
  reach_multiple: number | null;
  er_multiple: number | null;
  outlier_metric: string | null;
}

export interface LaneStat {
  lane_id: string;
  lane_name: string;
  winning_looks_like: string | null;
  posts: number;
  medViews: number;
  medSaves: number;
  medEr: number;
}

const SELECT =
  'id, platform, media_type, lane_id, lane_slug, lane_name, winning_looks_like, ' +
  'published_at, thumbnail_url, title, caption, platform_post_id, ' +
  'views, likes, comments, saves, shares, reach, engagement_rate, ' +
  'baseline_n, med_views, med_saves, med_reach, med_er, ' +
  'views_multiple, saves_multiple, reach_multiple, er_multiple, outlier_metric';

export async function fetchPostPerformance(
  userId: string,
  opts: { platform?: string; limit?: number } = {}
): Promise<PostPerformance[]> {
  let q = supabase
    .from('post_performance')
    .select(SELECT)
    .eq('user_id', userId)
    .order('published_at', { ascending: false })
    .limit(opts.limit ?? 60);
  if (opts.platform) q = q.eq('platform', opts.platform);

  const { data, error } = await q;
  if (error) {
    console.warn('post_performance query failed:', error.message);
    return [];
  }
  // PostgREST types a view select as GenericStringError[] when it cannot
  // resolve the shape, so go through unknown rather than fight it.
  return (data ?? []) as unknown as PostPerformance[];
}

/** Median of a numeric list. Median rather than mean throughout: one viral post
 *  (a 2.36M-view Facebook outlier against an 886 median) makes a mean useless. */
function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Roll posts up by lane for the leaderboard.
 *
 * `minPosts` guards against a one-post lane topping the board on a fluke. Lanes
 * below the floor are dropped rather than shown with a caveat: a leaderboard
 * that needs a footnote to be read correctly is not a leaderboard.
 */
export function buildLaneStats(posts: PostPerformance[], minPosts = 5): LaneStat[] {
  const groups = new Map<string, PostPerformance[]>();
  for (const p of posts) {
    if (!p.lane_id || !p.lane_name) continue;
    const list = groups.get(p.lane_id) ?? [];
    list.push(p);
    groups.set(p.lane_id, list);
  }

  return Array.from(groups.entries())
    .map(([lane_id, list]) => ({
      lane_id,
      lane_name: list[0].lane_name!,
      winning_looks_like: list[0].winning_looks_like,
      posts: list.length,
      medViews: median(list.map((p) => p.views)),
      medSaves: median(list.map((p) => p.saves)),
      medEr: median(list.map((p) => p.engagement_rate)),
    }))
    .filter((l) => l.posts >= minPosts)
    .sort((a, b) => b.medViews - a.medViews);
}

/**
 * One sentence explaining the verdict, or null when there is nothing honest to
 * say. Deliberately plain: no praise, no encouragement, no exclamation marks.
 */
export function verdictSentence(p: PostPerformance): string | null {
  if (p.views_multiple === null) {
    const need = Math.max(0, 8 - (p.baseline_n ?? 0));
    return `Not enough history for a ${p.media_type ?? 'post'} on ${p.platform} yet. ${need} more to go before this can be scored.`;
  }

  const v = p.views_multiple;
  const s = p.saves_multiple;

  // The interesting case: it held people even though it did not travel far.
  if (s !== null && s >= 1.5 && s > v * 1.5) {
    return `Saves ran ${fmtMultiple(s)} your median while views held at ${fmtMultiple(v)}. This one landed harder than it reached.`;
  }
  if (v >= 2) return `${fmtMultiple(v)} your median for a ${p.media_type ?? 'post'} on ${p.platform}.`;
  if (v >= 1.2) return `Ahead of your median at ${fmtMultiple(v)}, against your last ${p.baseline_n} in this format.`;
  if (v <= 0.6) return `Ran ${fmtMultiple(v)} your median. Worth checking what the ones above it did differently.`;
  return `About par for a ${p.media_type ?? 'post'} on ${p.platform}, against your last ${p.baseline_n} in this format.`;
}

/**
 * Cap the printed multiple. A genuinely viral post can score 2774x its median,
 * and printing that reads as a broken dashboard rather than a big week.
 */
export function fmtMultiple(m: number): string {
  if (m >= 100) return '100x+';
  if (m >= 10) return `${Math.round(m)}x`;
  return `${m.toFixed(1)}x`;
}
