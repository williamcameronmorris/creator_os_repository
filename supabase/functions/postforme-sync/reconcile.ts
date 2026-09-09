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
      (r.platform_post_id == null || r.platform_post_id === post.platform_post_id)
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
