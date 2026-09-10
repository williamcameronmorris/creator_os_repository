/**
 * Pure matching for postforme-sync's booked-row reconcile.
 *
 * Compose and schedule-batch book one content_posts row per account at
 * schedule time (provider 'postforme', postforme_post_id 'sp_…', no
 * platform_post_id). When the post publishes, the Post for Me account feed
 * lists it with `social_post_id` (the same 'sp_…' id) plus the platform's
 * own post id. This module pairs feed items with booked rows so the sync can
 * UPDATE the booked row instead of inserting a second one.
 *
 * No imports on purpose: `deno test reconcile_test.ts` runs without the edge
 * runtime or network.
 */

export interface FeedItemForMatch {
  /** Post for Me social post id ('sp_…'); null for posts PFM did not publish. */
  social_post_id: string | null;
  platform_post_id: string | null;
  /** The PFM account the feed was pulled for. */
  social_account_id: string | null;
  /** PFM echoes the `external_id` we set when creating the post: the Cliopatra user id. */
  external_post_id: string | null;
}

export interface BookedRowForMatch {
  id: string;
  postforme_post_id: string | null;
  social_account_id: string | null;
  platform_post_id: string | null;
  /** Needed only by matchByPublishWindow. */
  scheduled_for?: string | null;
  status?: string | null;
}

/**
 * TikTok's post RESULT reports the publish handle ('v_pub_file~v2-…' or
 * 'v_inbox_file~…'), not the video id the feed uses. Treat such a value as
 * "not stamped yet" so the feed can still bind the row to the real id.
 */
export function isPublishHandle(id: string | null | undefined): boolean {
  return typeof id === "string" && /^v_(pub|inbox)_/i.test(id);
}

function stampedId(row: BookedRowForMatch): string | null {
  return row.platform_post_id && !isPublishHandle(row.platform_post_id) ? row.platform_post_id : null;
}

export interface BookedMatch<F, R> {
  post: F;
  row: R;
}

/**
 * Pair feed items with booked rows. Rows must already be scoped to one user
 * and one platform (the caller reads them that way).
 *
 * Rules, in order:
 *   - a feed item needs both ids; one whose external_post_id names another
 *     user is never matched (tenant guard, belt and braces on top of the
 *     account filter);
 *   - a row is a candidate when its postforme_post_id equals the item's
 *     social_post_id and it is either unstamped or already stamped with the
 *     same platform_post_id (so re-runs are idempotent);
 *   - prefer the row for the same account; otherwise a single legacy row with
 *     no social_account_id (pre multi-account); otherwise, when the item has
 *     no account either, a single remaining candidate;
 *   - one row per item, one item per row, and one item per platform_post_id.
 */
export function matchBookedRows<F extends FeedItemForMatch, R extends BookedRowForMatch>(
  feed: F[],
  rows: R[],
  userId: string,
): BookedMatch<F, R>[] {
  const byPfmId = new Map<string, R[]>();
  for (const r of rows) {
    if (!r.postforme_post_id) continue;
    const list = byPfmId.get(r.postforme_post_id);
    if (list) list.push(r);
    else byPfmId.set(r.postforme_post_id, [r]);
  }

  const claimed = new Set<string>();
  const seenPosts = new Set<string>();
  const out: BookedMatch<F, R>[] = [];

  for (const post of feed) {
    if (!post.social_post_id || !post.platform_post_id) continue;
    if (post.external_post_id && post.external_post_id !== userId) continue;
    // The same platform post listed twice (YouTube repeats entries across
    // pages) is one post, never two rows.
    if (seenPosts.has(post.platform_post_id)) continue;
    seenPosts.add(post.platform_post_id);

    const candidates = (byPfmId.get(post.social_post_id) ?? []).filter((r) =>
      !claimed.has(r.id) &&
      (stampedId(r) == null || stampedId(r) === post.platform_post_id)
    );
    if (candidates.length === 0) continue;

    let row: R | undefined;
    if (post.social_account_id) {
      row = candidates.find((r) => r.social_account_id === post.social_account_id);
    }
    if (!row) {
      const legacy = candidates.filter((r) => !r.social_account_id);
      if (legacy.length === 1) row = legacy[0];
      else if (!post.social_account_id && candidates.length === 1) row = candidates[0];
    }
    if (!row) continue;

    claimed.add(row.id);
    out.push({ post, row });
  }

  return out;
}

export interface FeedItemForWindow extends FeedItemForMatch {
  posted_at: string | null;
}

/**
 * Fallback for feeds that carry no social_post_id (TikTok, as observed on
 * 2026-09-10). Pairs a feed item with the ONE booked row for the same account
 * whose scheduled_for lies within `windowMs` of the item's posted_at. Both
 * sides must be unambiguous: an item with two rows in its window, or a row
 * wanted by two items, is skipped rather than guessed. Rows already stamped
 * with a real platform id, failed rows and drafts are never candidates.
 * `claimedRows` / `claimedPosts` let the caller exclude what the id-based
 * matcher already paired.
 */
export function matchByPublishWindow<F extends FeedItemForWindow, R extends BookedRowForMatch>(
  feed: F[],
  rows: R[],
  userId: string,
  windowMs: number,
  claimedRows: Set<string> = new Set(),
  claimedPosts: Set<string> = new Set(),
): BookedMatch<F, R>[] {
  const candidates = rows.filter((r) =>
    !claimedRows.has(r.id) &&
    !!r.postforme_post_id &&
    !!r.social_account_id &&
    stampedId(r) == null &&
    (r.status == null || r.status === "scheduled" || r.status === "publishing" || r.status === "published") &&
    !!r.scheduled_for && Number.isFinite(new Date(r.scheduled_for).getTime())
  );
  if (candidates.length === 0) return [];

  // item index -> rows in its window; row id -> item indexes that want it
  const wants = new Map<number, R[]>();
  const wantedBy = new Map<string, number[]>();
  feed.forEach((post, i) => {
    if (post.social_post_id || !post.platform_post_id || !post.social_account_id || !post.posted_at) return;
    if (post.external_post_id && post.external_post_id !== userId) return;
    if (claimedPosts.has(post.platform_post_id)) return;
    const t = new Date(post.posted_at).getTime();
    if (!Number.isFinite(t)) return;
    const hits = candidates.filter((r) =>
      r.social_account_id === post.social_account_id &&
      Math.abs(new Date(r.scheduled_for as string).getTime() - t) <= windowMs
    );
    if (hits.length === 0) return;
    wants.set(i, hits);
    for (const r of hits) {
      const list = wantedBy.get(r.id);
      if (list) list.push(i);
      else wantedBy.set(r.id, [i]);
    }
  });

  const out: BookedMatch<F, R>[] = [];
  const seenPosts = new Set<string>();
  for (const [i, hits] of wants) {
    if (hits.length !== 1) continue;
    const row = hits[0];
    if ((wantedBy.get(row.id) ?? []).length !== 1) continue;
    const post = feed[i];
    if (seenPosts.has(post.platform_post_id as string)) continue;
    seenPosts.add(post.platform_post_id as string);
    out.push({ post, row });
  }
  return out;
}
