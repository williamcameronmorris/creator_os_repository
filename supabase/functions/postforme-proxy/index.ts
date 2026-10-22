import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { classify } from "./routes.ts";
import { requireUser } from "../_shared/auth.ts";

const PFM_BASE = "https://api.postforme.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

/**
 * Multi-tenancy: PFM is one shared workspace, and accounts and posts are
 * tagged with `external_id` = Cliopatra user.id. The proxy forwards ONLY the
 * operations the app uses, each scoped to the caller server-side:
 *
 *   GET  /v1/social-accounts               → ?external_id={user.id} forced
 *   POST /v1/social-accounts/auth-url      → body.external_id = user.id
 *   POST /v1/social-accounts/{id}/disconnect → only if {id} is one of the
 *                                             caller's accounts
 *   POST /v1/social-posts                  → body.external_id = user.id, and
 *                                             every social_accounts id must
 *                                             be one of the caller's
 *
 * It used to allow every path under six prefixes and scope only the list
 * calls, so anyone signed in could read another user's account feed or
 * disconnect, edit or delete their accounts and posts given the id, and a
 * create could target any account id at all.
 */

/** The ids of `userId`'s Post for Me accounts. */
async function ownedAccountIds(apiKey: string, userId: string): Promise<Set<string>> {
  const res = await fetch(
    `${PFM_BASE}/v1/social-accounts?external_id=${encodeURIComponent(userId)}`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!res.ok) throw new Error(`Could not verify account ownership (${res.status})`);
  const body = await res.json();
  const list: { id?: string; external_id?: string }[] = Array.isArray(body) ? body : (body?.data || []);
  return new Set(list.filter((a) => a.id && a.external_id === userId).map((a) => a.id as string));
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const auth = await requireUser(req, admin);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  let payload: { method?: string; path?: string; body?: unknown; query?: Record<string, string | string[]> };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const method = (payload.method || "GET").toUpperCase();
  const path = payload.path || "";

  const route = classify(method, path);
  if (!route) {
    return new Response(JSON.stringify({ error: `${method} ${path} is not allowed` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("Post_For_Me_API");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured: missing Post_For_Me_API" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Build URL with auto-injected external_id filter where applicable
  let url = `${PFM_BASE}${path}`;
  const sp = new URLSearchParams();
  if (payload.query) {
    for (const [k, v] of Object.entries(payload.query)) {
      if (Array.isArray(v)) v.forEach((x) => sp.append(k, x));
      else sp.append(k, v);
    }
  }
  if (route.op === "list_accounts") {
    // Always set, never trust client-supplied value
    sp.set("external_id", userId);
  }
  const qs = sp.toString();
  if (qs) url += (url.includes("?") ? "&" : "?") + qs;

  // Stamp external_id into POST bodies for create operations
  let bodyToSend = payload.body;
  if (route.op === "auth_url" || route.op === "create_post") {
    if (bodyToSend && typeof bodyToSend === "object" && !Array.isArray(bodyToSend)) {
      bodyToSend = { ...(bodyToSend as Record<string, unknown>), external_id: userId };
    } else {
      bodyToSend = { external_id: userId };
    }
  }

  // Account-targeted operations: every account id must be the caller's.
  if (route.op === "disconnect_account" || route.op === "create_post") {
    const requested = route.op === "disconnect_account"
      ? [route.accountId]
      : (bodyToSend as { social_accounts?: unknown }).social_accounts;
    if (!Array.isArray(requested) || requested.length === 0 || !requested.every((id) => typeof id === "string" && id)) {
      return new Response(JSON.stringify({ error: "social_accounts must be a non-empty list of account ids" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    try {
      const owned = await ownedAccountIds(apiKey, userId);
      if (!requested.every((id) => owned.has(id as string))) {
        return new Response(JSON.stringify({ error: "That account is not yours" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  };
  if (method !== "GET" && method !== "DELETE" && bodyToSend !== undefined) {
    init.body = JSON.stringify(bodyToSend);
  }

  try {
    const upstream = await fetch(url, init);
    const text = await upstream.text();
    let data: unknown = text;
    try { data = text ? JSON.parse(text) : null; } catch { /* keep text */ }
    return new Response(JSON.stringify({ status: upstream.status, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
