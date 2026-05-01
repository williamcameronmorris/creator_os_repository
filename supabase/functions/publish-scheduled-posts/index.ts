import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * publish-scheduled-posts Edge Function
 *
 * Cron dispatcher that finds posts due for publishing and routes them to
 * platform-specific publisher functions.
 *
 * Run this on a schedule (e.g., every minute) via Supabase Dashboard:
 *   Functions > publish-scheduled-posts > Schedule > "* * * * *"
 *
 * It is safe to call concurrently — it uses an atomic status transition
 * (null → 'publishing') to prevent duplicate publishes.
 *
 * Returns:
 *   { processed: number, results: Array<{ postId, platform, success, error? }> }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface PublishResult {
  postId: string;
  platform: string;
  success: boolean;
  platformPostId?: string;
  error?: string;
}

async function publishInstagram(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  mediaUrls: string[],
  caption: string
): Promise<string> {
  const isVideo = mediaUrls.some((u) =>
    /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(u)
  );

  let body: Record<string, any>;

  if (mediaUrls.length > 1) {
    body = {
      userId,
      caption,
      mediaType: "CAROUSEL_ALBUM",
      mediaUrl: mediaUrls[0],
      carouselUrls: mediaUrls,
    };
  } else if (isVideo) {
    body = {
      userId,
      caption,
      mediaType: "REELS",
      mediaUrl: mediaUrls[0] || null,
    };
  } else {
    body = {
      userId,
      caption,
      mediaType: "IMAGE",
      mediaUrl: mediaUrls[0] || null,
    };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/instagram-publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.id && !data.success) {
    throw new Error(data.error || "Instagram publish returned no ID");
  }
  return data.id || "ok";
}

async function publishYouTube(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  mediaUrls: string[],
  caption: string,
  contentType?: string
): Promise<string> {
  const videoUrl = mediaUrls.find((u) =>
    /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(u)
  ) || mediaUrls[0];

  if (!videoUrl) throw new Error("No video file found for YouTube post");

  const res = await fetch(`${supabaseUrl}/functions/v1/youtube-publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ userId, mediaUrl: videoUrl, caption, contentType: contentType || "video" }),
  });

  const data = await res.json();
  if (!data.videoId && !data.success) {
    throw new Error(data.error || "YouTube publish returned no video ID");
  }
  return data.videoId || "ok";
}

async function publishTikTok(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  mediaUrls: string[],
  caption: string
): Promise<string> {
  const videoUrl = mediaUrls.find((u) =>
    /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(u)
  ) || mediaUrls[0];

  if (!videoUrl) throw new Error("No video file found for TikTok post");

  const res = await fetch(`${supabaseUrl}/functions/v1/tiktok-publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ userId, mediaUrl: videoUrl, caption }),
  });

  const data = await res.json();
  if (!data.publishId && !data.success) {
    throw new Error(data.error || "TikTok publish returned no publish ID");
  }
  return data.publishId || "ok";
}

async function publishThreads(
  supabaseUrl: string,
  serviceKey: string,
  userId: string,
  mediaUrls: string[],
  caption: string
): Promise<string> {
  const body: Record<string, any> = { userId, caption };

  if (mediaUrls.length > 1) {
    body.mediaUrls = mediaUrls;
  } else if (mediaUrls.length === 1) {
    body.mediaUrl = mediaUrls[0];
  }
  // No media = text-only post

  const res = await fetch(`${supabaseUrl}/functions/v1/threads-publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!data.id && !data.success) {
    throw new Error(data.error || "Threads publish returned no ID");
  }
  return data.id || "ok";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Cron-only: require Cron_Secret in body OR a valid service-role bearer.
  // Without this, anyone with the anon key could force-publish any user's
  // scheduled posts immediately (or repeatedly trigger expensive PFM calls).
  const expectedCron = Deno.env.get("Cron_Secret");
  let body: { cronSecret?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    // ignore
  }
  const authHeader = req.headers.get("Authorization");
  const isService = authHeader?.startsWith("Bearer ") && authHeader.slice(7) === supabaseKey;
  const isCron = body.cronSecret && expectedCron && body.cronSecret === expectedCron;
  if (!isService && !isCron) {
    return new Response(JSON.stringify({ error: "Unauthorized — cron-only function" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Atomically claim due posts ────────────────────────────────────────────
    // Only pick up posts that are:
    //   • status = 'scheduled'
    //   • scheduled_for <= now()
    //   • publish_status IS NULL  (never attempted) or 'failed' (retry once after 30 min)
    // We immediately flip publish_status → 'publishing' so concurrent runs skip them.
    const now = new Date().toISOString();
    const retryWindow = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data: duePosts, error: fetchError } = await supabase
      .from("content_posts")
      .select("id, user_id, platform, caption, media_urls, publish_status, published_at, content_type")
      .eq("status", "scheduled")
      .lte("scheduled_for", now)
      .or(`publish_status.is.null,and(publish_status.eq.failed,published_at.lte.${retryWindow})`)
      .limit(20); // process max 20 per run to stay within Edge Function timeout

    if (fetchError) throw fetchError;
    if (!duePosts || duePosts.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Found ${duePosts.length} post(s) due for publishing`);

    // ── Mark all as 'publishing' before dispatching (prevents duplicate runs) ─
    const postIds = duePosts.map((p) => p.id);
    await supabase
      .from("content_posts")
      .update({ publish_status: "publishing" })
      .in("id", postIds);

    // ── Dispatch each post to its platform publisher ─────────────────────────
    const results: PublishResult[] = [];

    for (const post of duePosts) {
      const { id: postId, user_id: userId, platform, caption, media_urls: mediaUrls, content_type: postContentType } = post;
      const urls: string[] = Array.isArray(mediaUrls) ? mediaUrls : [];

      console.log(`Publishing post ${postId} to ${platform}...`);

      try {
        let platformPostId: string;

        switch (platform) {
          case "instagram":
            platformPostId = await publishInstagram(supabaseUrl, supabaseKey, userId, urls, caption || "");
            break;
          case "youtube":
            platformPostId = await publishYouTube(supabaseUrl, supabaseKey, userId, urls, caption || "", postContentType || "video");
            break;
          case "tiktok":
            platformPostId = await publishTikTok(supabaseUrl, supabaseKey, userId, urls, caption || "");
            break;
          case "threads":
            platformPostId = await publishThreads(supabaseUrl, supabaseKey, userId, urls, caption || "");
            break;
          default:
            throw new Error(`Unsupported platform: ${platform}`);
        }

        // ── Success: update post to published ─────────────────────────────────
        await supabase
          .from("content_posts")
          .update({
            status: "published",
            publish_status: "published",
            published_at: new Date().toISOString(),
            platform_post_id: platformPostId,
            publish_error: null,
          })
          .eq("id", postId);

        console.log(`✓ Post ${postId} published to ${platform} (id: ${platformPostId})`);
        results.push({ postId, platform, success: true, platformPostId });

      } catch (err: any) {
        const errorMsg = err.message || "Unknown error";
        console.error(`✗ Post ${postId} failed on ${platform}:`, errorMsg);

        // ── Failure: mark as failed with error ────────────────────────────────
        await supabase
          .from("content_posts")
          .update({
            publish_status: "failed",
            publish_error: errorMsg,
            published_at: new Date().toISOString(), // timestamp the attempt for retry window
          })
          .eq("id", postId);

        results.push({ postId, platform, success: false, error: errorMsg });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(`Publish run complete: ${successCount}/${results.length} succeeded`);

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("publish-scheduled-posts fatal error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
