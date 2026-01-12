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

    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type,media_count&access_token=${accessToken}`
    );
    const profile = await profileResponse.json();

    const mediaResponse = await fetch(
      `https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count&limit=50&access_token=${accessToken}`
    );
    const mediaData = await mediaResponse.json();

    await supabase
      .from("profiles")
      .update({
        instagram_handle: profile.username,
        instagram_followers: profile.media_count,
      })
      .eq("id", userId);

    for (const item of mediaData.data || []) {
      const { data: existingPost } = await supabase
        .from("content_posts")
        .select("id")
        .eq("instagram_post_id", item.id)
        .eq("user_id", userId)
        .maybeSingle();

      if (!existingPost) {
        await supabase.from("content_posts").insert({
          user_id: userId,
          platform: "instagram",
          caption: item.caption || "",
          media_url: item.media_url,
          media_type: item.media_type === "CAROUSEL_ALBUM" ? "carousel" : item.media_type.toLowerCase(),
          instagram_post_id: item.id,
          published_date: item.timestamp,
          status: "published",
          likes: item.like_count || 0,
          comments: item.comments_count || 0,
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, mediaCount: mediaData.data?.length || 0 }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
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