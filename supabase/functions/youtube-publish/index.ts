import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * youtube-publish Edge Function
 *
 * Uploads a video to YouTube via the YouTube Data API v3.
 * Handles access-token refresh automatically before uploading.
 *
 * Request body:
 *   userId    - Supabase user ID
 *   mediaUrl  - Public URL of the video file in Supabase Storage
 *   caption   - Video description (first line used as title, full text as description)
 *   title     - Optional explicit video title (falls back to first caption line)
 *
 * Returns:
 *   { success: true, videoId: string, videoUrl: string }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function refreshYouTubeToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
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
    throw new Error(`Token refresh failed: ${data.error_description || data.error}`);
  }
  return { access_token: data.access_token, expires_in: data.expires_in || 3600 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("YOUTUBE_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");

    if (!clientSecret) {
      throw new Error("YOUTUBE_CLIENT_SECRET not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, mediaUrl, caption, title: explicitTitle } = await req.json();

    if (!userId) throw new Error("Missing required field: userId");
    if (!mediaUrl) throw new Error("Missing required field: mediaUrl");

    // ── Load YouTube credentials ─────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("youtube_access_token, youtube_refresh_token, youtube_token_expires_at, youtube_channel_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) throw new Error("Failed to load user profile");
    if (!profile.youtube_refresh_token) {
      throw new Error("YouTube not connected. Please reconnect YouTube to grant upload permissions.");
    }

    // ── Refresh token if expired (or within 5 minutes of expiry) ─────────────
    let accessToken = profile.youtube_access_token;
    const expiresAt = profile.youtube_token_expires_at
      ? new Date(profile.youtube_token_expires_at).getTime()
      : 0;
    const fiveMinutes = 5 * 60 * 1000;

    if (!accessToken || Date.now() + fiveMinutes >= expiresAt) {
      console.log("Refreshing YouTube access token...");
      const refreshed = await refreshYouTubeToken(
        profile.youtube_refresh_token,
        clientId,
        clientSecret
      );
      accessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();

      await supabase
        .from("profiles")
        .update({
          youtube_access_token: accessToken,
          youtube_token_expires_at: newExpiry,
        })
        .eq("id", userId);
    }

    // ── Derive title and description from caption ────────────────────────────
    const lines = (caption || "").trim().split("\n");
    const videoTitle = explicitTitle || lines[0]?.substring(0, 100) || "New Video";
    const videoDescription = caption || "";

    // ── Download the video from Supabase Storage ─────────────────────────────
    console.log("Downloading video from storage:", mediaUrl);
    const videoRes = await fetch(mediaUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video: HTTP ${videoRes.status}`);
    }
    const videoBlob = await videoRes.blob();
    const contentType = videoRes.headers.get("content-type") || "video/mp4";
    const videoSize = videoBlob.size;

    console.log(`Video size: ${(videoSize / 1024 / 1024).toFixed(2)} MB, type: ${contentType}`);

    // ── Initiate resumable upload ─────────────────────────────────────────────
    const metadata = {
      snippet: {
        title: videoTitle,
        description: videoDescription,
        categoryId: "22", // People & Blogs
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
      },
    };

    const initRes = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": videoSize.toString(),
        },
        body: JSON.stringify(metadata),
      }
    );

    if (!initRes.ok) {
      const errBody = await initRes.text();
      throw new Error(`Failed to initiate YouTube upload: ${initRes.status} ${errBody}`);
    }

    const uploadUrl = initRes.headers.get("location");
    if (!uploadUrl) {
      throw new Error("YouTube did not return an upload URL");
    }

    // ── Upload the video content ──────────────────────────────────────────────
    console.log("Uploading video to YouTube...");
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Length": videoSize.toString(),
      },
      body: videoBlob,
    });

    if (!uploadRes.ok) {
      const errBody = await uploadRes.text();
      throw new Error(`YouTube upload failed: ${uploadRes.status} ${errBody}`);
    }

    const uploadData = await uploadRes.json();
    const videoId = uploadData.id;

    if (!videoId) {
      throw new Error(`YouTube upload succeeded but no video ID returned: ${JSON.stringify(uploadData)}`);
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    console.log("YouTube video published:", videoUrl);

    return new Response(
      JSON.stringify({ success: true, videoId, videoUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("YouTube publish error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
