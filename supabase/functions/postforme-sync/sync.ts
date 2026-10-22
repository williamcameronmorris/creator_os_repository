/**
 * The per-user sync: pull accounts, feeds and results from Post for Me
 * (./pfm.ts), reconcile them against content_posts and write metrics. See
 * index.ts for what each table receives.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isPublishHandle, matchBookedRows, matchByPublishWindow } from "./reconcile.ts";
import {
  type AccountFeedPost,
  type NormalizedMetrics,
  type PostResult,
  FEED_CONCURRENCY,
  getAccountFeed,
  listAccounts,
  listPostResults,
  mapWithConcurrency,
  POSTFORME_API_KEY,
} from "./pfm.ts";

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export interface SyncSummary {
  userId: string;
  accountsSynced: number;
  snapshotsAdded: number;
  feedPostsImported: number;
  /** Booked rows (Compose / schedule-batch) the feed matched by social_post_id and updated in place. */
  bookedReconciled: number;
  /** Older published-only imports that were folded into their booked row and deleted. */
  duplicatesMerged: number;
  feedPostsWithMetrics: number;
  postMetricsUpdated: number;
  dailySnapshotsWritten: number;
  postsSynced: number;
  postsMatched: number;
  metricsUpserted: number;
  errors: string[];
}

export interface ExistingRow {
  id: string;
  platform_post_id: string | null;
  published_at: string | null;
  postforme_post_id: string | null;
  social_account_id: string | null;
  provider: string | null;
  status: string | null;
  scheduled_for: string | null;
}

/**
 * How far a feed item's posted_at may sit from a booked row's scheduled_for
 * for the two to be the same post when the feed carries no social_post_id
 * (TikTok). PFM publishes within a few minutes of the slot; slots are hours
 * apart. Ambiguity inside the window is skipped, never guessed.
 */
export const PUBLISH_WINDOW_MS = 30 * 60_000;

/**
 * Fold an older published-only import into its booked row: move the daily
 * metric snapshots the booked row doesn't have yet, then delete the import
 * (cascades drop anything left). The unique (user_id, platform,
 * platform_post_id) index means the booked row can only take the platform id
 * once the import is gone.
 */
export async function absorbDuplicate(supabase: SupabaseClient, keepId: string, dupId: string): Promise<string | null> {
  const { data: keptDays, error: daysErr } = await supabase
    .from("content_post_metrics_daily")
    .select("snapshot_date")
    .eq("post_id", keepId);
  if (daysErr) return daysErr.message;
  const have = (keptDays ?? []).map((d) => d.snapshot_date as string);
  let move = supabase.from("content_post_metrics_daily").update({ post_id: keepId }).eq("post_id", dupId);
  if (have.length > 0) move = move.not("snapshot_date", "in", `(${have.join(",")})`);
  const { error: moveErr } = await move;
  if (moveErr) return moveErr.message;
  const { error: delErr } = await supabase.from("content_posts").delete().eq("id", dupId);
  return delErr ? delErr.message : null;
}

/**
 * Update booked rows in place from the feed items that name them. Returns the
 * platform's existing rows with any absorbed duplicates removed and the
 * reconciled rows stamped, so the import and metrics passes that follow see
 * the post as already present.
 */
export async function reconcileBookedRows(
  supabase: SupabaseClient,
  userId: string,
  platform: string,
  posts: AccountFeedPost[],
  existing: ExistingRow[],
  summary: SyncSummary,
): Promise<ExistingRow[]> {
  const byId = matchBookedRows(posts, existing, userId);
  // TikTok's feed names no social_post_id, so its booked rows are paired by
  // account + publish window instead; the id matcher's pairs are excluded.
  const byWindow = matchByPublishWindow(
    posts, existing, userId, PUBLISH_WINDOW_MS,
    new Set(byId.map((m) => m.row.id)),
    new Set(byId.map((m) => m.post.platform_post_id as string)),
  );
  const matches = [...byId, ...byWindow];
  if (matches.length === 0) return existing;

  // A publish handle stamped by the results pass is not a platform id; only
  // real ids can collide with an import.
  const byPlatformPostId = new Map<string, ExistingRow>(
    existing
      .filter((r) => r.platform_post_id && !isPublishHandle(r.platform_post_id))
      .map((r) => [r.platform_post_id as string, r]),
  );
  const removed = new Set<string>();

  for (const { post, row } of matches) {
    const ppid = post.platform_post_id as string;
    const holder = byPlatformPostId.get(ppid);
    if (holder && holder.id !== row.id) {
      // A row already holds this platform post: the published-only import an
      // earlier sync made before booked rows were reconciled. Fold it in.
      // Anything else (a legacy 'direct' row, a row bound to another PFM
      // post) is left alone and reported rather than guessed at.
      const isImportOfSamePost = holder.provider === "postforme" &&
        (!holder.postforme_post_id || holder.postforme_post_id === post.social_post_id);
      if (!isImportOfSamePost) {
        summary.errors.push(`reconcile ${platform}/${ppid}: row ${holder.id} already holds this platform post; left alone`);
        continue;
      }
      const mergeErr = await absorbDuplicate(supabase, row.id, holder.id);
      if (mergeErr) {
        summary.errors.push(`reconcile ${platform}/${ppid}: merge failed: ${mergeErr}`);
        continue;
      }
      removed.add(holder.id);
      byPlatformPostId.delete(ppid);
      summary.duplicatesMerged += 1;
    }

    const upd: Record<string, unknown> = {
      status: "published",
      publish_status: "published",
      publish_error: null,
      platform_post_id: ppid,
    };
    if (post.posted_at) upd.published_at = post.posted_at;
    if (post.platform_url) upd.platform_url = post.platform_url;
    if (post.thumbnail_url) upd.thumbnail_url = post.thumbnail_url;
    if (post.media_urls.length > 0) upd.media_urls = post.media_urls;
    if (post.metrics) {
      upd.views = post.metrics.views;
      upd.likes = post.metrics.likes;
      upd.comments = post.metrics.comments;
      upd.saves = post.metrics.saves;
      upd.shares = post.metrics.shares;
      upd.reach = post.metrics.reach;
      upd.engagement_rate = post.metrics.engagement_rate;
    }
    const { error } = await supabase.from("content_posts").update(upd).eq("id", row.id);
    if (error) {
      summary.errors.push(`reconcile ${platform}/${ppid}: ${error.message}`);
      continue;
    }
    row.platform_post_id = ppid;
    row.status = "published";
    if (post.posted_at) row.published_at = post.posted_at;
    byPlatformPostId.set(ppid, row);
    summary.bookedReconciled += 1;
  }

  return removed.size > 0 ? existing.filter((r) => !removed.has(r.id)) : existing;
}

export async function syncForUser(userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    userId,
    accountsSynced: 0,
    snapshotsAdded: 0,
    feedPostsImported: 0,
    bookedReconciled: 0,
    duplicatesMerged: 0,
    feedPostsWithMetrics: 0,
    postMetricsUpdated: 0,
    dailySnapshotsWritten: 0,
    postsSynced: 0,
    postsMatched: 0,
    metricsUpserted: 0,
    errors: [],
  };

  if (!POSTFORME_API_KEY) {
    summary.errors.push("Missing Post_For_Me_API secret");
    return summary;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Pull connected accounts + feeds in parallel
  const accounts = await listAccounts(userId);
  summary.accountsSynced = accounts.length;

  // Brand per account (brand_social_accounts). Brands are fully isolated, so
  // every row written below carries the brand of the account it came from.
  // An account with NO mapping is skipped and reported, never silently
  // attached to a default — that is precisely how one brand's posts would end
  // up inside another's.
  const { data: mappings, error: mapErr } = await supabase
    .from("brand_social_accounts")
    .select("pfm_account_id, brand_id")
    .in("pfm_account_id", accounts.map((a) => a.id));
  if (mapErr) summary.errors.push(`brand mapping lookup: ${mapErr.message}`);
  const brandByAccount = new Map<string, string>(
    (mappings ?? []).map((m) => [m.pfm_account_id as string, m.brand_id as string]),
  );

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const snapshotRows: Record<string, unknown>[] = [];
  const feedPostsByPlatform: Record<string, AccountFeedPost[]> = {};

  await mapWithConcurrency(accounts, FEED_CONCURRENCY, async (account) => {
      try {
        const brandId = brandByAccount.get(account.id);
        if (!brandId) {
          summary.errors.push(`no brand mapping for ${account.platform}/${account.id}; skipped`);
          return;
        }
        const feed = await getAccountFeed(account.id);
        if (!feed) return;
        // A 2xx with nothing usable in it is not a successful sync. Report it
        // here, per account, so the roll-up below cannot quietly skip a
        // platform whose feed went dark.
        const usable = feed.posts.filter((p) => p.metrics && p.platform_post_id).length;
        if (usable === 0) {
          const who = account.username ? `@${account.username}` : account.id;
          summary.errors.push(
            feed.posts.length === 0
              ? `feed ${account.platform}/${who}: feed returned no posts (HTTP 200, ${feed.pagesFetched} page${feed.pagesFetched === 1 ? "" : "s"})`
              : `feed ${account.platform}/${who}: ${feed.posts.length} posts but none carried metrics`,
          );
        }
        snapshotRows.push({
          user_id: userId,
          brand_id: brandId,
          pfm_account_id: account.id,
          platform: account.platform,
          username: account.username || null,
          followers: null, // PFM doesn't expose follower counts in their public API
          raw: feed.raw,
        });
        if (!feedPostsByPlatform[account.platform]) feedPostsByPlatform[account.platform] = [];
        feedPostsByPlatform[account.platform].push(
          ...feed.posts.map((p) => ({
            ...p,
            social_account_id: account.id,
            account_username: account.username || null,
            brand_id: brandId,
          })),
        );
      } catch (err) {
        summary.errors.push(`feed ${account.platform}/${account.id}: ${(err as Error).message}`);
      }
  });

  if (snapshotRows.length > 0) {
    const { error } = await supabase.from("pfm_account_snapshots").insert(snapshotRows);
    if (error) summary.errors.push(`snapshots insert: ${error.message}`);
    else summary.snapshotsAdded = snapshotRows.length;
  }

  // Import feed posts into content_posts (deduped by platform_post_id), then
  // stamp live metrics onto every mirrored row.
  for (const [platform, posts] of Object.entries(feedPostsByPlatform)) {
    if (posts.length === 0) continue;
    const platformPostIds = posts.map((p) => p.platform_post_id).filter((id): id is string => Boolean(id));
    if (platformPostIds.length === 0) continue;

    // Dedup against this platform's WHOLE history, by platform_post_id AND by
    // published_at. The legacy importer (provider='direct') stored Instagram
    // posts without a platform_post_id we can match on, so an id-only check
    // re-imported every post it already had as a duplicate row. Matching the
    // exact post timestamp catches those.
    const { data: existing, error: existingErr } = await supabase
      // all-brands: dedup runs against the user's whole history; platform_post_id is unique per user, not per brand.
      .from("content_posts")
      .select("id, platform_post_id, published_at, postforme_post_id, social_account_id, provider, status, scheduled_for")
      .eq("user_id", userId)
      .eq("platform", platform);
    if (existingErr) {
      summary.errors.push(`feed lookup ${platform}: ${existingErr.message}`);
      continue;
    }

    // ── Reconcile booked rows first ─────────────────────────────────────
    // Rows Compose / schedule-batch booked at schedule time carry the PFM
    // post id; the feed names it as social_post_id once the post is live.
    // Update those in place (and fold in any published-only import an older
    // sync made) BEFORE the dedup below, so the post counts as present and
    // is never imported a second time.
    const existingRows = await reconcileBookedRows(
      supabase, userId, platform, posts, (existing ?? []) as ExistingRow[], summary,
    );

    const existingIds = new Set(
      existingRows.map((r) => r.platform_post_id).filter((id): id is string => Boolean(id)),
    );
    // Timestamp matching is ONLY a fallback for legacy rows that have no
    // platform_post_id (the old provider='direct' importer). Applying it to
    // id-bearing rows would drop a genuinely different post that merely shares
    // a publish second with an existing one — so restrict it to legacy rows.
    const legacyTimes = new Set(
      existingRows
        .filter((r) => !r.platform_post_id)
        .map((r) => (r.published_at ? new Date(r.published_at).getTime() : NaN))
        .filter((t) => !Number.isNaN(t)),
    );

    const newRows = posts
      .filter((p) => {
        if (!p.platform_post_id) return false;
        if (existingIds.has(p.platform_post_id)) return false;
        if (p.posted_at) {
          const t = new Date(p.posted_at).getTime();
          if (!Number.isNaN(t) && legacyTimes.has(t)) return false;
        }
        return true;
      })
      .map((p) => ({
        user_id: userId,
        brand_id: p.brand_id,
        platform: p.platform,
        platform_post_id: p.platform_post_id,
        social_account_id: p.social_account_id,
        account_username: p.account_username,
        caption: p.caption || "",
        media_urls: p.media_urls,
        thumbnail_url: p.thumbnail_url,
        platform_url: p.platform_url,
        published_at: p.posted_at,
        scheduled_for: p.posted_at,
        scheduled_date: p.posted_at,
        status: "published",
        provider: "postforme",
        // Keep PFM's post id when it has one (a post booked outside Cliopatra,
        // or one whose mirror insert failed) so the webhook and results pass
        // can still find the row.
        postforme_post_id: p.social_post_id,
        content_type: "post",
        // Seed metrics on insert so a brand-new row is never blank.
        views: p.metrics?.views ?? null,
        likes: p.metrics?.likes ?? null,
        comments: p.metrics?.comments ?? null,
        saves: p.metrics?.saves ?? null,
        shares: p.metrics?.shares ?? null,
        reach: p.metrics?.reach ?? null,
        engagement_rate: p.metrics?.engagement_rate ?? null,
      }));

    if (newRows.length > 0) {
      // DO NOTHING on conflict rather than a bare insert: content_posts has a
      // UNIQUE (user_id, platform, platform_post_id), and one duplicate slipping
      // past the dedup above would otherwise abort the entire batch. Existing
      // rows are left exactly as they are — only the metrics pass below touches
      // them, so a legacy provider='direct' row never gets reassigned.
      const { error: insertErr } = await supabase
        .from("content_posts")
        .upsert(newRows, {
          onConflict: "user_id,platform,platform_post_id",
          ignoreDuplicates: true,
        });
      if (insertErr) summary.errors.push(`feed insert ${platform}: ${insertErr.message}`);
      else summary.feedPostsImported += newRows.length;
    }

    // ── Stamp metrics onto mirrored rows ───────────────────────────────────
    // Re-read ids (the insert above may have added rows) and map them to the
    // feed's platform_post_id so we can write both the current value on
    // content_posts and today's append-only snapshot.
    const withMetrics = posts.filter((p) => p.metrics && p.platform_post_id);
    summary.feedPostsWithMetrics += withMetrics.length;
    if (withMetrics.length === 0) continue;

    const { data: rows, error: rowsErr } = await supabase
      .from("content_posts")
      .select("id, platform_post_id, brand_id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .in("platform_post_id", withMetrics.map((p) => p.platform_post_id as string));
    if (rowsErr) {
      summary.errors.push(`metrics lookup ${platform}: ${rowsErr.message}`);
      continue;
    }
    const idByPlatformPostId = new Map(
      (rows || [])
        .filter((r) => r.platform_post_id)
        .map((r) => [
          r.platform_post_id as string,
          { id: r.id as string, brand_id: (r.brand_id as string | null) ?? null },
        ]),
    );

    const postUpdates: Record<string, unknown>[] = [];
    const dailyRows: Record<string, unknown>[] = [];
    for (const p of withMetrics) {
      const hit = idByPlatformPostId.get(p.platform_post_id as string);
      if (!hit) continue;
      const id = hit.id;
      // A post keeps the brand it was imported under. Moving an account between
      // brands is explicit (move_account_history), never a side effect of a
      // metrics refresh, so brand_id is NOT part of the update below and the
      // daily row follows the post rather than the current mapping.
      const rowBrand = hit.brand_id ?? p.brand_id;
      const m = p.metrics as NormalizedMetrics;
      // id is read straight from the table, so ON CONFLICT (id) always fires
      // and this behaves as an update. user_id/platform are included to keep
      // the INSERT tuple valid before the conflict resolves.
      const upd: Record<string, unknown> = {
        id,
        user_id: userId,
        platform,
        views: m.views,
        likes: m.likes,
        comments: m.comments,
        saves: m.saves,
        shares: m.shares,
        reach: m.reach,
        engagement_rate: m.engagement_rate,
      };
      // Instagram and Facebook CDN URLs are SIGNED and expire (the CDN starts
      // answering "URL signature expired"), so a thumbnail written once at
      // import goes dead within weeks and every post image in the app breaks.
      // PFM hands back freshly signed URLs on every feed call, so refresh them
      // on each sync. Only overwrite when the feed actually supplied one --
      // Threads text posts have no media and must not blank an existing image.
      if (p.thumbnail_url) upd.thumbnail_url = p.thumbnail_url;
      if (p.media_urls.length > 0) upd.media_urls = p.media_urls;
      // The public URL, for the media kit's top-post links.
      if (p.platform_url) upd.platform_url = p.platform_url;
      postUpdates.push(upd);
      dailyRows.push({
        post_id: id,
        user_id: userId,
        brand_id: rowBrand,
        platform,
        snapshot_date: today,
        metrics: {
          views: m.views,
          likes: m.likes,
          comments: m.comments,
          saves: m.saves,
          shares: m.shares,
          reach: m.reach,
        },
      });
    }

    if (postUpdates.length > 0) {
      const { error } = await supabase
        .from("content_posts")
        .upsert(postUpdates, { onConflict: "id" });
      if (error) summary.errors.push(`metrics update ${platform}: ${error.message}`);
      else summary.postMetricsUpdated += postUpdates.length;
    }

    if (dailyRows.length > 0) {
      const { error } = await supabase
        .from("content_post_metrics_daily")
        .upsert(dailyRows, { onConflict: "post_id,snapshot_date" });
      if (error) summary.errors.push(`daily snapshot ${platform}: ${error.message}`);
      else summary.dailySnapshotsWritten += dailyRows.length;
    }
  }

  // 2. Mirror status/metrics onto posts Cliopatra published through PFM.
  //    NOTE: this no longer drives platform_metrics — see the header comment.
  let postResults: PostResult[] = [];
  try {
    postResults = await listPostResults();
    summary.postsSynced = postResults.length;
  } catch (err) {
    summary.errors.push(`post results: ${(err as Error).message}`);
  }
  // Results name the account, not the platform; the legacy fallback below
  // still matches by platform, so fill it in from the account list.
  const platformByAccount = new Map(accounts.map((a) => [a.id, String(a.platform || "").toLowerCase()]));

  for (const result of postResults) {
    if (!result.platform && result.socialAccountId) {
      result.platform = platformByAccount.get(result.socialAccountId) ?? "";
    }
    const updates: Record<string, unknown> = {};
    if (result.metrics) {
      updates.views = result.metrics.views;
      updates.likes = result.metrics.likes;
      updates.comments = result.metrics.comments;
      updates.saves = result.metrics.saves;
      updates.shares = result.metrics.shares;
      updates.engagement_rate = result.metrics.engagement_rate;
    }
    if (result.status === "published" || result.status === "success") {
      updates.status = "published";
      updates.publish_status = "published";
      updates.publish_error = null;
      if (result.publishedAt) updates.published_at = result.publishedAt;
      if (result.platformUrl) updates.platform_url = result.platformUrl;
    } else if (result.status === "failed" || result.status === "error") {
      updates.status = "failed";
      updates.publish_status = "failed";
      if (result.error) updates.publish_error = result.error;
    }
    if (Object.keys(updates).length === 0) continue;

    // Prefer matching on (postforme_post_id, social_account_id) when the
    // result identifies its account — with multiple accounts per platform the
    // (postforme_post_id, platform) pair is no longer unique. Fall back to the
    // legacy (postforme_post_id, platform, user_id) match for rows created
    // before multi-account support (social_account_id is null there).
    let matched = 0;
    let matchErr: string | null = null;

    if (result.socialAccountId) {
      const { error, count } = await supabase
        .from("content_posts")
        .update(updates, { count: "exact" })
        .eq("postforme_post_id", result.postId)
        .eq("social_account_id", result.socialAccountId)
        .eq("user_id", userId)
        .select("id");
      if (error) matchErr = error.message;
      else matched = count || 0;
    }

    if (matched === 0 && !matchErr && result.platform) {
      let fallback = supabase
        .from("content_posts")
        .update(updates, { count: "exact" })
        .eq("postforme_post_id", result.postId)
        .eq("platform", result.platform)
        .eq("user_id", userId);
      if (result.socialAccountId) fallback = fallback.is("social_account_id", null);
      const { error, count } = await fallback.select("id");
      if (error) matchErr = error.message;
      else matched = count || 0;
    }

    if (matchErr) summary.errors.push(`content_posts update ${result.postId}: ${matchErr}`);
    else summary.postsMatched += matched;

    if (matched > 0 && updates.status === "published") {
      // The same row scope as the update above.
      const scoped = (values: Record<string, unknown>) => {
        let q = supabase
          .from("content_posts")
          .update(values)
          .eq("postforme_post_id", result.postId)
          .eq("user_id", userId);
        if (result.socialAccountId) q = q.eq("social_account_id", result.socialAccountId);
        else if (result.platform) q = q.eq("platform", result.platform);
        return q;
      };
      // First time we learn it published and the result carries no time: now.
      if (!result.publishedAt) {
        const { error } = await scoped({ published_at: new Date().toISOString() }).is("published_at", null);
        if (error) summary.errors.push(`content_posts published_at ${result.postId}: ${error.message}`);
      }
      // Stamp the platform's id only where none is set yet, and never a
      // TikTok publish handle (the feed's video id is the real key; the
      // publish-window matcher binds it). A row the feed already reconciled
      // keeps the feed's id, so the two passes can never disagree, and a
      // unique-index clash (an import still holding the id) is reported here
      // and healed by the next feed pass, not fatal.
      if (result.platformPostId && !isPublishHandle(result.platformPostId)) {
        const { error } = await scoped({ platform_post_id: result.platformPostId }).is("platform_post_id", null);
        if (error) summary.errors.push(`content_posts stamp ${result.postId}: ${error.message}`);
      }
    }
  }

  // Roll the feed metrics up into one platform_metrics row per (BRAND, platform)
  // for TODAY. It used to be per platform across the whole user; brands are
  // isolated, so two brands on Instagram must never share a row. The unique key
  // is (brand_id, platform, date, social_account_key) as of the brands migration.
  const agg = new Map<string, { brand_id: string; platform: string; n: number;
    views: number; likes: number; comments: number; shares: number; saves: number;
    interactions: number; denominator: number }>();
  for (const posts of Object.values(feedPostsByPlatform)) {
    for (const p of posts) {
      if (!p.metrics) continue;
      const key = `${p.brand_id}:${p.platform}`;
      const a = agg.get(key) ?? { brand_id: p.brand_id, platform: p.platform, n: 0,
        views: 0, likes: 0, comments: 0, shares: 0, saves: 0, interactions: 0, denominator: 0 };
      const m = p.metrics;
      a.n += 1; a.views += m.views; a.likes += m.likes; a.comments += m.comments;
      a.shares += m.shares; a.saves += m.saves;
      // Same definition as normalizeMetrics, summed rather than averaged:
      // interactions over reach where the platform reports reach, else views.
      // A plain mean of per-post rates let a 30-view post with two likes
      // count as much as a 2M-view one.
      a.interactions += m.likes + m.comments + m.saves + m.shares;
      a.denominator += m.reach > 0 ? m.reach : m.views;
      agg.set(key, a);
    }
  }

  // Newest known follower count (and post count) per brand/platform, so a
  // fresh day's row starts from the last real value instead of the column
  // default of 0. Includes today, so a count the direct sync already wrote
  // is carried back unchanged.
  const carried = new Map<string, { followers_count: number; total_posts: number }>();
  if (agg.size > 0) {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
    const { data: prior, error: priorErr } = await supabase
      .from("platform_metrics")
      .select("brand_id, platform, date, followers_count, total_posts")
      .in("brand_id", Array.from(new Set(Array.from(agg.values()).map((a) => a.brand_id))))
      .in("platform", Array.from(new Set(Array.from(agg.values()).map((a) => a.platform))))
      .is("social_account_id", null)
      .gt("followers_count", 0)
      .gte("date", ninetyDaysAgo)
      .order("date", { ascending: false })
      .limit(1000);
    if (priorErr) summary.errors.push(`platform_metrics prior lookup: ${priorErr.message}`);
    for (const r of prior ?? []) {
      const key = `${r.brand_id}:${r.platform}`;
      if (!carried.has(key)) {
        carried.set(key, {
          followers_count: Number(r.followers_count) || 0,
          total_posts: Number(r.total_posts) || 0,
        });
      }
    }
  }

  const metricRows = Array.from(agg.values()).map((a) => {
    const prev = carried.get(`${a.brand_id}:${a.platform}`);
    return {
      user_id: userId,
      brand_id: a.brand_id,
      platform: a.platform,
      date: today,
      social_account_id: null,
      // total_* only. views/likes/comments/shares/saves are GENERATED ALWAYS
      // from these; writing them raises 428C9 and kills the whole upsert.
      total_views: a.views,
      total_likes: a.likes,
      total_comments: a.comments,
      total_shares: a.shares,
      total_saves: a.saves,
      avg_engagement_rate: a.denominator > 0 ? (a.interactions / a.denominator) * 100 : 0,
      // PFM exposes neither of these. Carry the newest known value forward;
      // 0 only when nothing positive exists for this brand/platform yet.
      followers_count: prev?.followers_count ?? 0,
      total_posts: prev?.total_posts ?? 0,
    };
  });

  if (metricRows.length > 0) {
    const { error } = await supabase
      .from("platform_metrics")
      .upsert(metricRows, { onConflict: "brand_id,platform,date,social_account_key" });
    if (error) summary.errors.push(`platform_metrics upsert: ${error.message}`);
    else summary.metricsUpserted = metricRows.length;
  }
  return summary;
}
