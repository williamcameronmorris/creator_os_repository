import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";

const GRAPH = "https://graph.facebook.com/v25.0";
const THREADS = "https://graph.threads.net/v1.0";
const YOUTUBE = "https://www.googleapis.com/youtube/v3";

async function refreshYouTubeToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: Deno.env.get("YOUTUBE_CLIENT_ID") || "",
      client_secret: Deno.env.get("YOUTUBE_CLIENT_SECRET") || "",
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`YouTube token refresh failed: ${data.error}`);
  return data.access_token;
}

async function fetchInstagramComments(profile: any, supabase: any, userId: string): Promise<any[]> {
  const igUserId = profile.instagram_business_account_id;
  const accessToken = profile.facebook_page_access_token || profile.instagram_access_token;
  if (!igUserId || !accessToken) return [];

  const comments: any[] = [];

  try {
    // Get recent media
    const mediaRes = await fetch(
      `${GRAPH}/${igUserId}/media?fields=id,caption,media_type,thumbnail_url,media_url,permalink,timestamp&limit=20&access_token=${accessToken}`
    );
    const mediaData = await mediaRes.json();
    if (mediaData.error) {
      console.error("IG media fetch error:", mediaData.error.message);
      return [];
    }

    const media: any[] = mediaData.data || [];

    for (const post of media.slice(0, 10)) {
      try {
        const commentsRes = await fetch(
          `${GRAPH}/${post.id}/comments?fields=id,text,timestamp,username,like_count,replies{id,text,timestamp,username,like_count}&limit=50&access_token=${accessToken}`
        );
        const commentsData = await commentsRes.json();
        if (commentsData.error) continue;

        for (const c of commentsData.data || []) {
          comments.push({
            user_id: userId,
            platform: "instagram",
            post_id: post.id,
            post_caption: post.caption?.substring(0, 300) || null,
            post_thumbnail_url: post.thumbnail_url || post.media_url || null,
            post_permalink: post.permalink || null,
            comment_id: c.id,
            author_name: c.username || "Instagram User",
            author_username: c.username || null,
            author_avatar_url: null,
            text: c.text || "",
            likes_count: c.like_count || 0,
            parent_comment_id: null,
            comment_created_at: c.timestamp || null,
          });

          // Include replies
          for (const r of c.replies?.data || []) {
            comments.push({
              user_id: userId,
              platform: "instagram",
              post_id: post.id,
              post_caption: post.caption?.substring(0, 300) || null,
              post_thumbnail_url: post.thumbnail_url || post.media_url || null,
              post_permalink: post.permalink || null,
              comment_id: r.id,
              author_name: r.username || "Instagram User",
              author_username: r.username || null,
              author_avatar_url: null,
              text: r.text || "",
              likes_count: r.like_count || 0,
              parent_comment_id: c.id,
              comment_created_at: r.timestamp || null,
            });
          }
        }
      } catch (e) {
        console.error("Error fetching comments for post", post.id, e);
      }
    }
  } catch (e) {
    console.error("Instagram comments error:", e);
  }

  return comments;
}

async function fetchYouTubeComments(profile: any, supabase: any, userId: string): Promise<any[]> {
  let accessToken = profile.youtube_access_token;
  const refreshToken = profile.youtube_refresh_token;
  const channelId = profile.youtube_channel_id;

  if (!channelId || (!accessToken && !refreshToken)) return [];

  try {
    // Refresh token if needed
    if (!accessToken && refreshToken) {
      accessToken = await refreshYouTubeToken(refreshToken);
      await supabase.from("profiles").update({ youtube_access_token: accessToken }).eq("id", userId);
    }

    const comments: any[] = [];

    // Fetch comment threads for the channel
    const res = await fetch(
      `${YOUTUBE}/commentThreads?part=snippet,replies&allThreadsRelatedToChannelId=${channelId}&maxResults=100&order=time`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      console.error("YouTube comments API error:", res.statusText);
      return [];
    }

    const data = await res.json();

    for (const thread of data.items || []) {
      const top = thread.snippet?.topLevelComment?.snippet;
      const videoId = thread.snippet?.videoId;

      if (!top || !videoId) continue;

      comments.push({
        user_id: userId,
        platform: "youtube",
        post_id: videoId,
        post_caption: null,
        post_thumbnail_url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
        post_permalink: `https://www.youtube.com/watch?v=${videoId}`,
        comment_id: thread.snippet.topLevelComment.id,
        author_name: top.authorDisplayName || "YouTube User",
        author_username: top.authorChannelUrl?.split("/").pop() || null,
        author_avatar_url: top.authorProfileImageUrl || null,
        text: top.textOriginal || top.textDisplay || "",
        likes_count: top.likeCount || 0,
        parent_comment_id: null,
        comment_created_at: top.publishedAt || null,
      });

      // Replies
      for (const reply of thread.replies?.comments || []) {
        const rs = reply.snippet;
        comments.push({
          user_id: userId,
          platform: "youtube",
          post_id: videoId,
          post_caption: null,
          post_thumbnail_url: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          post_permalink: `https://www.youtube.com/watch?v=${videoId}&lc=${thread.snippet.topLevelComment.id}`,
          comment_id: reply.id,
          author_name: rs.authorDisplayName || "YouTube User",
          author_username: rs.authorChannelUrl?.split("/").pop() || null,
          author_avatar_url: rs.authorProfileImageUrl || null,
          text: rs.textOriginal || rs.textDisplay || "",
          likes_count: rs.likeCount || 0,
          parent_comment_id: thread.snippet.topLevelComment.id,
          comment_created_at: rs.publishedAt || null,
        });
      }
    }

    return comments;
  } catch (e) {
    console.error("YouTube comments error:", e);
    return [];
  }
}

async function fetchThreadsComments(profile: any, userId: string): Promise<any[]> {
  const accessToken = profile.threads_access_token;
  const threadsUserId = profile.threads_user_id;
  if (!accessToken || !threadsUserId) return [];

  const comments: any[] = [];

  try {
    // Get recent Threads posts
    const postsRes = await fetch(
      `${THREADS}/${threadsUserId}/threads?fields=id,text,media_type,thumbnail_url,permalink,timestamp&limit=20&access_token=${accessToken}`
    );
    const postsData = await postsRes.json();
    if (postsData.error) {
      console.error("Threads posts error:", postsData.error.message);
      return [];
    }

    for (const post of (postsData.data || []).slice(0, 10)) {
      try {
        const repliesRes = await fetch(
          `${THREADS}/${post.id}/replies?fields=id,text,timestamp,username,has_replies&limit=50&access_token=${accessToken}`
        );
        const repliesData = await repliesRes.json();
        if (repliesData.error) continue;

        for (const r of repliesData.data || []) {
          comments.push({
            user_id: userId,
            platform: "threads",
            post_id: post.id,
            post_caption: post.text?.substring(0, 300) || null,
            post_thumbnail_url: post.thumbnail_url || null,
            post_permalink: post.permalink || null,
            comment_id: r.id,
            author_name: r.username || "Threads User",
            author_username: r.username || null,
            author_avatar_url: null,
            text: r.text || "",
            likes_count: 0,
            parent_comment_id: null,
            comment_created_at: r.timestamp || null,
          });
        }
      } catch (e) {
        console.error("Threads replies error for post", post.id, e);
      }
    }
  } catch (e) {
    console.error("Threads comments error:", e);
  }

  return comments;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const auth = await requireUser(req, supabase);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const { platforms } = await req.json().catch(() => ({}));

    const { data: profile } = await supabase
      .from("profiles")
      .select("instagram_business_account_id, instagram_access_token, facebook_page_access_token, youtube_access_token, youtube_refresh_token, youtube_channel_id, threads_access_token, threads_user_id")
      .eq("id", userId)
      .maybeSingle();

    if (!profile) throw new Error("Profile not found");

    const fetch_platforms: string[] = platforms || ["instagram", "youtube", "threads"];
    const allComments: any[] = [];

    if (fetch_platforms.includes("instagram")) {
      const ig = await fetchInstagramComments(profile, supabase, userId);
      allComments.push(...ig);
    }
    if (fetch_platforms.includes("youtube")) {
      const yt = await fetchYouTubeComments(profile, supabase, userId);
      allComments.push(...yt);
    }
    if (fetch_platforms.includes("threads")) {
      const th = await fetchThreadsComments(profile, userId);
      allComments.push(...th);
    }

    // Upsert all comments
    let inserted = 0;
    if (allComments.length > 0) {
      const { error } = await supabase
        .from("comments")
        .upsert(allComments, { onConflict: "user_id,platform,comment_id", ignoreDuplicates: true });

      if (error) console.error("Upsert error:", error.message);
      else inserted = allComments.length;
    }

    return new Response(
      JSON.stringify({ success: true, fetched: allComments.length, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("fetch-comments error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
