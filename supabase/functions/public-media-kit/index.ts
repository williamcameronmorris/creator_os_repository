import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * public-media-kit
 *
 * The ONLY public read path into a creator's numbers. Deployed with
 * --no-verify-jwt, runs on the service role, and returns a hand-whitelisted
 * payload for one published kit. Nothing here ever selects * from profiles
 * (it holds plaintext platform tokens), and no table gets an anon policy to
 * make this work.
 *
 *   GET  /public-media-kit?slug=gibsunday
 *   POST /public-media-kit/lead   { slug, brand_name, contact_name,
 *                                   contact_email, budget_tier, message }
 *
 * Numbers are per BRAND (the kit belongs to a brand). Follower counts come
 * from platform_metrics where a direct grant supplies them (Instagram and
 * YouTube on the default brand); otherwise the kit's own per-platform
 * manual figure is used and labelled as such. Engagement, post counts, average
 * views and top posts come from the Post for Me feed for every platform.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// IPs are stored only as a salted hash, for rate limiting. A dedicated
// Lead_Salt secret is preferred; the service key is the fallback.
const LEAD_SALT = Deno.env.get("Lead_Salt") || SERVICE_KEY;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extra },
  });
}

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY = 86_400_000;

const PROFILE_URL: Record<string, (h: string) => string> = {
  instagram: (h) => `https://instagram.com/${h}`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  threads: (h) => `https://www.threads.net/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  x: (h) => `https://x.com/${h}`,
  bluesky: (h) => `https://bsky.app/profile/${h}`,
};

interface PlatformConfig {
  platform: string;
  visible?: boolean;
  show_followers?: boolean;
  show_growth?: boolean;
  show_engagement?: boolean;
  show_avg_views?: boolean;
  followers_override?: number | null;
  followers_override_at?: string | null;
}

interface KitRow {
  id: string;
  brand_id: string;
  user_id: string;
  slug: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  website: string | null;
  platforms: unknown;
  show_top_posts: boolean;
  top_posts_limit: number;
  contact_mode: "form" | "email" | "link";
  contact_email: string | null;
  contact_url: string | null;
  contact_label: string;
  stale_after_days: number;
  theme: string;
}

interface MetricRow {
  platform: string;
  date: string;
  followers_count: number | null;
  avg_engagement_rate: number | null;
  total_posts: number | null;
}

interface PostRow {
  id: string;
  platform: string;
  platform_post_id: string | null;
  platform_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
}

const KIT_COLUMNS =
  "id, brand_id, user_id, slug, display_name, headline, bio, avatar_url, location, website, platforms, " +
  "show_top_posts, top_posts_limit, contact_mode, contact_email, contact_url, contact_label, stale_after_days, theme";

/** Case-insensitive exact match. `_` is a LIKE wildcard, so escape it. */
async function findKit(supabase: SupabaseClient, slug: string): Promise<KitRow | null> {
  const pattern = slug.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase
    .from("media_kits")
    .select(KIT_COLUMNS)
    .ilike("slug", pattern)
    .eq("is_published", true)
    .maybeSingle();
  if (error) throw new Error(`kit lookup: ${error.message}`);
  return (data as KitRow | null) ?? null;
}

function permalink(p: PostRow, handle: string | null): string | null {
  if (p.platform_url) return p.platform_url;
  if (p.platform === "youtube") {
    // Legacy rows have no platform_post_id, but the thumbnail carries the video id.
    const id = p.platform_post_id || p.thumbnail_url?.match(/\/vi\/([A-Za-z0-9_-]{11})\//)?.[1] || null;
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
  }
  if (!p.platform_post_id) return null;
  if (p.platform === "tiktok" && handle) return `https://www.tiktok.com/@${handle}/video/${p.platform_post_id}`;
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Median, not mean: one 2.36M-view post against a ~1K median makes a mean useless to a brand. */
function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

async function buildPayload(supabase: SupabaseClient, kit: KitRow) {
  const now = Date.now();
  const staleMs = Math.max(1, kit.stale_after_days) * DAY;
  const configs = (Array.isArray(kit.platforms) ? (kit.platforms as PlatformConfig[]) : [])
    .filter((c) => c && typeof c.platform === "string" && c.visible !== false);
  const visible = configs.map((c) => c.platform);

  const [profileRes, accountsRes, metricsRes, postsRes, ratesRes] = await Promise.all([
    // Explicit columns only. profiles carries plaintext tokens.
    supabase
      .from("profiles")
      .select("display_name, full_name, avatar_url, bio, website, instagram_handle, tiktok_handle, youtube_handle, threads_handle, facebook_page_name")
      .eq("id", kit.user_id)
      .maybeSingle(),
    supabase.from("brand_social_accounts").select("platform, username").eq("brand_id", kit.brand_id),
    visible.length
      ? supabase
        .from("platform_metrics")
        .select("platform, date, followers_count, avg_engagement_rate, total_posts")
        .eq("brand_id", kit.brand_id)
        .in("platform", visible)
        .order("date", { ascending: false })
        .limit(600)
      : Promise.resolve({ data: [] as MetricRow[], error: null }),
    visible.length
      ? supabase
        .from("content_posts")
        .select("id, platform, platform_post_id, platform_url, thumbnail_url, published_at, views, likes, comments")
        .eq("brand_id", kit.brand_id)
        .eq("status", "published")
        .in("platform", visible)
        .not("published_at", "is", null)
        .order("published_at", { ascending: false })
        .limit(600)
      : Promise.resolve({ data: [] as PostRow[], error: null }),
    supabase
      .from("media_kit_rates")
      .select("label, description, price_cents, price_prefix, currency, platform")
      .eq("media_kit_id", kit.id)
      .eq("is_visible", true)
      .order("sort_order", { ascending: true }),
  ]);

  const profile = (profileRes.data ?? {}) as Record<string, string | null>;
  const metrics = (metricsRes.data ?? []) as MetricRow[];
  const posts = (postsRes.data ?? []) as PostRow[];

  // Handle per platform: the brand's mapped account first, the profile's
  // legacy handle second (only meaningful for the default brand).
  const handles = new Map<string, string>();
  for (const a of (accountsRes.data ?? []) as { platform: string; username: string | null }[]) {
    if (a.username && !handles.has(a.platform)) handles.set(a.platform, a.username);
  }
  const legacy: Record<string, string | null> = {
    instagram: profile.instagram_handle,
    tiktok: profile.tiktok_handle,
    youtube: profile.youtube_handle,
    threads: profile.threads_handle,
    facebook: profile.facebook_page_name,
  };
  for (const [p, h] of Object.entries(legacy)) if (h && !handles.has(p)) handles.set(p, h);

  let newestStatDate: string | null = null;
  const platforms = configs.map((cfg) => {
    const p = cfg.platform;
    const rows = metrics.filter((m) => m.platform === p);
    const latest = rows[0] ?? null;
    const followersRow = rows.find((m) => (m.followers_count ?? 0) > 0) ?? null;
    const fresh = followersRow && now - Date.parse(followersRow.date) <= staleMs ? followersRow : null;

    let followers: number | null = null;
    let followers_source: "synced" | "manual" | null = null;
    let followers_as_of: string | null = null;
    if (cfg.show_followers !== false) {
      if (fresh) {
        followers = fresh.followers_count;
        followers_source = "synced";
        followers_as_of = fresh.date;
      } else if (typeof cfg.followers_override === "number" && cfg.followers_override > 0) {
        followers = Math.round(cfg.followers_override);
        followers_source = "manual";
        followers_as_of = cfg.followers_override_at ?? null;
      } else if (followersRow) {
        // Stale but real. stats_stale tells the page to date it.
        followers = followersRow.followers_count;
        followers_source = "synced";
        followers_as_of = followersRow.date;
      }
    }

    let growth_30d_pct: number | null = null;
    if (cfg.show_growth !== false && followersRow && followers_source === "synced") {
      const anchor = Date.parse(followersRow.date);
      const prior = rows.find((m) => (m.followers_count ?? 0) > 0 && anchor - Date.parse(m.date) >= 28 * DAY);
      if (prior && prior.followers_count) {
        growth_30d_pct = round1(((followersRow.followers_count! - prior.followers_count) / prior.followers_count) * 100);
      }
    }

    const platformPosts = posts.filter((x) => x.platform === p);
    // Typical views: the median over the last 90 days, or over the last twenty
    // posts with views when the creator has not published much lately.
    const withViews = platformPosts.filter((x) => (x.views ?? 0) > 0 && x.published_at);
    let window = withViews.filter((x) => now - Date.parse(x.published_at!) <= 90 * DAY);
    if (window.length < 3) window = withViews.slice(0, 20);
    const avg_views = cfg.show_avg_views !== false && window.length
      ? Math.round(median(window.map((x) => x.views ?? 0)))
      : null;

    // The newest row that actually carries a rate. On a day the follower sync
    // runs before the feed roll-up, the newest row holds a default 0.
    const erRow = rows.find((m) => m.avg_engagement_rate != null && Number(m.avg_engagement_rate) > 0) ?? null;
    const engagement_rate = cfg.show_engagement !== false && erRow
      ? round1(Number(erRow.avg_engagement_rate))
      : null;

    const total_posts = latest?.total_posts && latest.total_posts > 0 ? latest.total_posts : platformPosts.length;
    const as_of = latest?.date ?? null;
    if (as_of && (!newestStatDate || as_of > newestStatDate)) newestStatDate = as_of;

    const handle = handles.get(p) ?? null;
    return {
      platform: p,
      handle,
      url: handle && PROFILE_URL[p] ? PROFILE_URL[p](handle) : null,
      followers,
      followers_source,
      followers_as_of,
      growth_30d_pct,
      engagement_rate,
      total_posts,
      avg_views,
      as_of,
    };
  });

  const totals = { followers: platforms.reduce((s, x) => s + (x.followers ?? 0), 0) };

  let top_posts: unknown[] = [];
  if (kit.show_top_posts) {
    const limit = Math.min(12, Math.max(1, kit.top_posts_limit || 6));
    top_posts = posts
      .filter((x) => x.thumbnail_url)
      .map((x) => {
        const views = x.views ?? 0;
        const metric_label = views > 0 ? "views" : "likes";
        const metric_value = views > 0 ? views : (x.likes ?? 0) + (x.comments ?? 0);
        return {
          platform: x.platform,
          thumbnail_url: x.thumbnail_url,
          permalink: permalink(x, handles.get(x.platform) ?? null),
          published_at: x.published_at,
          metric_label,
          metric_value,
        };
      })
      .sort((a, b) => b.metric_value - a.metric_value)
      .slice(0, limit);
  }

  const stats_as_of = newestStatDate;
  const stats_stale = !stats_as_of || now - Date.parse(stats_as_of) > staleMs;

  return {
    kit: {
      slug: kit.slug,
      display_name: kit.display_name || profile.display_name || profile.full_name || null,
      headline: kit.headline,
      bio: kit.bio || profile.bio || null,
      avatar_url: kit.avatar_url || profile.avatar_url || null,
      location: kit.location,
      website: kit.website || profile.website || null,
      theme: kit.theme,
      contact: {
        mode: kit.contact_mode,
        label: kit.contact_label,
        email: kit.contact_mode === "email" ? kit.contact_email : null,
        url: kit.contact_mode === "link" ? kit.contact_url : null,
      },
    },
    totals,
    platforms,
    rates: ratesRes.data ?? [],
    top_posts,
    stats_as_of,
    stats_stale,
  };
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

async function handleLead(req: Request, supabase: SupabaseClient): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }

  // Honeypot: real browsers never fill it. Pretend it worked.
  if (str(body.website, 10)) return json({ ok: true }, 202);

  const slug = str(body.slug, 32);
  const email = str(body.contact_email, 200);
  if (!slug || !SLUG_RE.test(slug)) return json({ error: "Unknown kit" }, 404);
  if (!email || !EMAIL_RE.test(email)) return json({ error: "A valid email is required" }, 400);

  const kit = await findKit(supabase, slug);
  if (!kit) return json({ error: "Unknown kit" }, 404);

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ip_hash = await sha256Hex(`${LEAD_SALT}:${ip}`);

  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("media_kit_leads")
    .select("id", { count: "exact", head: true })
    .eq("media_kit_id", kit.id)
    .eq("ip_hash", ip_hash)
    .gte("created_at", since);
  if ((count ?? 0) >= 3) return json({ error: "Too many messages from this connection. Try again in an hour." }, 429);

  const { error } = await supabase.from("media_kit_leads").insert({
    media_kit_id: kit.id,
    user_id: kit.user_id,
    brand_id: kit.brand_id,
    brand_name: str(body.brand_name, 120),
    contact_name: str(body.contact_name, 120),
    contact_email: email,
    budget_tier: str(body.budget_tier, 40),
    message: str(body.message, 2000),
    ip_hash,
    user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300),
  });
  if (error) return json({ error: "Could not save your message" }, 500);
  return json({ ok: true }, 201);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);

  try {
    if (req.method === "POST" && url.pathname.endsWith("/lead")) return await handleLead(req, supabase);
    if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

    const slug = (url.searchParams.get("slug") ?? "").trim();
    if (!SLUG_RE.test(slug)) return json({ error: "not_found" }, 404);
    const kit = await findKit(supabase, slug);
    if (!kit) return json({ error: "not_found" }, 404, { "Cache-Control": "public, max-age=60" });

    const payload = await buildPayload(supabase, kit);
    // Counted on the server so it cannot be gamed from the page.
    await supabase.rpc("increment_media_kit_views", { p_kit_id: kit.id });
    return json(payload, 200, { "Cache-Control": "public, max-age=300, s-maxage=300" });
  } catch (err) {
    console.error("public-media-kit:", (err as Error).message);
    return json({ error: "Something went wrong" }, 500);
  }
});
