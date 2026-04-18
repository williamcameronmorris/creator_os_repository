import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

function parseDuration(iso: string): number {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  return (parseInt(match[1] || "0") * 3600) + (parseInt(match[2] || "0") * 60) + parseInt(match[3] || "0");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify caller's session JWT; derive userId from the token, not the body.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await anon.auth.getUser(jwt);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = user.id;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── Always fetch tokens from the profile — never trust tokens from the body.
    const { data: profile } = await supabase.from("profiles").select("youtube_access_token, youtube_refresh_token, youtube_token_expires_at").eq("id", userId).maybeSingle();
    if (!profile?.youtube_access_token && !profile?.youtube_refresh_token) throw new Error("YouTube not connected");
    let accessToken: string | null = profile.youtube_access_token;
    const refreshToken: string | null = profile.youtube_refresh_token;
    const expiresAt = profile.youtube_token_expires_at ? new Date(profile.youtube_token_expires_at).getTime() : 0;
    if ((!accessToken || Date.now() > expiresAt - 5 * 60 * 1000) && refreshToken) {
      const refreshed = await refreshAccessToken(refreshToken);
      accessToken = refreshed.accessToken;
      await supabase.from("profiles").update({ youtube_access_token: accessToken, youtube_token_expires_at: refreshed.expiresAt }).eq("id", userId);
    }
    if (!accessToken) throw new Error("YouTube access token unavailable after refresh attempt");

    const channelRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!channelRes.ok) throw new Error(`Channel API error: ${channelRes.statusText}`);
    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];
    if (!channel) throw new Error("No YouTube channel found");

    const channelId = channel.id;
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || "0");
    const totalVideoCount = parseInt(channel.statistics?.videoCount || "0");
    const today = new Date().toISOString().split("T")[0];

    await supabase.from("profiles").update({ youtube_handle: channel.snippet?.title || "", youtube_followers: subscriberCount, youtube_channel_id: channelId, last_youtube_sync: new Date().toISOString() }).eq("id", userId);

    let allVideoItems: any[] = [];
    let pageToken: string | null = null;
    let pagesFetched = 0;
    do {
      const url = new URL("https://www.googleapis.com/youtube/v3/search");
      url.searchParams.set("part", "snippet"); url.searchParams.set("forMine", "true");
      url.searchParams.set("type", "video"); url.searchParams.set("maxResults", "50");
      url.searchParams.set("order", "date");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const r = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) break;
      const d = await r.json();
      allVideoItems = allVideoItems.concat(d.items || []);
      pageToken = d.nextPageToken || null;
      pagesFetched++;
    } while (pageToken && pagesFetched < 4);

    if (allVideoItems.length === 0) return new Response(JSON.stringify({ success: true, videosCount: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const videoStatsMap: Record<string, any> = {};
    for (let i = 0; i < allVideoItems.length; i += 50) {
      const ids = allVideoItems.slice(i, i + 50).map((v: any) => v.id.videoId).join(",");
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${ids}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r.ok) { const d = await r.json(); for (const item of (d.items || [])) videoStatsMap[item.id] = item; }
    }

    const analyticsMap: Record<string, any> = {};
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const analyticsRes = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${channelId}&startDate=${ninetyDaysAgo}&endDate=${today}&metrics=estimatedMinutesWatched,averageViewDuration,impressions,impressionsClickThroughRate,views,likes,comments&dimensions=video&maxResults=200&sort=-views`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (analyticsRes.ok) {
      const analyticsData = await analyticsRes.json();
      const headers: string[] = (analyticsData.columnHeaders || []).map((h: any) => h.name);
      const videoIdx = headers.indexOf("video");
      for (const row of (analyticsData.rows || [])) {
        const videoId = row[videoIdx];
        const entry: Record<string, any> = {};
        headers.forEach((h: string, i: number) => { entry[h] = row[i]; });
        analyticsMap[videoId] = entry;
      }
    }

    let totalViews = 0, totalLikes = 0, totalComments = 0, processedCount = 0;

    for (const video of allVideoItems) {
      const videoId = video.id.videoId;
      const details = videoStatsMap[videoId];
      const analytics = analyticsMap[videoId];
      const viewCount = parseInt(details?.statistics?.viewCount || "0");
      const likeCount = parseInt(details?.statistics?.likeCount || "0");
      const commentCount = parseInt(details?.statistics?.commentCount || "0");
      const durationSeconds = parseDuration(details?.contentDetails?.duration || "PT0S");
      const isShort = durationSeconds > 0 && durationSeconds <= 60;
      const thumbs = details?.snippet?.thumbnails || video.snippet?.thumbnails || {};
      const thumbnailUrl = thumbs.maxres?.url || thumbs.high?.url || thumbs.medium?.url || thumbs.default?.url || "";
      const publishedAt = video.snippet?.publishedAt || details?.snippet?.publishedAt || null;

      totalViews += viewCount; totalLikes += likeCount; totalComments += commentCount;

      const { data: existing } = await supabase.from("content_posts").select("id").eq("youtube_video_id", videoId).eq("user_id", userId).maybeSingle();
      const postData = {
        user_id: userId, platform: "youtube",
        title: details?.snippet?.title || video.snippet?.title || "",
        caption: details?.snippet?.description || video.snippet?.description || "",
        media_url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail_url: thumbnailUrl,
        media_type: isShort ? "short" : "video",
        content_type: isShort ? "short" : "video",
        youtube_video_id: videoId,
        published_date: publishedAt, published_at: publishedAt, status: "published",
        views: analytics?.views ? parseInt(analytics.views) : viewCount,
        likes: analytics?.likes ? parseInt(analytics.likes) : likeCount,
        comments: analytics?.comments ? parseInt(analytics.comments) : commentCount,
        engagement_rate: viewCount > 0 ? ((likeCount + commentCount) / viewCount) * 100 : 0,
      };
      if (!existing) { await supabase.from("content_posts").insert(postData); }
      else { await supabase.from("content_posts").update(postData).eq("id", existing.id); }
      processedCount++;
    }

    await supabase.from("platform_metrics").upsert({
      user_id: userId, platform: "youtube", date: today,
      followers_count: subscriberCount, total_posts: totalVideoCount,
      views: totalViews, likes: totalLikes, comments: totalComments,
      avg_engagement_rate: processedCount > 0 ? allVideoItems.reduce((sum: number, v: any) => {
        const s = videoStatsMap[v.id.videoId]?.statistics;
        const vw = parseInt(s?.viewCount || "0"); const lk = parseInt(s?.likeCount || "0"); const cm = parseInt(s?.commentCount || "0");
        return sum + (vw > 0 ? ((lk + cm) / vw) * 100 : 0);
      }, 0) / processedCount : 0,
    }, { onConflict: "user_id,platform,date" });

    return new Response(JSON.stringify({ success: true, videosCount: processedCount }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("YouTube sync error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
