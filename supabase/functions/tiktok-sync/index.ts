import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ── Verify caller's session JWT; derive userId from the token, not the body.
    // The edge runtime's verify_jwt gate accepts anon/service keys as "valid JWTs",
    // so we must explicitly resolve the caller to a real user here.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing Authorization header" });
    const jwt = authHeader.replace(/^Bearer\s+/i, "");

    const anon = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await anon.auth.getUser(jwt);
    if (userError || !user) return json(401, { error: "Unauthorized" });
    const userId = user.id;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Fetch the token from the profile — never trust a token from the body.
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("tiktok_access_token")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw new Error("Failed to load profile");
    const accessToken = profile?.tiktok_access_token;
    if (!accessToken) return json(400, { error: "TikTok not connected" });

    const userInfoResponse = await fetch(
      `https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error(`TikTok API error: ${userInfoResponse.statusText}`);
    }

    const userInfo = await userInfoResponse.json();
    const userData = userInfo.data?.user;

    const videosResponse = await fetch(
      `https://open.tiktokapis.com/v2/video/list/?fields=id,title,video_description,duration,cover_image_url,create_time,share_url,view_count,like_count,comment_count,share_count`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          max_count: 20,
        }),
      }
    );

    if (!videosResponse.ok) {
      throw new Error(`TikTok Videos API error: ${videosResponse.statusText}`);
    }

    const videosData = await videosResponse.json();
    const videos = videosData.data?.videos || [];

    await supabase
      .from("profiles")
      .update({
        tiktok_handle: userData?.display_name || "",
        tiktok_followers: userData?.follower_count || 0,
        last_tiktok_sync: new Date().toISOString(),
      })
      .eq("id", userId);

    await supabase
      .from("platform_credentials")
      .upsert(
        {
          user_id: userId,
          platform: "tiktok",
          access_token: accessToken,
          platform_user_id: userData?.open_id || "",
          platform_username: userData?.display_name || "",
          last_synced_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "user_id,platform" }
      );

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;

    for (const video of videos) {
      const { data: existingPost } = await supabase
        .from("content_posts")
        .select("id")
        .eq("tiktok_post_id", video.id)
        .eq("user_id", userId)
        .maybeSingle();

      const postData = {
        user_id: userId,
        platform: "tiktok",
        caption: video.video_description || video.title || "",
        media_url: video.share_url || "",
        media_type: "video",
        tiktok_post_id: video.id,
        published_date: new Date(video.create_time * 1000).toISOString(),
        status: "published",
        views: video.view_count || 0,
        likes: video.like_count || 0,
        comments: video.comment_count || 0,
        shares: video.share_count || 0,
        engagement_rate:
          video.view_count > 0
            ? ((video.like_count + video.comment_count + video.share_count) /
                video.view_count) *
              100
            : 0,
      };

      totalViews += video.view_count || 0;
      totalLikes += video.like_count || 0;
      totalComments += video.comment_count || 0;
      totalShares += video.share_count || 0;

      if (!existingPost) {
        await supabase.from("content_posts").insert(postData);
      } else {
        await supabase
          .from("content_posts")
          .update(postData)
          .eq("id", existingPost.id);
      }
    }

    await supabase.from("platform_metrics").upsert(
      {
        user_id: userId,
        platform: "tiktok",
        date: new Date().toISOString().split("T")[0],
        followers_count: userData?.follower_count || 0,
        total_posts: userData?.video_count || 0,
        total_views: totalViews,
        total_likes: totalLikes,
        total_comments: totalComments,
        total_shares: totalShares,
        avg_engagement_rate:
          videos.length > 0
            ? videos.reduce(
                (sum: number, v: any) =>
                  sum +
                  (v.view_count > 0
                    ? ((v.like_count + v.comment_count + v.share_count) /
                        v.view_count) *
                      100
                    : 0),
                0
              ) / videos.length
            : 0,
      },
      { onConflict: "user_id,platform,date" }
    );

    return json(200, { success: true, videosCount: videos.length });
  } catch (error) {
    console.error("TikTok sync error:", error);
    return json(400, { error: (error as Error).message });
  }
});
