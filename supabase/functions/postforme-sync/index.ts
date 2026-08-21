import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * postforme-sync
 *
 * Pulls connected-account state and post analytics from Post for Me into our
 * own tables so OfficeHub, Clio, and any other surface can read real numbers
 * without making round-trips to PFM on every render.
 *
 * Two modes:
 *
 *   1. User-triggered (default)
 *      Caller sends `Authorization: Bearer <user-jwt>`. We verify the JWT,
 *      pull the user's id, and sync that user.
 *
 *   2. Cron-triggered
 *      Caller sends `{ cronSecret: "..." }` in the body. If it matches the
 *      `Cron_Secret` Supabase secret, we sync the user whose id is stored in
 *      the `Default_PFM_User_Id` Supabase secret. (Single-tenant for now —
 *      Cam's PFM workspace is shared, so all accounts belong to one user.)
 *
 * METRICS SOURCE (changed 2026-08-21):
 *
 *   Metrics now come from the ACCOUNT FEED with `?expand=metrics`, not from
 *   /v1/social-post-results. A live probe against all five connected accounts
 *   showed social-post-results returns zero rows (it only ever covers posts
 *   PFM itself published), which is why platform_metrics had gone stale while
 *   this function reported success every six hours. The feed returns real
 *   lifetime metrics for every post on every connected account:
 *
 *     instagram  views reach likes comments shares saved follows
 *                profile_visits profile_activity total_interactions
 *     youtube    views likes comments dislikes
 *     tiktok     view_count like_count comment_count share_count
 *     threads    views likes replies reposts quotes shares
 *     facebook   reactions_total video_views reach comments shares (+video_*)
 *
 *   social-post-results is still queried, but only to mirror status/metrics
 *   onto posts Cliopatra published through PFM. It is no longer the source of
 *   the platform_metrics roll-up.
 *
 * PFM does NOT expose follower counts anywhere in its public API (verified
 * against the account object, which carries only id/platform/username/status/
 * tokens/profile_photo_url/metadata). followers_count therefore stays owned by
 * instagram-sync and youtube-sync, and this function deliberately omits it
 * from its platform_metrics writes so it never clobbers theirs.
 *
 * What it writes:
 *
 *   pfm_account_snapshots — one row per connected PFM account per run, with
 *     the raw feed payload kept for debugging + future analysis.
 *
 *   content_posts — imports feed posts not already mirrored locally, then
 *     stamps live metrics (views/likes/comments/saves/shares/reach/
 *     engagement_rate) onto every mirrored row the feed knows about.
 *
 *   content_post_metrics_daily — one append-only snapshot per post per day,
 *     which is what powers period-over-period math at the post level.
 *
 *   platform_metrics — one row per (user, platform, TODAY) holding the
 *     aggregate across the posts in the feed window. Never writes the
 *     GENERATED columns (views/likes/comments/shares/saves are generated from
 *     the matching total_* columns; writing them raises 428C9 and aborts the
 *     whole upsert).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTFORME_API_KEY = Deno.env.get("Post_For_Me_API");
const CRON_SECRET = Deno.env.get("Cron_Secret");
const DEFAULT_PFM_USER_ID = Deno.env.get("Default_PFM_User_Id");
const PFM_BASE = "https://api.postforme.dev";

/** Feed pages to walk per account. 50/page, so 3 pages ≈ the last 150 posts. */
const MAX_FEED_PAGES = 3;
const FEED_PAGE_SIZE = 50;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PfmAccount {
  id: string;
  platform: string;
  username?: string | null;
  status?: string;
  profile_photo_url?: string | null;
}

interface NormalizedMetrics {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  reach: number;
  engagement_rate: number;
}

/**
 * Normalize a per-platform metrics object into our common shape.
 *
 * Aliases below are the REAL field names observed from PFM on 2026-08-21 for
 * all five of Cam's connected accounts, not guesses. Three of them were wrong
 * before this pass: Instagram spells saves `saved`, Threads spells comments
 * `replies`, and Facebook spells likes `reactions_total`.
 */
function normalizeMetrics(raw: unknown): NormalizedMetrics {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = m[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return 0;
  };

  // instagram/youtube/threads: views · tiktok: view_count · facebook: video_views
  const views = num("views", "view_count", "video_views", "impressions", "play_count", "plays");
  // facebook: reactions_total · tiktok: like_count · rest: likes
  const likes = num("likes", "like_count", "reactions_total", "reactions", "favorite_count", "digg_count");
  // threads: replies · tiktok: comment_count · rest: comments
  const comments = num("comments", "comment_count", "replies", "reply_count");
  // instagram: saved (no other platform reports saves)
  const saves = num("saves", "saved", "save_count", "bookmarks");
  // tiktok: share_count · rest: shares
  const shares = num("shares", "share_count", "retweets", "reposts");
  // instagram + facebook only
  const reach = num("reach");

  // Instagram hands us total_interactions directly; everywhere else sum what
  // we have. Rate is against reach when the platform reports it (that is the
  // number a brand recognises), else against views.
  const interactions = num("total_interactions") || (likes + comments + saves + shares);
  const denominator = reach > 0 ? reach : views;

  const explicit = num("engagement_rate", "engagement");
  const engagement_rate = explicit > 0
    ? (explicit > 1 ? explicit : explicit * 100) // accept 0-1 fraction or 0-100 percent
    : (denominator > 0 ? (interactions / denominator) * 100 : 0);

  return { views, likes, comments, saves, shares, reach, engagement_rate };
}

async function pfmFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${PFM_BASE}${path}`, {
    ...(init || {}),
    headers: {
      Authorization: `Bearer ${POSTFORME_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
}

async function listAccounts(externalId?: string): Promise<PfmAccount[]> {
  // Filter by external_id when known so each Cliopatra user only syncs their
  // own PFM accounts, not the whole shared workspace.
  const path = externalId
    ? `/v1/social-accounts?external_id=${encodeURIComponent(externalId)}`
    : "/v1/social-accounts";
  const res = await pfmFetch(path);
  if (!res.ok) return [];
  const body = await res.json();
  const arr = Array.isArray(body) ? body : (body?.data || []);
  return arr.filter((a: PfmAccount) => a && a.status !== "disconnected");
}

interface FeedPost {
  platform: string;
  platform_post_id: string | null;
  platform_url: string | null;
  caption: string | null;
  posted_at: string | null;
  media_urls: string[];
  thumbnail_url: string | null;
  /** null when the platform/account returned no metrics block for this post. */
  metrics: NormalizedMetrics | null;
}

/** FeedPost stamped with the PFM account it came from (multi-account support). */
type AccountFeedPost = FeedPost & {
  social_account_id: string;
  account_username: string | null;
};

interface FeedResult {
  posts: FeedPost[];
  /** First page only — the raw payload is kept for debugging, not every page. */
  raw: unknown;
  pagesFetched: number;
}

/**
 * Walk an account's feed with metrics expanded.
 *
 * `expand=metrics` is what makes PFM attach the per-post metrics object. The
 * account must have been connected with the `feeds` permission for this to
 * return anything; all five of Cam's accounts already have it.
 */
async function getAccountFeed(accountId: string): Promise<FeedResult | null> {
  const posts: FeedPost[] = [];
  let firstRaw: unknown = null;
  let cursor: string | null = null;
  let pagesFetched = 0;

  for (let page = 0; page < MAX_FEED_PAGES; page++) {
    const params = new URLSearchParams({
      expand: "metrics",
      limit: String(FEED_PAGE_SIZE),
    });
    if (cursor) params.set("cursor", cursor);

    const res = await pfmFetch(
      `/v1/social-account-feeds/${encodeURIComponent(accountId)}?${params.toString()}`,
    );
    if (!res.ok) break;
    const body = await res.json();
    if (page === 0) firstRaw = body;
    pagesFetched++;

    const arr: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
    if (arr.length === 0) break;

    for (const p of arr) {
      const media: { url?: string; thumbnail_url?: string }[] = Array.isArray(p.media) ? p.media : [];
      const hasMetrics = p.metrics && typeof p.metrics === "object";
      posts.push({
        platform: String(p.platform || "").toLowerCase(),
        platform_post_id: (p.platform_post_id as string) || null,
        platform_url: (p.platform_url as string) || null,
        caption: (p.caption as string) || null,
        posted_at: (p.posted_at as string) || null,
        media_urls: media.map((m) => m.url).filter((u): u is string => Boolean(u)),
        thumbnail_url: media[0]?.thumbnail_url || null,
        metrics: hasMetrics ? normalizeMetrics(p.metrics) : null,
      });
    }

    const meta = (body && typeof body === "object" ? body.meta : null) as
      | { cursor?: string | null; has_more?: boolean; next?: unknown }
      | null;
    if (!meta?.has_more) break;
    const nextCursor = meta?.cursor ?? null;
    // PFM echoes the cursor it used when there is nothing further; bail rather
    // than refetch the same page until MAX_FEED_PAGES.
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }

  if (pagesFetched === 0) return null;

  // Dedupe by platform_post_id. YouTube's feed repeats entries across pages,
  // which produced "ON CONFLICT DO UPDATE command cannot affect row a second
  // time" when the same content_posts id landed twice in one upsert batch.
  const seen = new Set<string>();
  const unique = posts.filter((p) => {
    if (!p.platform_post_id) return false;
    if (seen.has(p.platform_post_id)) return false;
    seen.add(p.platform_post_id);
    return true;
  });

  return { posts: unique, raw: firstRaw, pagesFetched };
}

interface PostResult {
  postId: string;
  platform: string;
  socialAccountId: string | null;
  publishedAt: string | null;
  platformPostId: string | null;
  status: string;
  metrics: NormalizedMetrics;
}

function mapPostResult(r: Record<string, unknown>): PostResult {
  const account = r.account as Record<string, unknown> | undefined;
  const platform = String(r.platform || account?.platform || "").toLowerCase();
  const socialAccountId = (r.social_account_id as string)
    ?? (account?.id != null ? String(account.id) : null)
    ?? null;
  const postId = String(
    r.post_id
      ?? r.social_post_id
      ?? (r.post as Record<string, unknown> | undefined)?.id
      ?? r.id
      ?? "",
  );
  const platformPostId = (r.platform_post_id as string)
    ?? ((r.result as Record<string, unknown> | undefined)?.platform_post_id as string)
    ?? null;
  const publishedAt = (r.published_at as string)
    ?? (r.posted_at as string)
    ?? ((r.result as Record<string, unknown> | undefined)?.published_at as string)
    ?? null;
  const status = String(r.status || (r.result as Record<string, unknown> | undefined)?.status || "");

  const metricsBlob = r.metrics
    ?? (r.result as Record<string, unknown> | undefined)?.metrics
    ?? r;
  const metrics = normalizeMetrics(metricsBlob);

  return { postId, platform, socialAccountId, publishedAt, platformPostId, status, metrics };
}

/**
 * Fetch post results for posts PFM itself published. As of 2026-08-21 this
 * returns zero rows for Cam's workspace (everything is published natively),
 * so it no longer feeds the platform_metrics roll-up — it only mirrors status
 * onto Cliopatra-published rows. Kept paginating for the day that changes.
 */
async function listPostResults(externalId?: string): Promise<PostResult[]> {
  const PAGE = 100;
  const MAX_PAGES = 30;
  const all: PostResult[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(PAGE),
      page_size: String(PAGE),
      offset: String(offset),
    });
    if (externalId) params.set("external_id", externalId);

    const res = await pfmFetch(`/v1/social-post-results?${params.toString()}`);
    if (!res.ok) break;
    const body = await res.json();
    const arr: Record<string, unknown>[] = Array.isArray(body)
      ? body
      : (Array.isArray(body?.data) ? body.data : []);
    if (arr.length === 0) break;

    let added = 0;
    for (const r of arr) {
      const mapped = mapPostResult(r);
      if (!mapped.postId || !mapped.platform) continue;
      const key = `${mapped.postId}::${mapped.platform}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(mapped);
      added++;
    }

    const meta = (body && typeof body === "object" ? (body as Record<string, unknown>).meta : null) as
      | { total?: number; next?: unknown }
      | null;

    if (added === 0) break;
    if (arr.length < PAGE) break;
    if (meta && "next" in meta && meta.next == null) break;
    if (meta && typeof meta.total === "number" && all.length >= meta.total) break;
    offset += arr.length;
  }

  return all;
}

interface SyncSummary {
  userId: string;
  accountsSynced: number;
  snapshotsAdded: number;
  feedPostsImported: number;
  feedPostsWithMetrics: number;
  postMetricsUpdated: number;
  dailySnapshotsWritten: number;
  postsSynced: number;
  postsMatched: number;
  metricsUpserted: number;
  errors: string[];
}

async function syncForUser(userId: string): Promise<SyncSummary> {
  const summary: SyncSummary = {
    userId,
    accountsSynced: 0,
    snapshotsAdded: 0,
    feedPostsImported: 0,
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

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const snapshotRows: Record<string, unknown>[] = [];
  const feedPostsByPlatform: Record<string, AccountFeedPost[]> = {};

  await Promise.all(
    accounts.map(async (account) => {
      try {
        const feed = await getAccountFeed(account.id);
        if (!feed) return;
        snapshotRows.push({
          user_id: userId,
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
          })),
        );
      } catch (err) {
        summary.errors.push(`feed ${account.platform}/${account.id}: ${(err as Error).message}`);
      }
    }),
  );

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
      .from("content_posts")
      .select("id, platform_post_id, published_at")
      .eq("user_id", userId)
      .eq("platform", platform);
    if (existingErr) {
      summary.errors.push(`feed lookup ${platform}: ${existingErr.message}`);
      continue;
    }
    const existingIds = new Set(
      (existing || []).map((r) => r.platform_post_id).filter((id): id is string => Boolean(id)),
    );
    // Timestamp matching is ONLY a fallback for legacy rows that have no
    // platform_post_id (the old provider='direct' importer). Applying it to
    // id-bearing rows would drop a genuinely different post that merely shares
    // a publish second with an existing one — so restrict it to legacy rows.
    const legacyTimes = new Set(
      (existing || [])
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
        platform: p.platform,
        platform_post_id: p.platform_post_id,
        social_account_id: p.social_account_id,
        account_username: p.account_username,
        caption: p.caption || "",
        media_urls: p.media_urls,
        thumbnail_url: p.thumbnail_url,
        published_at: p.posted_at,
        scheduled_for: p.posted_at,
        scheduled_date: p.posted_at,
        status: "published",
        provider: "postforme",
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
      .select("id, platform_post_id")
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
        .map((r) => [r.platform_post_id as string, r.id as string]),
    );

    const postUpdates: Record<string, unknown>[] = [];
    const dailyRows: Record<string, unknown>[] = [];
    for (const p of withMetrics) {
      const id = idByPlatformPostId.get(p.platform_post_id as string);
      if (!id) continue;
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
      postUpdates.push(upd);
      dailyRows.push({
        post_id: id,
        user_id: userId,
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
    postResults = await listPostResults(userId);
    summary.postsSynced = postResults.length;
  } catch (err) {
    summary.errors.push(`post results: ${(err as Error).message}`);
  }

  for (const result of postResults) {
    const updates: Record<string, unknown> = {
      views: result.metrics.views,
      likes: result.metrics.likes,
      comments: result.metrics.comments,
      saves: result.metrics.saves,
      shares: result.metrics.shares,
      engagement_rate: result.metrics.engagement_rate,
    };
    if (result.status.toLowerCase() === "published" || result.status.toLowerCase() === "success") {
      updates.status = "published";
      if (result.publishedAt) updates.published_at = result.publishedAt;
    } else if (result.status.toLowerCase() === "failed" || result.status.toLowerCase() === "error") {
      updates.status = "failed";
    }
    if (result.platformPostId) updates.platform_post_id = result.platformPostId;

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

    if (matched === 0 && !matchErr) {
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
  }

  // 3. Roll the feed metrics up into one platform_metrics row per platform for
  //    TODAY. This is a snapshot of current state, which is what Analytics and
  //    the media kit both read — not a per-publish-date bucket.
  const metricRows: Record<string, unknown>[] = [];
  for (const [platform, posts] of Object.entries(feedPostsByPlatform)) {
    const scored = posts.filter((p) => p.metrics);
    if (scored.length === 0) continue;
    let views = 0, likes = 0, comments = 0, shares = 0, saves = 0, erSum = 0;
    for (const p of scored) {
      const m = p.metrics as NormalizedMetrics;
      views += m.views; likes += m.likes; comments += m.comments;
      shares += m.shares; saves += m.saves; erSum += m.engagement_rate;
    }
    metricRows.push({
      user_id: userId,
      platform,
      date: today,
      social_account_id: null,
      // total_* only. views/likes/comments/shares/saves are GENERATED ALWAYS
      // from these; writing them raises 428C9 and kills the whole upsert.
      total_views: views,
      total_likes: likes,
      total_comments: comments,
      total_shares: shares,
      total_saves: saves,
      avg_engagement_rate: erSum / scored.length,
      // followers_count and total_posts are deliberately omitted. PFM does not
      // expose either, and naming them here would null out the values
      // instagram-sync / youtube-sync wrote for the same (user, platform, day).
    });
  }

  if (metricRows.length > 0) {
    // Conflict target includes social_account_key (STORED generated column,
    // coalesce(social_account_id,'')) — the account-separation migration
    // replaced UNIQUE(user_id,platform,date) with this 4-column key so legacy
    // roll-ups and future per-account rows coexist.
    const { error } = await supabase
      .from("platform_metrics")
      .upsert(metricRows, { onConflict: "user_id,platform,date,social_account_key" });
    if (error) summary.errors.push(`platform_metrics upsert: ${error.message}`);
    else summary.metricsUpserted = metricRows.length;
  }

  return summary;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { cronSecret?: string; userId?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    // empty / invalid body is fine
  }

  let userId: string | null = null;

  // Cron mode
  if (body.cronSecret && CRON_SECRET && body.cronSecret === CRON_SECRET) {
    if (!DEFAULT_PFM_USER_ID) {
      return new Response(
        JSON.stringify({ error: "Cron mode requires Default_PFM_User_Id secret" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    userId = DEFAULT_PFM_USER_ID;
  } else {
    // User mode — verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice(7);
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = userData.user.id;
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: "Could not determine userId" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const summary = await syncForUser(userId);

    // ── Trigger caption/voice analysis (fire-and-forget) ────────────────────
    fetch(`${SUPABASE_URL}/functions/v1/analyze-captions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ cronSecret: CRON_SECRET, userId, force: false }),
    }).catch((err) => {
      console.warn("analyze-captions fire-and-forget failed:", (err as Error).message);
    });

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("postforme-sync fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
