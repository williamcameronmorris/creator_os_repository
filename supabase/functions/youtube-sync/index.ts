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

    const channelResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!channelResponse.ok) {
      throw new Error(`YouTube API error: ${channelResponse.statusText}`);
    }

    const channelData = await channelResponse.json();
    const channel = channelData.items?.[0];

    if (!channel) {
      throw new Error("No YouTube channel found");
    }

    const videosResponse = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&forMine=true&type=video&maxResults=50&order=date`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!videosResponse.ok) {
      throw new Error(`YouTube Videos API error: ${videosResponse.statusText}`);
    }

    const videosData = await videosResponse.json();
    const videoIds = videosData.items?.map((item: any) => item.id.videoId).join(",") || "";

    let videoStats = [];
    if (videoIds) {
      const statsResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails&id=${videoIds}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        videoStats = statsData.items || [];
      }
    }

    await supabase
      .from("profiles")
      .update({
        youtube_handle: channel.snippet.title,
        youtube_followers: parseInt(channel.statistics.subscriberCount) || 0,
        youtube_channel_id: channel.id,
        last_youtube_sync: new Date().toISOString(),
      })
      .eq("id", userId);

    await supabase
      .from("platform_credentials")
      .upsert(
        {
          user_id: userId,
          platform: "youtube",
          access_token: accessToken,
          platform_user_id: channel.id,
          platform_username: channel.snippet.title,
          last_synced_at: new Date().toISOString(),
          is_active: true,
        },
        { onConflict: "user_id,platform" }
      );

    let totalViews = 0;
    let totalLikes = 0;
    let totalComments = 0;

    for (let i = 0; i < videosData.items?.length; i++) {
      const video = videosData.items[i];
      const stats = videoStats.find((s: any) => s.id === video.id.videoId);

      const { data: existingPost } = await supabase
        .from("content_posts")
        .select("id")
        .eq("youtube_video_id", video.id.videoId)
        .eq("user_id", userId)
        .maybeSingle();

      const viewCount = parseInt(stats?.statistics?.viewCount || "0");
      const likeCount = parseInt(stats?.statistics?.likeCount || "0");
      const commentCount = parseInt(stats?.statistics?.commentCount || "0");

      const postData = {
        user_id: userId,
        platform: "youtube",
        caption: video.snippet.title || "",
        media_url: `https://www.youtube.com/watch?v=${video.id.videoId}`,
        media_type: "video",
        youtube_video_id: video.id.videoId,
        published_date: video.snippet.publishedAt,
        status: "published",
        views: viewCount,
        likes: likeCount,
        comments: commentCount,
        engagement_rate:
          viewCount > 0
            ? ((likeCount + commentCount) / viewCount) * 100
            : 0,
      };

      totalViews += viewCount;
      totalLikes += likeCount;
      totalComments += commentCount;

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
        platform: "youtube",
        date: new Date().toISOString().split("T")[0],
        followers_count: parseInt(channel.statistics.subscriberCount) || 0,
        total_posts: parseInt(channel.statistics.videoCount) || 0,
        total_views: totalViews,
        total_likes: totalLikes,
        total_comments: totalComments,
        avg_engagement_rate:
          videosData.items?.length > 0
            ? videoStats.reduce(
                (sum: number, v: any) => {
                  const views = parseInt(v.statistics?.viewCount || "0");
                  const likes = parseInt(v.statistics?.likeCount || "0");
                  const comments = parseInt(v.statistics?.commentCount || "0");
                  return sum + (views > 0 ? ((likes + comments) / views) * 100 : 0);
                },
                0
              ) / videosData.items.length
            : 0,
      },
      { onConflict: "user_id,platform,date" }
    );

    return new Response(
      JSON.stringify({ success: true, videosCount: videosData.items?.length || 0 }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("YouTube sync error:", error);
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