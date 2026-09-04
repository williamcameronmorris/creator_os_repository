import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * youtube-sync
 *
 * SCOPE (2026-08-22): SUBSCRIBER COUNTS ONLY.
 *
 * Per-post metrics and the engagement roll-up for all five platforms come from
 * postforme-sync via the Post for Me feed. PFM exposes no follower or
 * subscriber field anywhere, so this function exists purely to supply that.
 *
 * Two bugs this scope change retires:
 *
 *  1. It wrote the bare views/likes/comments columns on platform_metrics, which
 *     are GENERATED ALWAYS from their total_ counterparts. Postgres rejects
 *     that with 428C9, and the old code never checked the upsert error, so it
 *     returned success while writing no channel metrics at all.
 *  2. It stored the YouTube Analytics API's 90-day windowed view count in
 *     content_posts.views, while Post for Me stores lifetime views. One column,
 *     two incompatible meanings, which dragged the YouTube median from 1,457
 *     down to 278 and poisoned every benchmark computed off it.
 *
 * The upsert payload is the enforcement: supabase-js only SETs the columns
 * present in it, so naming just followers_count and total_posts leaves
 * postforme-sync's columns intact. Do not add metric columns back here.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET") || "";
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
  if (data.error) {
    const desc = data.error_description || data.error;
    // Google revokes refresh tokens after 7 days while the OAuth consent screen
    // is still in Testing mode, so invalid_grant here is usually about
    // publishing the app rather than anything the user did.
    if (data.error === "invalid_grant" || desc?.includes("Bad Request") || desc?.includes("revoked")) {
      throw new Error(
        "YouTube refresh token rejected by Google (invalid_grant). Reconnect from Office > Connections. " +
        "Publish the Google OAuth consent screen to Production first — while it is in Testing, Google " +
        "expires refresh tokens after 7 days and the reconnect will fail again within the week."
      );
    }
    throw new Error(`Token refresh failed: ${desc}`);
  }
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString(),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("Cron_Secret");

    // Resolve caller. Cron first, so it needs no Authorization header. See the
    // instagram-sync header for why the service-role bearer comparison alone
    // was not enough.
    let body: { userId?: string; cronSecret?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok for user mode */ }

    const isCron = !!body.cronSecret && !!cronSecret && body.cronSecret === cronSecret;

    let userId: string;
    if (isCron) {
      if (!body.userId) {
        return new Response(JSON.stringify({ error: "userId required in body for cron calls" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = body.userId;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const jwt = authHeader.replace(/^Bearer\s+/i, "");
      const isServiceRole = jwt.trim() !== "" && jwt.trim() === supabaseKey.trim();

      if (isServiceRole) {
        if (!body.userId) {
          return new Response(JSON.stringify({ error: "userId required in body for service-role calls" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        userId = body.userId;
      } else {
        const anon = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error: userError } = await anon.auth.getUser(jwt);
        if (userError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        userId = user.id;
      }
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Follower counts are per brand, and brands are isolated. The direct grant
    // lives on profiles (one per user), so v1 attributes it to the owner's
    // default brand — the first one created, i.e. the backfilled one. Office >
    // Connections will let this be reassigned explicitly later.
    const { data: brand, error: brandErr } = await supabase
      .from("brands").select("id").eq("owner_id", userId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (brandErr || !brand) throw new Error(`No brand for user ${userId}; the brands backfill has not run`);

    // Always read tokens from the profile, never trust tokens from the body.
    const { data: profile } = await supabase
      .from("profiles")
      .select("youtube_access_token, youtube_refresh_token, youtube_token_expires_at")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.youtube_access_token && !profile?.youtube_refresh_token) {
      throw new Error("YouTube not connected");
    }

    let accessToken: string | null = profile.youtube_access_token;
    const refreshToken: string | null = profile.youtube_refresh_token;
    const expiresAt = profile.youtube_token_expires_at
      ? new Date(profile.youtube_token_expires_at).getTime()
      : 0;

    if ((!accessToken || Date.now() > expiresAt - 5 * 60 * 1000) && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      await supabase
        .from("profiles")
        .update({ youtube_access_token: accessToken, youtube_token_expires_at: refreshed.expiresAt })
        .eq("id", userId);
    }
    if (!accessToken) throw new Error("YouTube access token unavailable after refresh attempt");

    // Channel statistics only. No search or videos calls: per-post data is
    // PFM's job, and those calls burned most of the daily quota.
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!channelRes.ok) throw new Error(`Channel API error: ${channelRes.statusText}`);
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];
    if (!channel) throw new Error("No YouTube channel found");

    const channelId = channel.id;
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || "0");
    const totalVideoCount = parseInt(channel.statistics?.videoCount || "0");
    const today = new Date().toISOString().split("T")[0];

    await supabase
      .from("profiles")
      .update({
        youtube_handle: channel.snippet?.title || "",
        youtube_followers: subscriberCount,
        youtube_channel_id: channelId,
        last_youtube_sync: new Date().toISOString(),
      })
      .eq("id", userId);

    await supabase.from("platform_credentials").upsert(
      {
        user_id: userId,
        platform: "youtube",
        platform_user_id: channelId,
        platform_username: channel.snippet?.title || "",
        last_synced_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    );

    // followers_count and total_posts ONLY. See the header.
    const { error: metricsError } = await supabase.from("platform_metrics").upsert(
      {
        user_id: userId,
        brand_id: brand.id,
        platform: "youtube",
        date: today,
        followers_count: subscriberCount,
        total_posts: totalVideoCount,
      },
      { onConflict: "brand_id,platform,date,social_account_key" }
    );

    if (metricsError) console.error("platform_metrics upsert error:", metricsError);

    return new Response(
      JSON.stringify({
        success: true,
        subscriberCount,
        totalVideos: totalVideoCount,
        metricsError: metricsError?.message ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("YouTube sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
