import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * instagram-publish Edge Function
 *
 * Publishes a photo, video (Reel), or carousel to Instagram via the IG Business API.
 * Requires the user to have connected via Meta OAuth (meta-auth edge fn).
 *
 * Request body:
 *   userId       - Supabase user ID (credentials looked up server-side)
 *   mediaUrl     - Public URL of the image or video to publish
 *   caption      - Post caption
 *   mediaType    - "IMAGE" | "VIDEO" | "REELS" | "CAROUSEL_ALBUM" (defaults to IMAGE)
 *   carouselUrls - Array of image URLs (for CAROUSEL_ALBUM only)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GRAPH = "https://graph.facebook.com/v25.0";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, mediaUrl, caption, mediaType = "IMAGE", carouselUrls } = await req.json();

    if (!userId) throw new Error("Missing required field: userId");
    if (!mediaUrl && mediaType !== "CAROUSEL_ALBUM") throw new Error("Missing required field: mediaUrl");

    // ── Look up IG Business credentials server-side ──────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("instagram_business_account_id, instagram_access_token, facebook_page_access_token")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) throw new Error("Failed to load user profile");

    const igUserId = profile.instagram_business_account_id;
    const accessToken = profile.facebook_page_access_token || profile.instagram_access_token;

    if (!igUserId || !accessToken) {
      throw new Error("Instagram Business Account not connected. Please connect via Meta OAuth first.");
    }

    let publishedId: string;

    if (mediaType === "CAROUSEL_ALBUM" && Array.isArray(carouselUrls) && carouselUrls.length > 0) {
      // ── Carousel: create child containers, then parent container ─────────
      const childIds: string[] = [];

      for (const url of carouselUrls) {
        const childRes = await fetch(`${GRAPH}/${igUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image_url: url, is_carousel_item: true, access_token: accessToken }),
        });
        const childData = await childRes.json();
        if (!childData.id)
          throw new Error(`Failed to create carousel child: ${JSON.stringify(childData)}`);
        childIds.push(childData.id);
      }

      const parentRes = await fetch(`${GRAPH}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          caption: caption || "",
          children: childIds.join(","),
          access_token: accessToken,
        }),
      });
      const parentData = await parentRes.json();
      if (!parentData.id)
        throw new Error(`Failed to create carousel container: ${JSON.stringify(parentData)}`);

      const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: parentData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (!publishData.id)
        throw new Error(`Failed to publish carousel: ${JSON.stringify(publishData)}`);
      publishedId = publishData.id;
    } else {
      // ── Single image or video (Reel) ──────────────────────────────────────
      const isVideo = mediaType === "VIDEO" || mediaType === "REELS";
      const containerPayload: Record<string, any> = {
        caption: caption || "",
        access_token: accessToken,
      };
      if (isVideo) {
        containerPayload.media_type = "REELS";
        containerPayload.video_url = mediaUrl;
      } else {
        containerPayload.image_url = mediaUrl;
      }

      const containerRes = await fetch(`${GRAPH}/${igUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(containerPayload),
      });
      const containerData = await containerRes.json();
      if (!containerData.id)
        throw new Error(`Failed to create media container: ${JSON.stringify(containerData)}`);

      const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creation_id: containerData.id, access_token: accessToken }),
      });
      const publishData = await publishRes.json();
      if (!publishData.id)
        throw new Error(`Failed to publish post: ${JSON.stringify(publishData)}`);
      publishedId = publishData.id;
    }

    return new Response(
      JSON.stringify({ success: true, id: publishedId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Instagram publish error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
