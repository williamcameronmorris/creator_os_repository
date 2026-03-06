import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { userId, accessToken } = await req.json();

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

    return new Response(
      JSON.stringify({ success: true, videosCount: videos.length }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("TikTok sync error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});