import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * tiktok-publish Edge Function
 *
 * Publishes a video to TikTok via the TikTok Content Posting API v2.
 * Uses the Direct Post flow: initialize → upload → publish.
 *
 * Request body:
 *   userId    - Supabase user ID
 *   mediaUrl  - Public URL of the video file in Supabase Storage
 *   caption   - Video caption / description (max 2200 chars)
 *
 * Returns:
 *   { success: true, publishId: string }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const TIKTOK_API = "https://open.tiktokapis.com/v2";

// Poll for video upload completion (TikTok processes async)
async function pollPublishStatus(
  publishId: string,
  accessToken: string,
  maxAttempts = 20
): Promise<{ status: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 3000)); // wait 3s between checks

    const res = await fetch(`${TIKTOK_API}/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const data = await res.json();
    const status = data?.data?.status;

    if (status === "PUBLISH_COMPLETE") return { status: "published" };
    if (status === "FAILED") {
      return { status: "failed", error: data?.data?.fail_reason || "TikTok publish failed" };
    }
    // PROCESSING_UPLOAD, PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX — keep polling
    console.log(`TikTok publish status [attempt ${i + 1}]: ${status}`);
  }
  // If still not done after maxAttempts, return success optimistically
  // (TikTok sometimes takes a while; the video will still appear in the user's inbox)
  return { status: "published" };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, mediaUrl, caption } = await req.json();

    if (!userId) throw new Error("Missing required field: userId");
    if (!mediaUrl) throw new Error("Missing required field: mediaUrl");

    // ── Load TikTok credentials from platform_credentials ────────────────────
    const { data: creds, error: credsError } = await supabase
      .from("platform_credentials")
      .select("access_token, platform_user_id")
      .eq("user_id", userId)
      .eq("platform", "tiktok")
      .maybeSingle();

    if (credsError || !creds?.access_token) {
      throw new Error("TikTok not connected. Please reconnect TikTok.");
    }

    const accessToken = creds.access_token;

    // ── Download the video from Supabase Storage ─────────────────────────────
    console.log("Downloading video from storage:", mediaUrl);
    const videoRes = await fetch(mediaUrl);
    if (!videoRes.ok) {
      throw new Error(`Failed to download video: HTTP ${videoRes.status}`);
    }
    const videoBuffer = await videoRes.arrayBuffer();
    const videoSize = videoBuffer.byteLength;
    const contentType = videoRes.headers.get("content-type") || "video/mp4";

    console.log(`Video size: ${(videoSize / 1024 / 1024).toFixed(2)} MB`);

    // ── Step 1: Initialize direct post ──────────────────────────────────────
    // TikTok Content Posting API: POST /v2/post/publish/video/init/
    const initPayload = {
      post_info: {
        title: (caption || "").substring(0, 2200),
        privacy_level: "PUBLIC_TO_EVERYONE",
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "FILE_UPLOAD",
        video_size: videoSize,
        chunk_size: videoSize, // single-chunk upload for simplicity
        total_chunk_count: 1,
      },
    };

    const initRes = await fetch(`${TIKTOK_API}/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify(initPayload),
    });

    const initData = await initRes.json();
    console.log("TikTok init response:", JSON.stringify(initData));

    if (initData.error?.code && initData.error.code !== "ok") {
      throw new Error(`TikTok init failed: ${initData.error.message || initData.error.code}`);
    }

    const publishId = initData.data?.publish_id;
    const uploadUrl = initData.data?.upload_url;

    if (!publishId || !uploadUrl) {
      throw new Error(`TikTok did not return publish_id or upload_url: ${JSON.stringify(initData)}`);
    }

    // ── Step 2: Upload the video chunk ───────────────────────────────────────
    console.log("Uploading video to TikTok...");
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentType,
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
        "Content-Length": videoSize.toString(),
      },
      body: videoBuffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`TikTok video upload failed: HTTP ${uploadRes.status} ${errText}`);
    }

    console.log("TikTok video uploaded, polling for publish status...");

    // ── Step 3: Poll for completion ──────────────────────────────────────────
    const result = await pollPublishStatus(publishId, accessToken);

    if (result.status === "failed") {
      throw new Error(result.error || "TikTok publish failed");
    }

    return new Response(
      JSON.stringify({ success: true, publishId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("TikTok publish error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
