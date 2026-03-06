import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * threads-auth Edge Function
 *
 * Handles the secure server-side portion of the Threads OAuth flow:
 *   1. Exchanges the short-lived authorization code for a short-lived Threads token
 *   2. Exchanges for a long-lived Threads token (valid 60 days, refreshable)
 *   3. Fetches the Threads user profile
 *   4. Stores tokens and profile in Supabase
 *
 * Note: Threads uses a SEPARATE OAuth flow from Facebook/Instagram.
 * API base: https://graph.threads.net/v1.0
 *
 * Requires Supabase secret: META_APP_SECRET
 * Set via: supabase secrets set META_APP_SECRET=your_app_secret_here
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
    // Threads has its own App ID and secret, separate from the main Meta app
    const threadsAppId = Deno.env.get("THREADS_APP_ID") || "1433038365192458";
    const threadsAppSecret = Deno.env.get("THREADS_APP_SECRET") || Deno.env.get("META_APP_SECRET");

    if (!threadsAppSecret) {
      throw new Error("THREADS_APP_SECRET (or META_APP_SECRET) is not configured. Run: supabase secrets set THREADS_APP_SECRET=your_secret");
    }

    const { code, redirect_uri, userId } = await req.json();

    if (!code || !redirect_uri || !userId) {
      throw new Error("Missing required fields: code, redirect_uri, userId");
    }

    // ─── Step 1: Exchange code for short-lived Threads token ─────────────────
    const tokenBody = new URLSearchParams({
      client_id: threadsAppId,
      client_secret: threadsAppSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri,
    });

    const shortTokenRes = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });

    const shortTokenData = await shortTokenRes.json();

    if (shortTokenData.error) {
      throw new Error(`Threads token exchange failed: ${shortTokenData.error_message || shortTokenData.error}`);
    }

    const shortLivedToken: string = shortTokenData.access_token;
    const threadsUserId: string = shortTokenData.user_id?.toString();

    // ─── Step 2: Exchange for long-lived Threads token ───────────────────────
    const longTokenUrl = new URL("https://graph.threads.net/access_token");
    longTokenUrl.searchParams.set("grant_type", "th_exchange_token");
    longTokenUrl.searchParams.set("client_secret", threadsAppSecret);
    longTokenUrl.searchParams.set("access_token", shortLivedToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenRes.json();

    if (longTokenData.error) {
      throw new Error(`Threads long-lived token exchange failed: ${longTokenData.error.message}`);
    }

    const longLivedToken: string = longTokenData.access_token;
    const expiresIn: number = longTokenData.expires_in || 5183944; // ~60 days
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // ─── Step 3: Fetch Threads user profile ──────────────────────────────────
    const profileRes = await fetch(
      `https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url,threads_biography,followers_count&access_token=${longLivedToken}`
    );
    const profileData = await profileRes.json();

    if (profileData.error) {
      throw new Error(`Failed to fetch Threads profile: ${profileData.error.message}`);
    }

    // ─── Step 4: Store in Supabase ────────────────────────────────────────────
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error: dbError } = await supabase
      .from("profiles")
      .update({
        threads_user_id: threadsUserId || profileData.id,
        threads_access_token: longLivedToken,
        threads_token_expires_at: tokenExpiresAt,
        threads_handle: profileData.username || "",
        threads_followers: profileData.followers_count || 0,
        last_threads_sync: new Date().toISOString(),
      })
      .eq("id", userId);

    if (dbError) {
      throw new Error(`Failed to save Threads tokens: ${dbError.message}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        threadsUserId: threadsUserId || profileData.id,
        threadsHandle: profileData.username,
        threadsFollowers: profileData.followers_count || 0,
        tokenExpiresAt,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
