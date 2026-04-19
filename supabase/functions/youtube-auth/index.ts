import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * youtube-auth Edge Function
 *
 * Handles server-side YouTube OAuth code exchange:
 *   1. Exchanges authorization code for access_token + refresh_token
 *   2. Fetches channel info (name, subscribers, channel ID)
 *   3. Stores tokens and channel data in profiles table
 *   4. Triggers youtube-sync to populate content_posts immediately
 *
 * Requires Supabase secret: YOUTUBE_CLIENT_SECRET
 * Set via: supabase secrets set YOUTUBE_CLIENT_SECRET=your_secret
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const clientId = Deno.env.get("YOUTUBE_CLIENT_ID");
    const clientSecret = Deno.env.get("YOUTUBE_CLIENT_SECRET");

    if (!clientSecret) {
      throw new Error("YOUTUBE_CLIENT_SECRET is not configured. Run: supabase secrets set YOUTUBE_CLIENT_SECRET=your_secret");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { code, redirect_uri, userId } = await req.json();

    if (!code || !redirect_uri || !userId) {
      throw new Error("Missing required fields: code, redirect_uri, userId");
    }

    // âââ Step 1: Exchange auth code for tokens âââââââââââââââââââââââââââââââ
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId || "",
        client_secret: clientSecret,
        redirect_uri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken: string = tokenData.access_token;
    const refreshToken: string = tokenData.refresh_token;
    const expiresIn: number = tokenData.expires_in || 3600;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // âââ Step 2: Fetch channel info ââââââââââââââââââââââââââââââââââââââââââ
    const channelRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const channelData = await channelRes.json();
    const channel = channelData.items?.[0];

    if (!channel) {
      throw new Error("No YouTube channel found for this account");
    }

    const channelId = channel.id;
    const channelName = channel.snippet?.title || "";
    const subscriberCount = parseInt(channel.statistics?.subscriberCount || "0");

    // âââ Step 3: Store tokens and channel info in profiles âââââââââââââââââââ
    const { data: updatedRows, error: profileError } = await supabase
      .from("profiles")
      .update({
        youtube_access_token: accessToken,
        youtube_refresh_token: refreshToken,
        youtube_token_expires_at: tokenExpiresAt,
        youtube_channel_id: channelId,
        youtube_handle: channelName,
        youtube_followers: subscriberCount,
        youtube_connected: true,
        last_youtube_sync: null, // will be set after sync
      })
      .eq("id", userId)
      .select("id");

    if (!updatedRows || updatedRows.length === 0) {
      // Row didn't exist — create it so the token actually lands somewhere
      const { error: insertError } = await supabase
        .from("profiles")
        .insert({
          id: userId,
          youtube_access_token: accessToken,
          youtube_refresh_token: refreshToken,
          youtube_token_expires_at: tokenExpiresAt,
          youtube_channel_id: channelId,
          youtube_handle: channelName,
          youtube_followers: subscriberCount,
          youtube_connected: true,
        });
      if (insertError) {
        throw new Error(`Failed to create profile with YouTube credentials: ${insertError.message}`);
      }
    }

    if (profileError) {
      throw new Error(`Failed to store YouTube credentials: ${profileError.message}`);
    }

    // âââ Step 4: Trigger youtube-sync fire-and-forget ââââââââââââââââââââââââ
    fetch(`${supabaseUrl}/functions/v1/youtube-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ userId, accessToken, refreshToken }),
    }).catch(() => {});

    return new Response(
      JSON.stringify({
        success: true,
        channel: { id: channelId, name: channelName, subscribers: subscriberCount },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("YouTube auth error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
