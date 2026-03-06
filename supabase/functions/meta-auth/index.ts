import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * meta-auth Edge Function
 *
 * Handles the secure server-side portion of the Meta (Facebook/Instagram) OAuth flow:
 *   1. Exchanges the short-lived authorization code for a short-lived user access token
 *   2. Exchanges the short-lived token for a long-lived token (60 days)
 *   3. Fetches the user's Facebook Pages (with page-level access tokens)
 *   4. For each page, discovers the linked Instagram Business Account
 *   5. Returns all data to the frontend for storage in Supabase
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
    const metaAppId = Deno.env.get("META_APP_ID") || "1212526887760097";
    const metaAppSecret = Deno.env.get("META_APP_SECRET");

    if (!metaAppSecret) {
      throw new Error("META_APP_SECRET is not configured. Run: supabase secrets set META_APP_SECRET=your_secret");
    }

    const { code, redirect_uri, userId } = await req.json();

    if (!code || !redirect_uri || !userId) {
      throw new Error("Missing required fields: code, redirect_uri, userId");
    }

    // ─── Step 1: Exchange auth code for short-lived user token ───────────────
    const tokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
    tokenUrl.searchParams.set("client_id", metaAppId);
    tokenUrl.searchParams.set("client_secret", metaAppSecret);
    tokenUrl.searchParams.set("redirect_uri", redirect_uri);
    tokenUrl.searchParams.set("code", code);

    const tokenRes = await fetch(tokenUrl.toString());
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      throw new Error(`Token exchange failed: ${tokenData.error.message}`);
    }

    const shortLivedToken: string = tokenData.access_token;

    // ─── Step 2: Exchange for long-lived token (valid 60 days) ──────────────
    const longTokenUrl = new URL("https://graph.facebook.com/v25.0/oauth/access_token");
    longTokenUrl.searchParams.set("grant_type", "fb_exchange_token");
    longTokenUrl.searchParams.set("client_id", metaAppId);
    longTokenUrl.searchParams.set("client_secret", metaAppSecret);
    longTokenUrl.searchParams.set("fb_exchange_token", shortLivedToken);

    const longTokenRes = await fetch(longTokenUrl.toString());
    const longTokenData = await longTokenRes.json();

    if (longTokenData.error) {
      throw new Error(`Long-lived token exchange failed: ${longTokenData.error.message}`);
    }

    const longLivedToken: string = longTokenData.access_token;
    const expiresIn: number = longTokenData.expires_in || 5183944; // ~60 days default
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // ─── Step 3: Get Meta user ID ────────────────────────────────────────────
    const meRes = await fetch(
      `https://graph.facebook.com/v25.0/me?fields=id,name&access_token=${longLivedToken}`
    );
    const meData = await meRes.json();

    if (meData.error) {
      throw new Error(`Failed to fetch Meta user: ${meData.error.message}`);
    }

    // ─── Step 4: Get Facebook Pages ──────────────────────────────────────────
    const pagesRes = await fetch(
      `https://graph.facebook.com/v25.0/me/accounts?fields=id,name,access_token,fan_count,category&access_token=${longLivedToken}`
    );
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      throw new Error(`Failed to fetch Facebook Pages: ${pagesData.error.message}`);
    }

    const pages: Array<{
      id: string;
      name: string;
      access_token: string;
      fan_count?: number;
      category?: string;
      instagram_business_account?: { id: string; username?: string; followers_count?: number };
    }> = pagesData.data || [];

    // ─── Step 5: For each page, find the linked Instagram Business Account ───
    for (const page of pages) {
      const igRes = await fetch(
        `https://graph.facebook.com/v25.0/${page.id}?fields=instagram_business_account{id,username,followers_count}&access_token=${page.access_token}`
      );
      const igData = await igRes.json();

      if (!igData.error && igData.instagram_business_account) {
        page.instagram_business_account = igData.instagram_business_account;
      }
    }

    // ─── Step 6: Store tokens in Supabase ────────────────────────────────────
    // Use the first page as the default connected page (user can change in settings)
    const primaryPage = pages[0];

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const updatePayload: Record<string, unknown> = {
      meta_user_id: meData.id,
      meta_access_token: longLivedToken,
      meta_token_expires_at: tokenExpiresAt,
    };

    if (primaryPage) {
      updatePayload.facebook_page_id = primaryPage.id;
      updatePayload.facebook_page_access_token = primaryPage.access_token;
      updatePayload.facebook_page_name = primaryPage.name;
      updatePayload.facebook_page_followers = primaryPage.fan_count || 0;

      if (primaryPage.instagram_business_account) {
        updatePayload.instagram_business_account_id = primaryPage.instagram_business_account.id;
        // Also update the existing instagram_handle/followers if available
        if (primaryPage.instagram_business_account.username) {
          updatePayload.instagram_handle = primaryPage.instagram_business_account.username;
        }
        if (primaryPage.instagram_business_account.followers_count) {
          updatePayload.instagram_followers = primaryPage.instagram_business_account.followers_count;
        }
        // Store the page access token as the instagram access token for publishing
        updatePayload.instagram_access_token = primaryPage.access_token;
        updatePayload.instagram_user_id = primaryPage.instagram_business_account.id;
        updatePayload.last_instagram_sync = new Date().toISOString();
      }

      updatePayload.last_facebook_sync = new Date().toISOString();
    }

    const { error: dbError } = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", userId);

    if (dbError) {
      throw new Error(`Failed to save tokens: ${dbError.message}`);
    }

    // Return sanitized data to the frontend (no secrets in response)
    return new Response(
      JSON.stringify({
        success: true,
        metaUserId: meData.id,
        metaUserName: meData.name,
        tokenExpiresAt,
        pages: pages.map((p) => ({
          id: p.id,
          name: p.name,
          fanCount: p.fan_count || 0,
          instagramBusinessAccountId: p.instagram_business_account?.id || null,
          instagramUsername: p.instagram_business_account?.username || null,
          instagramFollowers: p.instagram_business_account?.followers_count || 0,
        })),
        primaryPage: primaryPage
          ? {
              id: primaryPage.id,
              name: primaryPage.name,
              fanCount: primaryPage.fan_count || 0,
            }
          : null,
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
