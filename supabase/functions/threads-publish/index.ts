import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * threads-publish Edge Function
 *
 * Publishes a text post, single image, single video, or carousel to Threads
 * via the Threads API (graph.threads.net/v1.0).
 *
 * Flow (same two-step pattern as Instagram):
 *   1. POST /{user_id}/threads        → creates a media container
 *   2. POST /{user_id}/threads_publish → publishes it
 *
 * For video containers the API needs processing time — we poll status
 * until FINISHED before publishing (max ~30 s).
 *
 * Request body:
 *   userId    - Supabase user ID (credentials looked up server-side)
 *   caption   - Post text / caption
 *   mediaUrl  - Optional public URL of image or video
 *   mediaUrls - Optional array of URLs for carousels (overrides mediaUrl)
 *
 * Returns:
 *   { success: true, id: "<threads_post_id>", postUrl: "https://www.threads.net/..." }
 */

const THREADS_API = "https://graph.threads.net/v1.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ── Token refresh ─────────────────────────────────────────────────────────────
async function refreshTokenIfNeeded(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  accessToken: string,
  expiresAt: string | null
): Promise<string> {
  if (!expiresAt) return accessToken;

  const expiryMs = new Date(expiresAt).getTime();
  const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;

  // Refresh if within 5 days of expiry (Threads tokens last 60 days)
  if (Date.now() < expiryMs - fiveDaysMs) return accessToken;

  console.log("Refreshing Threads token...");
  const url = new URL(`${THREADS_API}/refresh_access_token`);
  url.searchParams.set("grant_type", "th_refresh_token");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.error || !data.access_token) {
    console.warn("Threads token refresh failed:", data.error?.message || JSON.stringify(data));
    return accessToken; // use old token, let it fail naturally if expired
  }

  const newToken: string = data.access_token;
  const newExpiry = new Date(Date.now() + (data.expires_in || 5183944) * 1000).toISOString();

  await supabase
    .from("profiles")
    .update({ threads_access_token: newToken, threads_token_expires_at: newExpiry })
    .eq("id", userId);

  console.log("Threads token refreshed successfully");
  return newToken;
}

// ── Poll container status (needed for video) ──────────────────────────────────
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts = 12,
  intervalMs = 3000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${THREADS_API}/${containerId}?fields=status,error_message&access_token=${accessToken}`
    );
    const data = await res.json();

    if (data.status === "FINISHED") return;
    if (data.status === "ERROR") {
      throw new Error(`Threads container processing failed: ${data.error_message || "unknown error"}`);
    }

    // IN_PROGRESS or PUBLISHED — keep waiting
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  // Don't throw on timeout — attempt to publish anyway; Threads sometimes returns
  // PUBLISHED state immediately even before the poll sees it
  console.warn(`Container ${containerId} didn't reach FINISHED after polling — attempting publish anyway`);
}

// ── Detect media type from URL ────────────────────────────────────────────────
function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|avi|webm|mkv)(\?|$)/i.test(url);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, caption, mediaUrl, mediaUrls } = await req.json();

    if (!userId) throw new Error("Missing required field: userId");

    // ── Load Threads credentials ──────────────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("threads_user_id, threads_access_token, threads_token_expires_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) throw new Error("Failed to load user profile");

    const threadsUserId: string = profile.threads_user_id;
    let accessToken: string = profile.threads_access_token;

    if (!threadsUserId || !accessToken) {
      throw new Error("Threads not connected. Please connect Threads in Settings first.");
    }

    // Refresh token if close to expiry
    accessToken = await refreshTokenIfNeeded(
      supabase, userId, accessToken, profile.threads_token_expires_at
    );

    // ── Resolve media list ────────────────────────────────────────────────────
    const urls: string[] = Array.isArray(mediaUrls) && mediaUrls.length > 0
      ? mediaUrls
      : mediaUrl ? [mediaUrl] : [];

    let publishedId: string;

    // ── CAROUSEL (2+ media items) ─────────────────────────────────────────────
    if (urls.length > 1) {
      const childIds: string[] = [];

      for (const url of urls.slice(0, 10)) { // Threads supports up to 10 items
        const isVideo = isVideoUrl(url);
        const childPayload: Record<string, any> = {
          is_carousel_item: true,
          access_token: accessToken,
        };
        if (isVideo) {
          childPayload.media_type = "VIDEO";
          childPayload.video_url = url;
        } else {
          childPayload.media_type = "IMAGE";
          childPayload.image_url = url;
        }

        const childRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(childPayload),
        });
        const childData = await childRes.json();
        if (!childData.id) {
          throw new Error(`Failed to create carousel item: ${JSON.stringify(childData)}`);
        }

        if (isVideo) {
          await waitForContainer(childData.id, accessToken);
        }
        childIds.push(childData.id);
      }

      // Create carousel parent container
      const parentRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          text: caption || "",
          children: childIds.join(","),
          access_token: accessToken,
        }),
      });
      const parentData = await parentRes.json();
      if (!parentData.id) {
        throw new Error(`Failed to create carousel container: ${JSON.stringify(parentData)}`);
      }

      // Publish
      const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: parentData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (!publishData.id) {
        throw new Error(`Failed to publish carousel: ${JSON.stringify(publishData)}`);
      }
      publishedId = publishData.id;

    // ── SINGLE VIDEO ──────────────────────────────────────────────────────────
    } else if (urls.length === 1 && isVideoUrl(urls[0])) {
      const containerRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "VIDEO",
          video_url: urls[0],
          text: caption || "",
          access_token: accessToken,
        }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        throw new Error(`Failed to create video container: ${JSON.stringify(containerData)}`);
      }

      // Wait for video processing
      await waitForContainer(containerData.id, accessToken);

      const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (!publishData.id) {
        throw new Error(`Failed to publish video: ${JSON.stringify(publishData)}`);
      }
      publishedId = publishData.id;

    // ── SINGLE IMAGE ──────────────────────────────────────────────────────────
    } else if (urls.length === 1) {
      const containerRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "IMAGE",
          image_url: urls[0],
          text: caption || "",
          access_token: accessToken,
        }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        throw new Error(`Failed to create image container: ${JSON.stringify(containerData)}`);
      }

      const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (!publishData.id) {
        throw new Error(`Failed to publish image: ${JSON.stringify(publishData)}`);
      }
      publishedId = publishData.id;

    // ── TEXT ONLY ─────────────────────────────────────────────────────────────
    } else {
      if (!caption || !caption.trim()) {
        throw new Error("Threads post requires either media or a text caption");
      }

      const containerRes = await fetch(`${THREADS_API}/${threadsUserId}/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "TEXT",
          text: caption,
          access_token: accessToken,
        }),
      });
      const containerData = await containerRes.json();
      if (!containerData.id) {
        throw new Error(`Failed to create text container: ${JSON.stringify(containerData)}`);
      }

      const publishRes = await fetch(`${THREADS_API}/${threadsUserId}/threads_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (!publishData.id) {
        throw new Error(`Failed to publish text post: ${JSON.stringify(publishData)}`);
      }
      publishedId = publishData.id;
    }

    const postUrl = `https://www.threads.net/@${profile.threads_handle || ""}`;

    return new Response(
      JSON.stringify({ success: true, id: publishedId, postUrl }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Threads publish error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
