import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * instagram-sync
 *
 * SCOPE (2026-08-22): FOLLOWER COUNTS ONLY.
 *
 * Per-post metrics and the engagement roll-up for all five platforms come from
 * postforme-sync, which reads the Post for Me feed with `?expand=metrics`.
 * Post for Me exposes no follower field anywhere in its API, so this function
 * exists purely to supply the one number it cannot.
 *
 * It used to also write per-post rows and the engagement columns. That made the
 * two functions fight over the same (user, platform, date) row: whichever ran
 * last won. On 2026-08-22 this one ran second and overwrote Instagram's real
 * numbers (570,285 views, 8.37 percent engagement from the Graph-backed feed)
 * with its own much worse ones (0 views, 0.22 percent), because the Graph API
 * no longer returns video_views for these media and the old engagement formula
 * divided by followers instead of reach.
 *
 * The division is now strict, and the upsert payload is the enforcement:
 * supabase-js only SETs the columns present in the payload, so naming just
 * followers_count and total_posts leaves postforme-sync's columns untouched.
 * Do not add metric columns back here.
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronSecret = Deno.env.get("Cron_Secret");

    // Resolve caller. Three paths, in order:
    //   1. Cron: `{ cronSecret, userId }` in the body.
    //   2. Service-role bearer + userId in the body.
    //   3. User session JWT.
    //
    // The cron path exists because the service-role comparison broke: pg_cron
    // sends the vault copy of the key, and once the project moved to the new
    // API key system that stopped matching SUPABASE_SERVICE_ROLE_KEY. Every
    // nightly run 401'd from 2026-07-04 while cron.job_run_details reported
    // "succeeded", because pg_cron only records that the call was made.
    //
    // Body is read FIRST so the cron path needs no Authorization header.
    let body: { userId?: string; cronSecret?: string } = {};
    try { body = await req.json(); } catch { /* empty body is fine for user mode */ }

    const isCron = !!body.cronSecret && !!cronSecret && body.cronSecret === cronSecret;

    let userId: string;
    if (isCron) {
      if (!body.userId) {
        return new Response(JSON.stringify({ error: "userId is required in body for cron calls" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userId = body.userId;
    } else {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const jwt = authHeader.replace(/^Bearer\s+/i, "");

      // Real key comparison. The previous decode-only role check was FORGEABLE:
      // any unsigned token carrying a service_role claim passed and could write
      // across tenants.
      const isServiceRole = jwt.trim() !== "" && jwt.trim() === supabaseKey.trim();

      if (isServiceRole) {
        if (!body.userId) {
          return new Response(JSON.stringify({ error: "userId is required in body for service-role calls" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        userId = body.userId;
      } else {
        const anon = createClient(supabaseUrl, supabaseAnonKey);
        const { data: { user }, error: userError } = await anon.auth.getUser(jwt);
        if (userError || !user) {
          return new Response(JSON.stringify({ error: "Unauthorized" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        userId = user.id;
      }
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Follower counts are per brand, and brands are isolated. The direct grant
    // lives on profiles (one per user), so v1 attributes it to the owner's
    // default brand (brands.is_default). Office > Connections will let this be
    // reassigned explicitly later.
    const { data: brand, error: brandErr } = await supabase
      .from("brands").select("id").eq("owner_id", userId)
      .eq("is_default", true).maybeSingle();
    if (brandErr || !brand) throw new Error(`No brand for user ${userId}; the brands backfill has not run`);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("instagram_business_account_id, instagram_access_token, facebook_page_access_token, meta_token_expires_at, facebook_page_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) throw new Error("Failed to load user profile");

    const igUserId = profile.instagram_business_account_id;
    const accessToken = profile.facebook_page_access_token || profile.instagram_access_token;

    if (!igUserId || !accessToken) {
      throw new Error("Instagram Business Account not connected. Please connect via Meta OAuth first.");
    }

    if (profile.meta_token_expires_at) {
      const expiresAt = new Date(profile.meta_token_expires_at).getTime();
      const now = Date.now();
      if (expiresAt < now) {
        throw new Error("Meta access token has expired. Please reconnect your Instagram account in Settings.");
      }
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (expiresAt - now < sevenDays) {
        console.warn(`Meta token for user ${userId} expires in under 7 days. refresh-tokens should renew it nightly.`);
      }
    }

    // Account-level figures only. No media call: per-post data is PFM's job.
    const accountRes = await fetch(
      `${GRAPH}/${igUserId}?fields=id,username,followers_count,media_count,profile_picture_url&access_token=${accessToken}`
    );
    const accountData = await accountRes.json();
    if (accountData.error) throw new Error(`IG account fetch failed: ${accountData.error.message}`);

    const followersCount = accountData.followers_count || 0;
    const mediaCount = accountData.media_count || 0;

    await supabase
      .from("profiles")
      .update({
        instagram_handle: accountData.username || "",
        instagram_followers: followersCount,
        last_instagram_sync: new Date().toISOString(),
      })
      .eq("id", userId);

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

    // followers_count and total_posts ONLY.
    //
    // Every other column on this row belongs to postforme-sync. Omitting them
    // from the payload is what keeps them intact, because supabase-js builds
    // the ON CONFLICT DO UPDATE SET list from the payload keys.
    //
    // The bare views/likes/comments/shares/saves columns are also GENERATED
    // ALWAYS from their total_ counterparts; naming them raises 428C9 and
    // aborts the whole upsert.
    const { error: metricsError } = await supabase.from("platform_metrics").upsert(
      {
        user_id: userId,
        brand_id: brand.id,
        platform: "instagram",
        date: new Date().toISOString().split("T")[0],
        followers_count: followersCount,
        total_posts: mediaCount,
      },
      { onConflict: "brand_id,platform,date,social_account_key" }
    );

    if (metricsError) console.error("platform_metrics upsert error:", metricsError);

    // Facebook page followers ride on the same Meta grant. Post for Me supplies
    // the page's per-post numbers; the follower count exists only here. Failure
    // is reported, never fatal: the Instagram write above must not depend on it.
    let facebookFollowers: number | null = null;
    let facebookError: string | null = null;
    if (profile.facebook_page_id) {
      try {
        const pageRes = await fetch(
          `${GRAPH}/${profile.facebook_page_id}?fields=name,followers_count,fan_count&access_token=${accessToken}`
        );
        const page = await pageRes.json();
        if (page.error) throw new Error(page.error.message);
        facebookFollowers = Number(page.followers_count ?? page.fan_count ?? 0) || null;
        if (facebookFollowers) {
          await supabase
            .from("profiles")
            .update({ facebook_page_followers: facebookFollowers, last_facebook_sync: new Date().toISOString() })
            .eq("id", userId);
          const { error: fbMetricsError } = await supabase.from("platform_metrics").upsert(
            {
              user_id: userId,
              brand_id: brand.id,
              platform: "facebook",
              date: new Date().toISOString().split("T")[0],
              followers_count: facebookFollowers,
            },
            { onConflict: "brand_id,platform,date,social_account_key" }
          );
          if (fbMetricsError) facebookError = fbMetricsError.message;
        }
      } catch (err) {
        facebookError = (err as Error).message;
        console.warn("facebook followers:", facebookError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        followersCount,
        totalPosts: mediaCount,
        metricsError: metricsError?.message || null,
        facebookFollowers,
        facebookError,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Instagram sync error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
