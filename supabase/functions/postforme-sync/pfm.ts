/**
 * Post for Me API client for postforme-sync: accounts, account feeds and
 * post results, normalised into the shapes the sync writes. No database
 * access here.
 */


export const POSTFORME_API_KEY = Deno.env.get("Post_For_Me_API");
export const PFM_BASE = "https://api.postforme.dev";

/** Feed pages to walk per account. 50/page, so 3 pages ≈ the last 150 posts. */
export const MAX_FEED_PAGES = 3;
export const FEED_PAGE_SIZE = 50;


export interface PfmAccount {
  id: string;
  platform: string;
  username?: string | null;
  status?: string;
  profile_photo_url?: string | null;
}

export interface NormalizedMetrics {
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
export function normalizeMetrics(raw: unknown): NormalizedMetrics {
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

/** How many accounts' feeds to walk at once. Nine in parallel drew HTTP 429 on five of them per run (2026-09-10). */
export const FEED_CONCURRENCY = 2;
/** Retries per call on HTTP 429, honouring Retry-After when PFM sends one. */
export const RATE_LIMIT_RETRIES = 3;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pfmFetch(path: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${PFM_BASE}${path}`, {
      ...(init || {}),
      headers: {
        Authorization: `Bearer ${POSTFORME_API_KEY}`,
        "Content-Type": "application/json",
        ...(init?.headers || {}),
      },
    });
    if (res.status !== 429 || attempt >= RATE_LIMIT_RETRIES) return res;
    // Drain the body so the connection is reusable, then back off.
    await res.text().catch(() => "");
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 20_000)
      : 1500 * 2 ** attempt;
    await sleep(waitMs);
  }
}

/** Run `fn` over `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

export async function listAccounts(externalId?: string): Promise<PfmAccount[]> {
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

export interface FeedPost {
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
export type AccountFeedPost = FeedPost & {
  social_account_id: string;
  account_username: string | null;
  /** From brand_social_accounts. Posts are stamped per account, never per user. */
  brand_id: string;
};

export interface FeedResult {
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
export async function getAccountFeed(accountId: string): Promise<FeedResult | null> {
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

export interface PostResult {
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

export function mapPostResult(r: Record<string, unknown>): PostResult {
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
export async function listPostResults(): Promise<PostResult[]> {
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
