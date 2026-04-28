import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * postforme-webhook
 *
 * Receives webhook events from Post for Me when posts publish, fail, or
 * platform-side state changes. Updates the local `content_posts` mirror
 * so OfficeHub stays in sync without polling.
 *
 * Setup (manual, in PFM dashboard):
 *   1. Register https://<project>.supabase.co/functions/v1/postforme-webhook
 *      as a webhook endpoint.
 *   2. Subscribe to at minimum the post-result events.
 *   3. Save the signing secret as Supabase secret `Post_For_Me_Webhook_Secret`.
 *      (Signature verification is skipped while the secret is unset, but the
 *      function will reject all requests once the secret is configured and
 *      a request arrives without a valid signature header.)
 *
 * Lookup strategy: PFM events identify posts by their PFM `post_id`. We
 * stored that on every row at create time as `postforme_post_id`, so we
 * update by that key (one or many platform-mirror rows may exist per PFM
 * post — see ComposePost which inserts one row per platform).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("Post_For_Me_Webhook_Secret");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-PostForMe-Signature, X-Webhook-Signature",
};

async function verifySignature(rawBody: string, signature: string | null): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true; // No secret configured — accept (TODO: tighten once registered)
  if (!signature) return false;

  // PFM's exact signature scheme isn't documented in the public OpenAPI
  // spec, so we accept either a plain HMAC-SHA256 hex digest or the common
  // "sha256=<digest>" prefix form. Update this when PFM publishes their
  // signature spec.
  const provided = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const enc = new TextEncoder();
  const keyData = enc.encode(WEBHOOK_SECRET);
  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const expected = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time compare
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function deriveStatus(eventType: string, payloadStatus?: string): string | null {
  // Map common PFM lifecycle events / statuses onto our content_posts.status
  // vocabulary: 'scheduled' | 'publishing' | 'published' | 'failed'.
  const t = (eventType || "").toLowerCase();
  const s = (payloadStatus || "").toLowerCase();

  if (s === "published" || t.includes("published") || t.includes("post.success")) return "published";
  if (s === "failed" || s === "error" || t.includes("failed") || t.includes("error")) return "failed";
  if (s === "publishing" || s === "processing" || t.includes("processing")) return "publishing";
  if (s === "scheduled" || t.includes("scheduled")) return "scheduled";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-PostForMe-Signature")
    || req.headers.get("X-Webhook-Signature")
    || req.headers.get("Webhook-Signature");

  if (!(await verifySignature(rawBody, signature))) {
    return new Response(JSON.stringify({ error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // PFM event shape isn't fully documented in the public OpenAPI spec, so we
  // probe a handful of likely paths.
  const data = (payload.data ?? payload) as Record<string, unknown>;
  const postId = (data.post_id as string)
    ?? (data.social_post_id as string)
    ?? ((data.post as { id?: string })?.id)
    ?? ((data.social_post as { id?: string })?.id);
  const eventType = (payload.type as string) || (payload.event as string) || "";
  const status = (data.status as string) || ((data.result as { status?: string })?.status);
  const platform = (data.platform as string) || ((data.account as { platform?: string })?.platform);
  const platformPostId = (data.platform_post_id as string)
    || ((data.result as { platform_post_id?: string })?.platform_post_id);

  if (!postId) {
    console.warn("postforme-webhook: no post id found in payload, ignoring", { eventType });
    return new Response(JSON.stringify({ ok: true, ignored: "no_post_id" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const newStatus = deriveStatus(eventType, status);
  if (!newStatus) {
    console.log("postforme-webhook: unmapped event, ignoring", { eventType, status });
    return new Response(JSON.stringify({ ok: true, ignored: "unmapped_event" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === "published") {
    updates.published_at = new Date().toISOString();
    if (platformPostId) updates.platform_post_id = platformPostId;
  }

  let query = supabase
    .from("content_posts")
    .update(updates)
    .eq("postforme_post_id", postId);

  // If the event is platform-scoped (e.g. one platform succeeded while another
  // is still pending), narrow the update to that platform's mirror row.
  if (platform) query = query.eq("platform", platform.toLowerCase());

  const { error, count } = await query.select("id", { count: "exact" });
  if (error) {
    console.error("postforme-webhook update failed:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, updated: count ?? 0, status: newStatus }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
