import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { matchBookedRows } from "./reconcile.ts";

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
 *   social-post-results is still queried, but only to mirror status onto posts
 *   Cliopatra published through PFM. It is no longer the source of the
 *   platform_metrics roll-up.
 *
 * RECONCILE (changed 2026-09-09):
 *
 *   Compose and schedule-batch book one content_posts row per account when a
 *   post is scheduled (provider 'postforme', postforme_post_id 'sp_…', no
 *   platform_post_id). Once it publishes, the feed lists it with
 *   `social_post_id` — the same 'sp_…' id — so the feed pass now UPDATES the
 *   booked row (status, publish_status, published_at, platform_post_id,
 *   platform_url, metrics) instead of importing a second, published-only row.
 *   Before this, Schedule kept showing the booked row as scheduled and every
 *   per-post count doubled. Feed posts with no booked row are still imported.
 *
 *   The results pass was also dead: PFM results carry `success` and
 *   `platform_data.{id,url}`, not the `status`/`platform`/`platform_post_id`
 *   fields it looked for, so every result was dropped. It now reads the real
 *   fields, marks failed posts 'failed', and never writes zero metrics over
 *   what the feed stamped.
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
  /** Post for Me's own post id ('sp_…') when PFM published it; null otherwise. */
  social_post_id: string | null;
  /** PFM echoes the `external_id` we set at create time — the Cliopatra user id. */
  external_post_id: string | null;
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
  /** From brand_social_accounts. Posts are stamped per account, never per user. */
  brand_id: string;
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
    if (!res.ok) {
      // A non-2xx on the FIRST page means this account contributed nothing to
      // the run. Throw so the caller records it in summary.errors: a platform
      // that silently drops out of the roll-up is exactly how metrics went
      // stale for seven weeks with every run reporting success.
      if (page === 0) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
      }
      break;
    }
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
        social_post_id: (p.social_post_id as string) || null,
        external_post_id: (p.external_post_id as string) || null,
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
  /** "" when the result doesn't name it — PFM results don't; syncForUser fills it from the account. */
  platform: string;
  socialAccountId: string | null;
  publishedAt: string | null;
  platformPostId: string | null;
  platformUrl: string | null;
  /** 'published' | 'failed' | '' (nothing to mirror). */
  status: string;
  error: string | null;
  /** null when the result carries no metrics block — never write zeros over feed metrics. */
  metrics: NormalizedMetrics | null;
}

function mapPostResult(r: Record<string, unknown>): PostResult {
  const account = r.account as Record<string, unknown> | undefined;
  const result = r.result as Record<string, unknown> | undefined;
  // Per the PFM spec a result is { id, social_account_id, post_id, success,
  // error, details, platform_data: { id, url }, media }.
  const platformData = r.platform_data as Record<string, unknown> | undefined;
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
    ?? (platformData?.id != null ? String(platformData.id) : null)
    ?? (result?.platform_post_id as string)
    ?? null;
  const platformUrl = (platformData?.url as string) ?? (r.platform_url as string) ?? null;
  const publishedAt = (r.published_at as string)
    ?? (r.posted_at as string)
    ?? (result?.published_at as string)
    ?? null;
  // PFM reports the outcome as `success: boolean`; a status string is only a
  // fallback for the older shapes this used to guess at.
  const status = typeof r.success === "boolean"
    ? (r.success ? "published" : "failed")
    : String(r.status || result?.status || "").toLowerCase();
  const rawError = r.error ?? result?.error ?? null;
  const error = rawError == null
    ? null
    : typeof rawError === "string"
      ? rawError
      : typeof (rawError as Record<string, unknown>).message === "string"
        ? String((rawError as Record<string, unknown>).message)
        : JSON.stringify(rawError);

  const metricsBlob = r.metrics ?? result?.metrics ?? null;
  const metrics = metricsBlob && typeof metricsBlob === "object" ? normalizeMetrics(metricsBlob) : null;

  return {
    postId, platform, socialAccountId, publishedAt, platformPostId, platformUrl, status,
    error: error ? error.slice(0, 500) : null, metrics,
  };
}

/**
 * Fetch post results for posts PFM itself published (one per post per
 * account). Only mirrors status onto Cliopatra-published rows; the
 * platform_metrics roll-up comes from the feed. The endpoint takes offset /
 * limit / post_id / platform / social_account_id — no external_id — so the
 * whole workspace comes back and the writes below stay scoped by user_id.
 */
async function listPostResults(): Promise<PostResult[]> {
  const PAGE = 100;
  const MAX_PAGES = 30;
  const all: PostResult[] = [];
  const seen = new Set<string>();
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      limit: String(PAGE),
      offset: String(offset),
    });

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
      if (!mapped.postId) continue;
      const key = `${mapped.postId}::${mapped.socialAccountId ?? mapped.platform}`;
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

interface ExistingRow {
  id: string;
  platform_post_id: string | null;
  published_at: string | null;
  postforme_post_id: string | null;
  social_account_id: string | null;
  provider: string | null;
  status: string | null;
}

/**
 * Fold an older published-only import into its booked row: move the daily
 * metric snapshots the booked row doesn't have yet, then delete the import
 * (cascades drop anything left). The unique (user_id, platform,
 * platform_post_id) index means the booked row can only take the platform id
 * once the import is gone.
 */
async function absorbDuplicate(supabase: SupabaseClient, keepId: string, dupId: string): Promise<string | null> {
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
async function reconcileBookedRows(
  supabase: SupabaseClient,
  userId: string,
  platform: string,
  posts: AccountFeedPost[],
  existing: ExistingRow[],
  summary: SyncSummary,
): Promise<ExistingRow[]> {
  const matches = matchBookedRows(posts, existing, userId);
  if (matches.length === 0) return existing;

  const byPlatformPostId = new Map<string, ExistingRow>(
    existing.filter((r) => r.platform_post_id).map((r) => [r.platform_post_id as string, r]),
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

async function syncForUser(userId: string): Promise<SyncSummary> {
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

  await Promise.all(
    accounts.map(async (account) => {
      try {
        const brandId = brandByAccount.get(account.id);
        if (!brandId) {
          summary.errors.push(`no brand mapping for ${account.platform}/${account.id}; skipped`);
          return;
        }
        const feed = await getAccountFeed(account.id);
        if (!feed) return;
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
      .select("id, platform_post_id, published_at, postforme_post_id, social_account_id, provider, status")
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

    // Stamp the platform's id only where none is set yet. A row the feed
    // already reconciled keeps the feed's id, so the two passes can never
    // disagree, and a unique-index clash (an import still holding the id)
    // is reported here and healed by the next feed pass, not fatal.
    if (matched > 0 && updates.status === "published" && result.platformPostId) {
      const stamp: Record<string, unknown> = { platform_post_id: result.platformPostId };
      if (!result.publishedAt) stamp.published_at = new Date().toISOString();
      let q = supabase
        .from("content_posts")
        .update(stamp)
        .eq("postforme_post_id", result.postId)
        .eq("user_id", userId)
        .is("platform_post_id", null);
      if (result.socialAccountId) q = q.eq("social_account_id", result.socialAccountId);
      else if (result.platform) q = q.eq("platform", result.platform);
      const { error } = await q;
      if (error) summary.errors.push(`content_posts stamp ${result.postId}: ${error.message}`);
    }
  }

  // Roll the feed metrics up into one platform_metrics row per (BRAND, platform)
  // for TODAY. It used to be per platform across the whole user; brands are
  // isolated, so two brands on Instagram must never share a row. The unique key
  // is (brand_id, platform, date, social_account_key) as of the brands migration.
  const agg = new Map<string, { brand_id: string; platform: string; n: number;
    views: number; likes: number; comments: number; shares: number; saves: number; er: number }>();
  for (const posts of Object.values(feedPostsByPlatform)) {
    for (const p of posts) {
      if (!p.metrics) continue;
      const key = `${p.brand_id}:${p.platform}`;
      const a = agg.get(key) ?? { brand_id: p.brand_id, platform: p.platform, n: 0,
        views: 0, likes: 0, comments: 0, shares: 0, saves: 0, er: 0 };
      const m = p.metrics;
      a.n += 1; a.views += m.views; a.likes += m.likes; a.comments += m.comments;
      a.shares += m.shares; a.saves += m.saves; a.er += m.engagement_rate;
      agg.set(key, a);
    }
  }
  const metricRows = Array.from(agg.values()).map((a) => ({
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
    avg_engagement_rate: a.er / a.n,
    // followers_count and total_posts are deliberately omitted. PFM exposes
    // neither, and naming them here would null out what the follower syncs wrote.
  }));

  if (metricRows.length > 0) {
    const { error } = await supabase
      .from("platform_metrics")
      .upsert(metricRows, { onConflict: "brand_id,platform,date,social_account_key" });
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
