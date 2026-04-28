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
 * Setup (manual):
 *   - Set Supabase secret `Default_PFM_User_Id` = <your auth.users.id>
 *   - Set Supabase secret `Cron_Secret` = <random>
 *   - Schedule via Supabase Dashboard:
 *       Functions > postforme-sync > Schedule > "0 *\/6 * * *"  (every 6h)
 *       Body: {"cronSecret":"<your secret>"}
 *
 * What it writes:
 *
 *   pfm_account_snapshots — every run inserts one row per connected PFM
 *     account with the latest follower count + raw feed payload (kept for
 *     debugging + future analysis).
 *
 *   platform_metrics — upsert one row per (user, platform, today). Fills
 *     in followers_count + same-day aggregates (views/likes/comments/etc.)
 *     for any post results published today.
 *
 *   content_posts — for any post result whose `post_id` matches a row's
 *     `postforme_post_id`, update views/likes/comments/saves/shares/
 *     engagement_rate, set status='published', set published_at. This
 *     keeps the local mirror in sync.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTFORME_API_KEY = Deno.env.get("Post_For_Me_API");
const CRON_SECRET = Deno.env.get("Cron_Secret");
const DEFAULT_PFM_USER_ID = Deno.env.get("Default_PFM_User_Id");
const PFM_BASE = "https://api.postforme.dev";

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
}

interface NormalizedMetrics {
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  engagement_rate: number;
}

/**
 * Normalize a per-platform metrics object into our common shape.
 *
 * PFM exposes a different DTO per platform (Instagram/YouTube/TikTok/etc).
 * The exact field names aren't fully documented in the public OpenAPI spec,
 * so we probe a list of common aliases. Anything we can't find stays at 0.
 *
 * Update this map as we observe real responses.
 */
function normalizeMetrics(platform: string, raw: unknown): NormalizedMetrics {
  const m = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = m[k];
      if (typeof v === "number") return v;
      if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return Number(v);
    }
    return 0;
  };

  const views = num("views", "view_count", "video_views", "impressions", "play_count", "plays");
  const likes = num("likes", "like_count", "reactions", "favorite_count", "digg_count");
  const comments = num("comments", "comment_count", "reply_count");
  const saves = num("saves", "save_count", "bookmarks");
  const shares = num("shares", "share_count", "retweets", "reposts");

  const explicit = num("engagement_rate", "engagement");
  const engagement_rate = explicit > 0
    ? (explicit > 1 ? explicit : explicit * 100) // accept 0-1 fraction or 0-100 percent
    : (views > 0 ? ((likes + comments + saves + shares) / views) * 100 : 0);

  return { views, likes, comments, saves, shares, engagement_rate };
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

async function listAccounts(): Promise<PfmAccount[]> {
  const res = await pfmFetch("/v1/social-accounts");
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
}

interface FeedResult {
  followers: number; // PFM doesn't expose follower counts in public API; always 0 today
  posts: FeedPost[];
  raw: unknown;
}

async function getAccountFeed(accountId: string): Promise<FeedResult | null> {
  const res = await pfmFetch(`/v1/social-account-feeds/${encodeURIComponent(accountId)}`);
  if (!res.ok) return null;
  const body = await res.json();
  // PFM's feed endpoint returns { data: [posts], meta: {...} }. Each post has
  // platform, platform_post_id, platform_url, caption, posted_at, media[].
  // No follower count anywhere in the response — PFM doesn't expose that today.
  const arr: Record<string, unknown>[] = Array.isArray(body?.data) ? body.data : [];
  const posts: FeedPost[] = arr.map((p) => {
    const media: { url?: string; thumbnail_url?: string }[] = Array.isArray(p.media) ? p.media : [];
    return {
      platform: String(p.platform || "").toLowerCase(),
      platform_post_id: (p.platform_post_id as string) || null,
      platform_url: (p.platform_url as string) || null,
      caption: (p.caption as string) || null,
      posted_at: (p.posted_at as string) || null,
      media_urls: media.map((m) => m.url).filter((u): u is string => Boolean(u)),
      thumbnail_url: media[0]?.thumbnail_url || null,
    };
  }).filter((p) => p.platform_post_id);
  return { followers: 0, posts, raw: body };
}

interface PostResult {
  postId: string;
  platform: string;
  publishedAt: string | null;
  platformPostId: string | null;
  status: string;
  metrics: NormalizedMetrics;
  raw: unknown;
}

async function listPostResults(limit = 200): Promise<PostResult[]> {
  // PFM pagination shape isn't pinned down in the public spec — we try a
  // generous page size and a couple of likely query keys. If PFM only returns
  // up to N results regardless, we'll see that in logs and tune later.
  const res = await pfmFetch(`/v1/social-post-results?limit=${limit}&page_size=${limit}`);
  if (!res.ok) return [];
  const body = await res.json();
  const arr = Array.isArray(body) ? body : (body?.data || []);

  return arr.map((r: Record<string, unknown>): PostResult => {
    const platform = String(r.platform || (r.account as Record<string, unknown> | undefined)?.platform || "").toLowerCase();
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

    // Per-platform metrics may live under r.metrics, r.result.metrics, or
    // directly on r — we try each.
    const metricsBlob = r.metrics
      ?? (r.result as Record<string, unknown> | undefined)?.metrics
      ?? r;
    const metrics = normalizeMetrics(platform, metricsBlob);

    return { postId, platform, publishedAt, platformPostId, status, metrics, raw: r };
  }).filter((r: PostResult) => r.postId && r.platform);
}

interface SyncSummary {
  userId: string;
  accountsSynced: number;
  snapshotsAdded: number;
  feedPostsImported: number;
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
  const accounts = await listAccounts();
  summary.accountsSynced = accounts.length;

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const snapshotRows: Record<string, unknown>[] = [];
  const feedPostsByPlatform: Record<string, FeedPost[]> = {};

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
        feedPostsByPlatform[account.platform].push(...feed.posts);
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

  // Import feed posts into content_posts (deduped by platform_post_id).
  // Each platform's feed gives us recent posts that may have been published
  // outside Cliopatra. We mirror them so OfficeHub + Clio see the user's full
  // recent activity rather than only posts created via Compose.
  for (const [platform, posts] of Object.entries(feedPostsByPlatform)) {
    if (posts.length === 0) continue;
    const platformPostIds = posts.map((p) => p.platform_post_id).filter((id): id is string => Boolean(id));
    if (platformPostIds.length === 0) continue;

    const { data: existing, error: existingErr } = await supabase
      .from("content_posts")
      .select("platform_post_id")
      .eq("user_id", userId)
      .eq("platform", platform)
      .in("platform_post_id", platformPostIds);
    if (existingErr) {
      summary.errors.push(`feed lookup ${platform}: ${existingErr.message}`);
      continue;
    }
    const existingIds = new Set((existing || []).map((r) => r.platform_post_id));

    const newRows = posts
      .filter((p) => p.platform_post_id && !existingIds.has(p.platform_post_id))
      .map((p) => ({
        user_id: userId,
        platform: p.platform,
        platform_post_id: p.platform_post_id,
        caption: p.caption || "",
        media_urls: p.media_urls,
        thumbnail_url: p.thumbnail_url,
        published_at: p.posted_at,
        scheduled_for: p.posted_at,
        scheduled_date: p.posted_at,
        status: "published",
        provider: "postforme",
        content_type: "post",
      }));

    if (newRows.length === 0) continue;
    const { error: insertErr } = await supabase.from("content_posts").insert(newRows);
    if (insertErr) summary.errors.push(`feed insert ${platform}: ${insertErr.message}`);
    else summary.feedPostsImported += newRows.length;
  }

  // 2. Pull post results, normalize, write to platform_metrics + content_posts
  let postResults: PostResult[] = [];
  try {
    postResults = await listPostResults();
    summary.postsSynced = postResults.length;
  } catch (err) {
    summary.errors.push(`post results: ${(err as Error).message}`);
  }

  // Aggregate post results by (platform, date) for the daily platform_metrics roll-up
  const dailyAgg: Record<string, {
    user_id: string;
    platform: string;
    date: string;
    total_posts: number;
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_saves: number;
    avg_engagement_rate: number;
  }> = {};

  // Update content_posts mirror rows with the live metrics
  for (const result of postResults) {
    const datePart = result.publishedAt ? result.publishedAt.slice(0, 10) : null;
    const key = `${result.platform}:${datePart || today}`;
    if (!dailyAgg[key]) {
      dailyAgg[key] = {
        user_id: userId,
        platform: result.platform,
        date: datePart || today,
        total_posts: 0,
        total_views: 0,
        total_likes: 0,
        total_comments: 0,
        total_shares: 0,
        total_saves: 0,
        avg_engagement_rate: 0,
      };
    }
    const a = dailyAgg[key];
    a.total_posts += 1;
    a.total_views += result.metrics.views;
    a.total_likes += result.metrics.likes;
    a.total_comments += result.metrics.comments;
    a.total_shares += result.metrics.shares;
    a.total_saves += result.metrics.saves;
    a.avg_engagement_rate += result.metrics.engagement_rate;

    // Update local content_posts mirror by postforme_post_id + platform.
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

    const { error, count } = await supabase
      .from("content_posts")
      .update(updates)
      .eq("postforme_post_id", result.postId)
      .eq("platform", result.platform)
      .eq("user_id", userId)
      .select("id", { count: "exact" });
    if (error) summary.errors.push(`content_posts update ${result.postId}: ${error.message}`);
    else summary.postsMatched += count || 0;
  }

  // Finalize avg_engagement_rate (we summed; divide by total_posts)
  for (const k of Object.keys(dailyAgg)) {
    const a = dailyAgg[k];
    if (a.total_posts > 0) a.avg_engagement_rate = a.avg_engagement_rate / a.total_posts;
  }

  // Upsert platform_metrics rows. We replace each (user, platform, date) row
  // outright so re-running converges to PFM's latest numbers rather than
  // double-counting. PFM doesn't expose follower counts via the public API
  // today, so followers_count stays null until we wire a different source.
  const metricRows = Object.values(dailyAgg).map((a) => ({
    user_id: a.user_id,
    platform: a.platform,
    date: a.date,
    total_posts: a.total_posts,
    total_views: a.total_views,
    total_likes: a.total_likes,
    total_comments: a.total_comments,
    total_shares: a.total_shares,
    total_saves: a.total_saves,
    views: a.total_views,
    likes: a.total_likes,
    comments: a.total_comments,
    shares: a.total_shares,
    saves: a.total_saves,
    avg_engagement_rate: a.avg_engagement_rate,
    followers_count: null,
  }));

  if (metricRows.length > 0) {
    const { error } = await supabase
      .from("platform_metrics")
      .upsert(metricRows, { onConflict: "user_id,platform,date" });
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
