import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * refresh-tokens Edge Function
 *
 * Refreshes expiring Meta (Facebook/Instagram) and Threads long-lived tokens
 * for all users. Should be invoked on a schedule (e.g. daily cron).
 *
 * Tokens are refreshed when they expire within 7 days.
 *
 * Meta:    Refresh via fb_exchange_token grant (resets to full 60 days)
 * Threads: Refresh via th_refresh_token grant (resets to full 60 days)
 *
 * Requires Supabase secrets:
 *   META_APP_ID, META_APP_SECRET
 *   THREADS_APP_ID (optional, falls back to META_APP_ID)
 *   THREADS_APP_SECRET (optional, falls back to META_APP_SECRET)
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GRAPH = "https://graph.facebook.com/v25.0";
const THREADS_API = "https://graph.threads.net/v1.0";

// Refresh tokens expiring within this many days
const REFRESH_WINDOW_DAYS = 7;

interface RefreshResult {
  userId: string;
  meta?: { success: boolean; expiresAt?: string; error?: string };
  threads?: { success: boolean; expiresAt?: string; error?: string };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const metaAppId = Deno.env.get("META_APP_ID") || "1212526887760097";
    const metaAppSecret = Deno.env.get("META_APP_SECRET");
    const threadsAppId = Deno.env.get("THREADS_APP_ID") || "1433038365192458";
    const threadsAppSecret = Deno.env.get("THREADS_APP_SECRET") || metaAppSecret;

    if (!metaAppSecret) {
      throw new Error("META_APP_SECRET is not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const refreshCutoff = new Date(
      Date.now() + REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000
    ).toISOString();

    // Find users with Meta tokens expiring soon
    const { data: metaUsers } = await supabase
      .from("profiles")
      .select("id, meta_access_token, meta_token_expires_at")
      .not("meta_access_token", "is", null)
      .lt("meta_token_expires_at", refreshCutoff);

    // Find users with Threads tokens expiring soon
    const { data: threadsUsers } = await supabase
      .from("profiles")
      .select("id, threads_access_token, threads_token_expires_at")
      .not("threads_access_token", "is", null)
      .lt("threads_token_expires_at", refreshCutoff);

    const results: RefreshResult[] = [];

    // ── Refresh Meta tokens ──────────────────────────────────────────────────
    for (const user of metaUsers || []) {
      const result: RefreshResult = { userId: user.id };

      try {
        const refreshUrl = new URL(`${GRAPH}/oauth/access_token`);
        refreshUrl.searchParams.set("grant_type", "fb_exchange_token");
        refreshUrl.searchParams.set("client_id", metaAppId);
        refreshUrl.searchParams.set("client_secret", metaAppSecret);
        refreshUrl.searchParams.set("fb_exchange_token", user.meta_access_token);

        const res = await fetch(refreshUrl.toString());
        const data = await res.json();

        if (data.error) {
          result.meta = { success: false, error: data.error.message };
        } else {
          const expiresIn = data.expires_in || 5183944;
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

          await supabase
            .from("profiles")
            .update({
              meta_access_token: data.access_token,
              meta_token_expires_at: expiresAt,
            })
            .eq("id", user.id);

          result.meta = { success: true, expiresAt };
        }
      } catch (err) {
        result.meta = { success: false, error: (err as Error).message };
      }

      results.push(result);
    }

    // ── Refresh Threads tokens ───────────────────────────────────────────────
    for (const user of threadsUsers || []) {
      // Find or create existing result entry for this user
      let result = results.find((r) => r.userId === user.id);
      if (!result) {
        result = { userId: user.id };
        results.push(result);
      }

      try {
        const refreshUrl = new URL(`${THREADS_API}/refresh_access_token`);
        refreshUrl.searchParams.set("grant_type", "th_refresh_token");
        refreshUrl.searchParams.set("access_token", user.threads_access_token);

        const res = await fetch(refreshUrl.toString());
        const data = await res.json();

        if (data.error) {
          result.threads = { success: false, error: data.error.message };
        } else {
          const expiresIn = data.expires_in || 5183944;
          const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

          await supabase
            .from("profiles")
            .update({
              threads_access_token: data.access_token,
              threads_token_expires_at: expiresAt,
            })
            .eq("id", user.id);

          result.threads = { success: true, expiresAt };
        }
      } catch (err) {
        result.threads = { success: false, error: (err as Error).message };
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        refreshed: results.length,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
