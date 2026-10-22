import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { detectMediaKinds, signMediaUrls, type MediaKind } from "../_shared/media.ts";

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
 * (null → 'publishing') to prevent duplicate publishes. It only ever sees
 * provider 'direct' rows: claim_due_posts is an allowlist, so Post for Me (or
 * any provider added later) can't be double-published by this cron.
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
  kinds: MediaKind[],
  caption: string
): Promise<string> {
  const isVideo = kinds.includes("video");

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
  kinds: MediaKind[],
  caption: string,
  contentType?: string
): Promise<string> {
  const videoUrl = mediaUrls.find((_, i) => kinds[i] === "video") || mediaUrls[0];

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
  kinds: MediaKind[],
  caption: string
): Promise<string> {
  const videoUrl = mediaUrls.find((_, i) => kinds[i] === "video") || mediaUrls[0];

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
    // claim_due_posts() does a single UPDATE ... WHERE ... FOR UPDATE SKIP LOCKED
    // RETURNING, so two concurrent cron runs claim disjoint sets (no
    // double-publish), and it claims ONLY provider='direct' rows. It used to
    // exclude 'postforme' by name, and before that it didn't, which published
    // every Compose-scheduled post twice. An allowlist means a new provider is
    // left alone by default. See migration 20261022130000.
    const { data: duePosts, error: fetchError } = await supabase
      .rpc("claim_due_posts", { p_limit: 20 });

    if (fetchError) throw fetchError;
    if (!duePosts || duePosts.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Claimed ${duePosts.length} post(s) for publishing`);

    // ── Dispatch each post to its platform publisher ─────────────────────────
    const results: PublishResult[] = [];

    for (const post of duePosts) {
      const { id: postId, user_id: userId, platform, caption, media_urls: mediaUrls, content_type: postContentType } = post;
      const storedUrls: string[] = Array.isArray(mediaUrls) ? mediaUrls : [];

      console.log(`Publishing post ${postId} to ${platform}...`);

      try {
        // The media bucket is private and the platform fetches the file
        // itself, so hand it a 24-hour signed URL. Foreign URLs pass through.
        const urls = await signMediaUrls(supabase, storedUrls);
        // Video vs image comes from the Content-Type the host serves, not the
        // URL's extension (see detectMediaKind).
        const kinds = await detectMediaKinds(urls);
        let platformPostId: string;

        switch (platform) {
          case "instagram":
            platformPostId = await publishInstagram(supabaseUrl, supabaseKey, userId, urls, kinds, caption || "");
            break;
          case "youtube":
            platformPostId = await publishYouTube(supabaseUrl, supabaseKey, userId, urls, kinds, caption || "", postContentType || "video");
            break;
          case "tiktok":
            platformPostId = await publishTikTok(supabaseUrl, supabaseKey, userId, urls, kinds, caption || "");
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

        // ── Failure: record the attempt ──────────────────────────────────────
        // record_publish_failure stamps last_attempt_at (claim_due_posts
        // retries 30 min later) and, on the last allowed attempt, moves the
        // post to status 'failed' so it shows as failed instead of sitting on
        // the calendar as a past "scheduled" post forever.
        const { data: terminal, error: recordError } = await supabase.rpc("record_publish_failure", {
          p_post_id: postId,
          p_error: errorMsg,
        });
        if (recordError) console.error(`Could not record failure for ${postId}:`, recordError.message);
        else if (terminal) console.warn(`Post ${postId} failed its last attempt; marked failed`);

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
