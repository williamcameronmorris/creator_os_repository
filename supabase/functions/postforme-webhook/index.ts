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
 * Signature scheme: PFM signs with a Svix-style scheme (secret has the
 * `whsec_` prefix). The signed content is `${id}.${timestamp}.${rawBody}`,
 * HMAC-SHA256, base64-encoded, delivered in a space-separated
 * `webhook-signature: v1,<sig> v2,<sig>` header with `webhook-id` and
 * `webhook-timestamp` companions. Because this secret isn't standard-length
 * base64, we can't be sure PFM base64-decodes the key vs. uses it raw, so we
 * accept a match under EITHER key interpretation — both are secret-gated, so
 * neither is forgeable without the secret. Tighten to the confirmed scheme
 * once a real event is observed in the logs.
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
  "Access-Control-Allow-Headers":
    "Content-Type, X-PostForMe-Signature, X-Webhook-Signature, Webhook-Id, Webhook-Timestamp, Webhook-Signature, Svix-Id, Svix-Timestamp, Svix-Signature",
};

function firstHeader(req: Request, names: string[]): string | null {
  for (const n of names) {
    const v = req.headers.get(n);
    if (v) return v;
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacBase64(keyBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/**
 * Verify a Svix-style signature. Returns true when the computed HMAC matches
 * any `v*,<sig>` entry in the signature header, under either key
 * interpretation (base64-decoded or raw). Fails CLOSED when the secret or any
 * required header is missing — postforme-sync reconciles status on its 6h
 * poll, so real events aren't lost, but set Post_For_Me_Webhook_Secret for
 * real-time updates.
 */
async function verifySignature(
  rawBody: string,
  id: string | null,
  timestamp: string | null,
  signatureHeader: string | null,
): Promise<boolean> {
  if (!WEBHOOK_SECRET || !id || !timestamp || !signatureHeader) return false;

  const signedContent = `${id}.${timestamp}.${rawBody}`;

  // Candidate signing keys. Standard Svix base64-decodes the part after
  // `whsec_`; some implementations sign with the raw string. Try both.
  const rawSecret = WEBHOOK_SECRET.startsWith("whsec_")
    ? WEBHOOK_SECRET.slice(6)
    : WEBHOOK_SECRET;
  const keyCandidates: Uint8Array[] = [];
  try {
    keyCandidates.push(Uint8Array.from(atob(rawSecret), (c) => c.charCodeAt(0)));
  } catch {
    // rawSecret isn't valid base64 — skip this interpretation
  }
  keyCandidates.push(new TextEncoder().encode(rawSecret));

  const expected: string[] = [];
  for (const keyBytes of keyCandidates) {
    expected.push(await hmacBase64(keyBytes, signedContent));
  }

  // Header is a space-separated list of "<version>,<base64sig>" entries.
  const provided = signatureHeader.split(" ").map((part) => {
    const comma = part.indexOf(",");
    return comma >= 0 ? part.slice(comma + 1) : part;
  });

  for (const sig of provided) {
    for (const exp of expected) {
      if (constantTimeEqual(sig, exp)) return true;
    }
  }
  return false;
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
  const webhookId = firstHeader(req, ["webhook-id", "svix-id", "Webhook-Id", "Svix-Id"]);
  const webhookTimestamp = firstHeader(req, [
    "webhook-timestamp",
    "svix-timestamp",
    "Webhook-Timestamp",
    "Svix-Timestamp",
  ]);
  const signature = firstHeader(req, [
    "webhook-signature",
    "svix-signature",
    "Webhook-Signature",
    "Svix-Signature",
    "X-PostForMe-Signature",
    "X-Webhook-Signature",
  ]);

  const ok = await verifySignature(rawBody, webhookId, webhookTimestamp, signature);
  if (!ok) {
    // One-line diagnostic (no secret logged) so a real event's actual header
    // shape can be confirmed from the logs if verification ever misses.
    console.warn("postforme-webhook: signature rejected", {
      hasSecret: !!WEBHOOK_SECRET,
      haveId: !!webhookId,
      haveTs: !!webhookTimestamp,
      haveSig: !!signature,
      headerNames: [...req.headers.keys()],
    });
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
  // Social account id, when the event carries one — with multi-account
  // support this pins the update to the exact per-account mirror row.
  const socialAccountId = (data.social_account_id as string)
    || ((data.account as { id?: string })?.id)
    || null;
  const platformPostId = (data.platform_post_id as string)
    || ((data.result as { platform_post_id?: string })?.platform_post_id);
  // external_id should equal the Cliopatra user.id we stamped on the post.
  // Used to scope the update so a malformed event can't ever cross tenants.
  const externalId = (data.external_id as string)
    || ((data.post as { external_id?: string })?.external_id)
    || ((data.social_post as { external_id?: string })?.external_id)
    || null;

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

  const buildQuery = (narrowByAccount: boolean) => {
    let query = supabase
      .from("content_posts")
      .update(updates)
      .eq("postforme_post_id", postId);

    // With multi-account support (postforme_post_id, platform) is no longer
    // unique — narrow to the exact account's mirror row when the event
    // identifies it.
    if (narrowByAccount && socialAccountId) {
      query = query.eq("social_account_id", socialAccountId);
    }

    // If the event is platform-scoped (e.g. one platform succeeded while another
    // is still pending), narrow the update to that platform's mirror row(s).
    if (platform) query = query.eq("platform", platform.toLowerCase());

    // Defense-in-depth: scope the update to the tenant the event belongs to.
    // Even though postforme_post_id is unique, this prevents a malformed or
    // spoofed event from ever updating another user's row.
    if (externalId) query = query.eq("user_id", externalId);

    return query;
  };

  let { error, count } = await buildQuery(true).select("id", { count: "exact" });

  // Legacy rows (created before multi-account) have social_account_id = null,
  // so an account-narrowed update matches nothing — fall back to the original
  // platform + external_id narrowing.
  if (!error && (count ?? 0) === 0 && socialAccountId) {
    ({ error, count } = await buildQuery(false).select("id", { count: "exact" }));
  }

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
