import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * threads-deauth Edge Function
 *
 * Handles two Meta-required webhook callbacks:
 *
 *   POST /threads-deauth          — Uninstall Callback URL
 *     Called when a user removes the app from their Threads settings.
 *     Clears the user's Threads tokens and profile data.
 *
 *   POST /threads-deauth?type=delete — Delete Callback URL
 *     Called when a user submits a data deletion request via Meta.
 *     Deletes all stored Threads data for that user.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const url = new URL(req.url);
    const isDeletion = url.searchParams.get("type") === "delete";

    // Meta sends a signed_request param for deauth callbacks
    // We parse the payload to get the threads_user_id
    let threadsUserId: string | null = null;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      threadsUserId = body.threads_user_id || body.user_id || null;
    } else {
      // form-encoded
      const text = await req.text();
      const params = new URLSearchParams(text);
      const signedRequest = params.get("signed_request");
      if (signedRequest) {
        // Decode the payload portion (second part after the dot)
        const [, payload] = signedRequest.split(".");
        if (payload) {
          const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
          const data = JSON.parse(decoded);
          threadsUserId = data.user_id || data.threads_user_id || null;
        }
      }
    }

    if (!threadsUserId) {
      // Still return 200 — Meta will retry if we return an error
      console.log("threads-deauth: no user_id found in payload");
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isDeletion) {
      // Full data deletion — remove all Threads data for this user
      const { error } = await supabase
        .from("profiles")
        .update({
          threads_user_id: null,
          threads_access_token: null,
          threads_token_expires_at: null,
          threads_handle: null,
          threads_followers: null,
          last_threads_sync: null,
        })
        .eq("threads_user_id", threadsUserId);

      if (error) console.error("threads-deauth delete error:", error);
      else console.log(`threads-deauth: deleted data for threads_user_id=${threadsUserId}`);
    } else {
      // Uninstall — clear tokens so the app stops making API calls on their behalf
      const { error } = await supabase
        .from("profiles")
        .update({
          threads_access_token: null,
          threads_token_expires_at: null,
        })
        .eq("threads_user_id", threadsUserId);

      if (error) console.error("threads-deauth uninstall error:", error);
      else console.log(`threads-deauth: cleared tokens for threads_user_id=${threadsUserId}`);
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("threads-deauth error:", err);
    // Always return 200 to prevent Meta from retrying indefinitely
    return new Response(JSON.stringify({ status: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
