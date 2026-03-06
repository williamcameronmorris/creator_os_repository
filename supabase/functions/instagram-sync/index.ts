import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * instagram-sync Edge Function
 *
 * Syncs Instagram Business Account data using the Facebook Graph API.
 * Requires the user to have connected via Meta OAuth (meta-auth edge fn),
 * which stores:
 *   - instagram_business_account_id  (IG Business User ID)
 *   - facebook_page_access_token     (Page Access Token — also stored as instagram_access_token)
 *
 * Does NOT use the deprecated Instagram Basic Display API (graph.instagram.com).
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

    const { userId } = await req.json();
    if (!userId) throw new Error("Missing required field: userId");

    // ── Look up IG Business Account ID + Page Access Token from the profile ──
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("instagram_business_account_id, instagram_access_token, facebook_page_access_token")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) throw new Error("Failed to load user profile");

    const igUserId = profile.instagram_business_account_id;
    // Prefer page access token; fall back to the stored instagram_access_token
    const accessToken = profile.facebook_page_access_token || profile.instagram_access_token;

    if (!igUserId || !accessToken) {
      throw new Error(
        "Instagram Business Account not connected. Please connect via Meta OAuth first."
      );
    }

    // ── Fetch IG Business Account info ────────────────────────────────────────
    const accountRes = await fetch(
      `${GRAPH}/${igUserId}?fields=id,username,name,biography,followers_count,media_count,profile_picture_url&access_token=${accessToken}`
    );
    const accountData = await accountRes.json();
    if (accountData.error)
      throw new Error(`IG account fetch failed: ${accountData.error.message}`);

    // ── Fetch recent media ────────────────────────────────────────────────────
    const mediaRes = await fetch(
      `${GRAPH}/${igUserId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${accessToken}`
    );
    const mediaData = await mediaRes.json();
    if (mediaData.error)
      throw new Error(`IG media fetch failed: ${mediaData.error.message}`);

    const media: any[] = mediaData.data || [];

    // ── Update profile ────────────────────────────────────────────────────────
    await supabase
      .from("profiles")
      .update({
        instagram_handle: accountData.username || "",
        instagram_followers: accountData.followers_count || 0,
        last_instagram_sync: new Date().toISOString(),
      })
      .eq("id", userId);

    // ── Upsert platform_credentials ──────────────────────────────────────────
    await supabase.from("platform_credentials").upsert(
      {
        user_id: userId,
        platform: "instagram",
        access_token: accessToken,
        platform_user_id: igUserId,
        platform_username: accountData.username || "",
        last_synced_at: new Date().toISOString(),
        is_active: true,
      },
      { onConflict: "user_id,platform" }
    );

    // ── Sync each post ────────────────────────────────────────────────────────
    let totalLikes = 0;
    let totalComments = 0;

    for (const item of media) {
      totalLikes += item.like_count || 0;
      totalComments += item.comments_count || 0;

      const { data: existingPost } = await supabase
        .from("content_posts")
        .select("id")
        .eq("instagram_post_id", item.id)
        .eq("user_id", userId)
        .maybeSingle();

      const mediaType =
        item.media_type === "CAROUSEL_ALBUM"
          ? "carousel"
          : item.media_type === "VIDEO"
          ? "video"
          : "image";

      const postData = {
        user_id: userId,
        platform: "instagram",
        caption: item.caption || "",
        media_url: item.media_url || item.thumbnail_url || "",
        media_type: mediaType,
        instagram_post_id: item.id,
        published_date: item.timestamp,
        status: "published",
        likes: item.like_count || 0,
        comments: item.comments_count || 0,
      };

      if (!existingPost) {
        await supabase.from("content_posts").insert(postData);
      } else {
        await supabase.from("content_posts").update(postData).eq("id", existingPost.id);
      }
    }

    // ── Upsert platform_metrics ───────────────────────────────────────────────
    await supabase.from("platform_metrics").upsert(
      {
        user_id: userId,
        platform: "instagram",
        date: new Date().toISOString().split("T")[0],
        followers_count: accountData.followers_count || 0,
        total_posts: accountData.media_count || 0,
        total_likes: totalLikes,
        total_comments: totalComments,
        avg_engagement_rate:
          media.length > 0 && (accountData.followers_count || 0) > 0
            ? ((totalLikes + totalComments) / media.length / accountData.followers_count) * 100
            : 0,
      },
      { onConflict: "user_id,platform,date" }
    );

    return new Response(
      JSON.stringify({ success: true, mediaCount: media.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Instagram sync error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
