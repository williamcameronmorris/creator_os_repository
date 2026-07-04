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

/**
 * Verify Meta's signed_request ("<base64url sig>.<base64url payload>") by
 * recomputing HMAC-SHA256(payload, app_secret). Returns the decoded payload
 * only if the signature is valid, else null. This is the ONLY trusted source
 * of the threads_user_id — a plain JSON body is unauthenticated and must not
 * be trusted (it let anyone wipe any user's Threads data).
 */
async function verifySignedRequest(
  signedRequest: string,
  appSecret: string,
): Promise<Record<string, unknown> | null> {
  const [sig, payload] = signedRequest.split(".");
  if (!sig || !payload) return null;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (expected !== sig.replace(/=+$/, "")) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

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

    const appSecret =
      Deno.env.get("THREADS_APP_SECRET") || Deno.env.get("META_APP_SECRET");
    if (!appSecret) {
      // Fail closed: without the secret we cannot verify Meta's signature, so
      // we must not act on any request.
      console.error("threads-deauth: no THREADS_APP_SECRET/META_APP_SECRET configured");
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only a signature-verified signed_request is trusted. A plain JSON body
    // (or a signed_request with a bad signature) is ignored.
    const text = await req.text();
    const signedRequest = new URLSearchParams(text).get("signed_request");
    const data = signedRequest ? await verifySignedRequest(signedRequest, appSecret) : null;
    const threadsUserId = data
      ? ((data.user_id as string) || (data.threads_user_id as string) || null)
      : null;

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
