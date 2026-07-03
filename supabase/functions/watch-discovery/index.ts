import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * watch-discovery Edge Function
 *
 * Populates the Watch feature's shared niche-level tables (suggested_creators,
 * suggested_creator_videos) by discovering popular creators per niche via the
 * YouTube Data API.
 *
 * Auth to YouTube: reuses any connected account's stored refresh token (the
 * Data API search/channels/videos endpoints return public data, so any valid
 * token works). No new secret required. If a vidiq/YouTube Data API key is
 * added later, the discovery step can be swapped for higher-quality semantic
 * similarity without changing the storage layer.
 *
 * Cron-only: authenticate with the service-role bearer OR the shared
 * Cron_Secret, matching publish-scheduled-posts / refresh-tokens.
 *
 * Body (optional): { niche?: string }  — target a single niche; otherwise the
 * distinct non-empty profiles.niche_preference values (capped) are refreshed.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const YT = "https://www.googleapis.com/youtube/v3";
const MAX_NICHES_PER_RUN = 5;
const CREATORS_PER_NICHE = 8;
// Channels above this are almost always general-audience virality (Zack D.
// Films etc.), not niche creators worth studying. Drop them.
const MAX_SUBSCRIBERS = 3_000_000;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error || !data.access_token) {
    throw new Error(data.error_description || data.error || "token refresh failed");
  }
  return data.access_token as string;
}

type YtAuth = { key?: string; token?: string };

async function ytJson(
  path: string,
  params: Record<string, string | number>,
  auth: YtAuth,
): Promise<any> {
  const url = new URL(`${YT}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const headers: Record<string, string> = {};
  if (auth.key) url.searchParams.set("key", auth.key);
  else if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  const res = await fetch(url.toString(), { headers });
  const data = await res.json();
  if (data.error) {
    throw new Error(`YouTube ${path}: ${data.error?.message || JSON.stringify(data.error)}`);
  }
  return data;
}

const BB = "https://api.brightbean.xyz/v1";
const MAX_SCORED_PER_NICHE = 10;

/** Brightbean packaging score for a title+thumbnail: niche-relative CTR
 * percentile (0-100). Returns null on any failure so scoring is non-fatal. */
async function scorePackaging(
  title: string,
  thumbnailUrl: string | null,
  key: string,
): Promise<{ percentile: number; score: number } | null> {
  try {
    const res = await fetch(`${BB}/score/packaging`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ title, thumbnail_url: thumbnailUrl }),
    });
    if (!res.ok) return null;
    const d = await res.json();
    if (typeof d.percentile !== "number") return null;
    return { percentile: Math.round(d.percentile), score: Number(d.score) };
  } catch {
    return null;
  }
}

async function discoverNiche(
  supabase: ReturnType<typeof createClient>,
  auth: YtAuth,
  niche: string,
  bbKey?: string,
): Promise<{ creators: number; videos: number; scored: number }> {
  const publishedAfter = new Date(Date.now() - 120 * 86400000).toISOString();

  // 1. Popular recent short videos in the niche → candidate videos + channels.
  const search = await ytJson(
    "search",
    {
      part: "snippet",
      q: niche,
      type: "video",
      videoDuration: "short",
      order: "relevance",
      publishedAfter,
      maxResults: 25,
      relevanceLanguage: "en",
    },
    auth,
  );
  const items: any[] = search.items || [];
  const videoIds = items.map((i) => i.id?.videoId).filter(Boolean);

  const channelIds: string[] = [];
  for (const it of items) {
    const ch = it.snippet?.channelId;
    if (ch && !channelIds.includes(ch)) channelIds.push(ch);
  }
  if (channelIds.length === 0) return { creators: 0, videos: 0 };

  // 2. Channel stats.
  const chans = await ytJson(
    "channels",
    { part: "snippet,statistics", id: channelIds.slice(0, 20).join(","), maxResults: 50 },
    auth,
  );
  const channels = (chans.items || [])
    .map((c: any) => {
      const views = Number(c.statistics?.viewCount || 0);
      const count = Number(c.statistics?.videoCount || 0);
      return {
        channel_id: c.id as string,
        title: c.snippet?.title as string,
        handle: c.snippet?.customUrl || null,
        thumbnail_url: c.snippet?.thumbnails?.default?.url || null,
        subscriber_count: Number(c.statistics?.subscriberCount || 0),
        avg_views: count > 0 ? Math.round(views / count) : 0,
      };
    })
    .filter((c: any) => c.title && c.subscriber_count <= MAX_SUBSCRIBERS);
  channels.sort((a: any, b: any) => b.subscriber_count - a.subscriber_count);
  const top = channels.slice(0, CREATORS_PER_NICHE);
  if (top.length === 0) return { creators: 0, videos: 0 };

  // 3. Video stats.
  const vids = await ytJson(
    "videos",
    { part: "snippet,statistics", id: videoIds.slice(0, 40).join(","), maxResults: 50 },
    auth,
  );
  const videoStats = (vids.items || []).map((v: any) => ({
    video_id: v.id as string,
    channel_id: v.snippet?.channelId as string,
    title: v.snippet?.title as string,
    view_count: Number(v.statistics?.viewCount || 0),
    published_at: v.snippet?.publishedAt as string,
    thumbnail_url: v.snippet?.thumbnails?.high?.url || v.snippet?.thumbnails?.default?.url || null,
  }));

  // 4. Upsert creators.
  const now = new Date().toISOString();
  const creatorRows = top.map((c: any, i: number) => ({
    platform: "youtube",
    niche,
    channel_id: c.channel_id,
    handle: c.handle,
    title: c.title,
    subscriber_count: c.subscriber_count,
    avg_views: c.avg_views,
    thumbnail_url: c.thumbnail_url,
    rank: i + 1,
    refreshed_at: now,
  }));
  const { data: upserted, error: e1 } = await supabase
    .from("suggested_creators")
    .upsert(creatorRows, { onConflict: "platform,niche,channel_id" })
    .select("id, channel_id");
  if (e1) throw e1;
  const idByChannel = new Map((upserted || []).map((r: any) => [r.channel_id, r.id]));
  const avgByChannel = new Map(top.map((c: any) => [c.channel_id, c.avg_views || 1]));

  // 5. Upsert videos for the top creators.
  const videoRows: Array<Record<string, unknown>> = videoStats
    .filter((v: any) => idByChannel.has(v.channel_id))
    .map((v: any) => ({
      suggested_creator_id: idByChannel.get(v.channel_id),
      platform: "youtube",
      video_id: v.video_id,
      title: v.title,
      thumbnail_url: v.thumbnail_url,
      view_count: v.view_count,
      published_at: v.published_at,
      // Fallback signal when Brightbean scoring is unavailable.
      is_top: v.view_count >= 2 * (avgByChannel.get(v.channel_id) || 1),
      packaging_percentile: null,
      packaging_score: null,
    }));

  // Brightbean packaging score → the real "why it's working" signal. Non-fatal:
  // if the key is missing or a call fails, the view-based is_top stays.
  let scored = 0;
  if (bbKey && videoRows.length > 0) {
    const toScore = videoRows.slice(0, MAX_SCORED_PER_NICHE);
    const results = await Promise.all(
      toScore.map((r) =>
        scorePackaging(r.title as string, (r.thumbnail_url as string) || null, bbKey),
      ),
    );
    results.forEach((res, i) => {
      if (res) {
        toScore[i].packaging_percentile = res.percentile;
        toScore[i].packaging_score = res.score;
        toScore[i].is_top = res.percentile >= 70;
        scored++;
      }
    });
  }

  let videoCount = 0;
  if (videoRows.length > 0) {
    const { error: e2 } = await supabase
      .from("suggested_creator_videos")
      .upsert(videoRows, { onConflict: "suggested_creator_id,video_id" });
    if (e2) throw e2;
    videoCount = videoRows.length;
  }

  return { creators: creatorRows.length, videos: videoCount, scored };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  // Cron-only guard.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const expectedCron = Deno.env.get("Cron_Secret");
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  let body: { cronSecret?: string; niche?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch { /* no body */ }
  const isService = bearer !== "" && bearer === serviceRoleKey;
  const isCron = !!body.cronSecret && !!expectedCron && body.cronSecret === expectedCron;
  if (!isService && !isCron) {
    return json({ error: "Unauthorized — cron-only function" }, 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Prefer a YouTube Data API key (no expiry) — the durable path for a
    // scheduled job. Fall back to any connected account's OAuth token if no
    // key is set, but note Testing-mode OAuth refresh tokens expire in 7 days.
    let auth: YtAuth | null = null;
    const apiKey = Deno.env.get("YOUTUBE_API_KEY");
    if (apiKey) {
      auth = { key: apiKey };
    } else {
      const clientId = Deno.env.get("YOUTUBE_CLIENT_ID") || "";
      const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET") || "";
      const tokenErrors: string[] = [];
      if (clientSecret) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, youtube_refresh_token")
          .not("youtube_refresh_token", "is", null)
          .limit(5);
        for (const p of profiles || []) {
          try {
            const token = await refreshYouTubeToken(
              (p as any).youtube_refresh_token,
              clientId,
              clientSecret,
            );
            auth = { token };
            break;
          } catch (e) {
            tokenErrors.push((e as Error).message);
          }
        }
      }
      if (!auth) {
        return json({
          skipped:
            "no YouTube credential — set YOUTUBE_API_KEY (recommended) or reconnect a YouTube account",
          oauthErrors: tokenErrors,
        });
      }
    }

    // Resolve niches.
    let niches: string[];
    if (body.niche) {
      niches = [String(body.niche).trim().toLowerCase()];
    } else {
      const { data: profs } = await supabase
        .from("profiles")
        .select("niche_preference")
        .not("niche_preference", "is", null);
      niches = [
        ...new Set(
          (profs || [])
            .map((p: any) => String(p.niche_preference || "").trim().toLowerCase())
            .filter(Boolean),
        ),
      ].slice(0, MAX_NICHES_PER_RUN);
      if (niches.length === 0) niches = ["guitar"];
    }

    const bbKey = Deno.env.get("BRIGHTBEAN_API_KEY") || undefined;
    const results: Array<{ niche: string; creators?: number; videos?: number; scored?: number; error?: string }> = [];
    for (const niche of niches) {
      try {
        const r = await discoverNiche(supabase, auth, niche, bbKey);
        results.push({ niche, ...r });
      } catch (e) {
        results.push({ niche, error: (e as Error).message });
      }
    }

    return json({ success: true, niches: results });
  } catch (error) {
    return json({ error: (error as Error).message }, 500);
  }
});
