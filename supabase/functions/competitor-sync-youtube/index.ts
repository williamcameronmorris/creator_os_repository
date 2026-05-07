import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FREE_TIER_LIMIT = 1;
const PAID_TIER_LIMIT = 10;

async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string; expiresAt: string }> {
  const clientId = Deno.env.get("YOUTUBE_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET") || "";
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (data.error) {
    const desc = data.error_description || data.error;
    if (data.error === "invalid_grant" || desc?.includes("Bad Request") || desc?.includes("revoked")) {
      throw new Error(`YouTube token expired. Go to Settings → disconnect YouTube → reconnect it to fix this.`);
    }
    throw new Error(`Token refresh failed: ${desc}`);
  }
  return { accessToken: data.access_token, expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString() };
}

function normalizeHandle(input: string): { handle: string; channelIdHint: string | null } {
  let s = input.trim();
  // Channel URL: https://www.youtube.com/channel/UCxxx
  const idMatch = s.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (idMatch) return { handle: s, channelIdHint: idMatch[1] };
  // Handle URL: https://www.youtube.com/@handle
  const handleMatch = s.match(/youtube\.com\/(@[\w.-]+)/i);
  if (handleMatch) s = handleMatch[1];
  if (!s.startsWith("@") && !s.startsWith("UC")) s = "@" + s.replace(/^\/+/, "");
  return { handle: s, channelIdHint: s.startsWith("UC") ? s : null };
}

async function resolveChannel(accessToken: string, raw: string): Promise<{ channelId: string; snippet: any; statistics: any } | null> {
  const { handle, channelIdHint } = normalizeHandle(raw);

  // Direct channel id lookup
  if (channelIdHint) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${encodeURIComponent(channelIdHint)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (r.ok) {
      const d = await r.json();
      const item = d.items?.[0];
      if (item) return { channelId: item.id, snippet: item.snippet, statistics: item.statistics };
    }
  }

  // forHandle lookup (modern @handles)
  if (handle.startsWith("@")) {
    const r = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&forHandle=${encodeURIComponent(handle)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (r.ok) {
      const d = await r.json();
      const item = d.items?.[0];
      if (item) return { channelId: item.id, snippet: item.snippet, statistics: item.statistics };
    }
  }

  // Search fallback
  const q = handle.replace(/^@/, "");
  const sr = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(q)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!sr.ok) return null;
  const sd = await sr.json();
  const channelId = sd.items?.[0]?.snippet?.channelId || sd.items?.[0]?.id?.channelId;
  if (!channelId) return null;
  const r2 = await fetch(
    `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${channelId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!r2.ok) return null;
  const d2 = await r2.json();
  const item = d2.items?.[0];
  if (!item) return null;
  return { channelId: item.id, snippet: item.snippet, statistics: item.statistics };
}

interface SyncBody {
  action?: "add" | "sync" | "remove";
  handle?: string;
  competitorId?: string;
  userId?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    let body: SyncBody = {};
    try { body = await req.json(); } catch { /* empty body ok */ }

    function isServiceRoleJwt(tok: string): boolean {
      try {
        const parts = tok.split(".");
        if (parts.length !== 3) return false;
        const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
        return payload?.role === "service_role";
      } catch { return false; }
    }

    let userId: string;
    if (isServiceRoleJwt(jwt)) {
      if (!body.userId) {
        return new Response(JSON.stringify({ error: "userId required in body for service-role calls" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = body.userId;
    } else {
      const anon = createClient(supabaseUrl, supabaseAnonKey);
      const { data: { user }, error: userError } = await anon.auth.getUser(jwt);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const action = body.action || "sync";

    // Remove path doesn't need a YouTube token
    if (action === "remove") {
      if (!body.competitorId) {
        return new Response(JSON.stringify({ error: "competitorId required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("competitor_channels").delete()
        .eq("id", body.competitorId).eq("user_id", userId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pull YouTube tokens from profile (mirrors youtube-sync)
    const { data: profile } = await supabase
      .from("profiles")
      .select("youtube_access_token, youtube_refresh_token, youtube_token_expires_at, subscription_tier")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.youtube_access_token && !profile?.youtube_refresh_token) {
      throw new Error("YouTube not connected. Connect YouTube in Settings to track competitors.");
    }
    let accessToken: string | null = profile.youtube_access_token;
    const refreshToken: string | null = profile.youtube_refresh_token;
    const expiresAt = profile.youtube_token_expires_at ? new Date(profile.youtube_token_expires_at).getTime() : 0;
    if ((!accessToken || Date.now() > expiresAt - 5 * 60 * 1000) && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      await supabase.from("profiles")
        .update({ youtube_access_token: accessToken, youtube_token_expires_at: refreshed.expiresAt })
        .eq("id", userId);
    }
    if (!accessToken) throw new Error("YouTube access token unavailable after refresh attempt");

    const isPaid = profile?.subscription_tier === "paid";
    const limit = isPaid ? PAID_TIER_LIMIT : FREE_TIER_LIMIT;
    const today = new Date().toISOString().split("T")[0];

    async function snapshot(competitor: { id: string; channel_id: string }) {
      const r = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${competitor.channel_id}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!r.ok) return null;
      const d = await r.json();
      const item = d.items?.[0];
      if (!item) return null;
      const subscriberCount = parseInt(item.statistics?.subscriberCount || "0");
      const videoCount = parseInt(item.statistics?.videoCount || "0");
      const viewCount = parseInt(item.statistics?.viewCount || "0");
      const avgViews = videoCount > 0 ? viewCount / videoCount : 0;
      const thumbs = item.snippet?.thumbnails || {};
      const thumbnailUrl = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";

      await supabase.from("competitor_channels").update({
        title: item.snippet?.title || "",
        thumbnail_url: thumbnailUrl,
        description: item.snippet?.description || "",
        subscriber_count: subscriberCount,
        video_count: videoCount,
        view_count: viewCount,
        avg_views_per_video: avgViews,
        last_pulled_at: new Date().toISOString(),
      }).eq("id", competitor.id).eq("user_id", userId);

      await supabase.from("competitor_metrics").upsert({
        competitor_id: competitor.id,
        user_id: userId,
        date: today,
        subscriber_count: subscriberCount,
        video_count: videoCount,
        view_count: viewCount,
      }, { onConflict: "competitor_id,date" });

      return { channelId: competitor.channel_id, subscriberCount, videoCount, viewCount };
    }

    if (action === "add") {
      if (!body.handle) {
        return new Response(JSON.stringify({ error: "handle required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { count } = await supabase
        .from("competitor_channels")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("platform", "youtube");
      if ((count ?? 0) >= limit) {
        return new Response(JSON.stringify({
          error: `Competitor limit reached (${limit}). ${isPaid ? "Remove a competitor to add another." : "Upgrade to track up to 10."}`,
          limitReached: true,
        }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const resolved = await resolveChannel(accessToken, body.handle);
      if (!resolved) {
        return new Response(JSON.stringify({ error: `Could not find a YouTube channel matching "${body.handle}"` }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: existing } = await supabase
        .from("competitor_channels")
        .select("id")
        .eq("user_id", userId)
        .eq("platform", "youtube")
        .eq("channel_id", resolved.channelId)
        .maybeSingle();
      if (existing) {
        return new Response(JSON.stringify({ error: "Already tracking this channel" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const subscriberCount = parseInt(resolved.statistics?.subscriberCount || "0");
      const videoCount = parseInt(resolved.statistics?.videoCount || "0");
      const viewCount = parseInt(resolved.statistics?.viewCount || "0");
      const thumbs = resolved.snippet?.thumbnails || {};
      const thumbnailUrl = thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";

      const { data: inserted, error: insertError } = await supabase
        .from("competitor_channels")
        .insert({
          user_id: userId,
          platform: "youtube",
          handle: body.handle,
          channel_id: resolved.channelId,
          title: resolved.snippet?.title || "",
          thumbnail_url: thumbnailUrl,
          description: resolved.snippet?.description || "",
          subscriber_count: subscriberCount,
          video_count: videoCount,
          view_count: viewCount,
          avg_views_per_video: videoCount > 0 ? viewCount / videoCount : 0,
          last_pulled_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      await supabase.from("competitor_metrics").upsert({
        competitor_id: inserted.id,
        user_id: userId,
        date: today,
        subscriber_count: subscriberCount,
        video_count: videoCount,
        view_count: viewCount,
      }, { onConflict: "competitor_id,date" });

      return new Response(JSON.stringify({ success: true, competitorId: inserted.id, channelId: resolved.channelId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Default: sync (refresh stats for all of this user's competitors)
    const { data: competitors } = await supabase
      .from("competitor_channels")
      .select("id, channel_id")
      .eq("user_id", userId)
      .eq("platform", "youtube");

    let synced = 0;
    for (const c of competitors || []) {
      const result = await snapshot(c);
      if (result) synced++;
    }

    return new Response(JSON.stringify({ success: true, synced }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Competitor YouTube sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
