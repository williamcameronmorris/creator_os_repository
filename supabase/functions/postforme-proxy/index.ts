import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const PFM_BASE = "https://api.postforme.dev";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ALLOWED_PREFIXES = [
  "/v1/social-accounts",
  "/v1/social-posts",
  "/v1/social-post-results",
  "/v1/social-post-previews",
  "/v1/social-account-feeds/",
  "/v1/media/create-upload-url",
];

const ALLOWED_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function pathAllowed(path: string): boolean {
  return ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
}

/**
 * Multi-tenancy: PFM accounts and posts are tagged with `external_id` =
 * Cliopatra user.id. The proxy enforces this server-side rather than trusting
 * the client:
 *
 *   GET /v1/social-accounts*       → auto-append ?external_id={user.id}
 *   GET /v1/social-posts*          → auto-append ?external_id={user.id}
 *   POST /v1/social-accounts/auth-url → force body.external_id = user.id
 *   POST /v1/social-posts          → force body.external_id = user.id
 *
 * Per-account operations (disconnect, get-by-id) and feed reads still rely on
 * the caller knowing the right account id. We could add a server-side check
 * (look up the account, verify external_id matches) but for v1 single-tenant
 * usage that's overkill — flagged for follow-up when there are multiple users.
 */
function shouldFilterListByExternalId(method: string, path: string): boolean {
  if (method !== "GET") return false;
  // Filter only the top-level list endpoints. Path with an ID after the prefix
  // is a single-resource read where the filter would be meaningless.
  const isAccountsList = path === "/v1/social-accounts" || path.startsWith("/v1/social-accounts?");
  const isPostsList = path === "/v1/social-posts" || path.startsWith("/v1/social-posts?");
  const isPostResultsList = path === "/v1/social-post-results" || path.startsWith("/v1/social-post-results?");
  return isAccountsList || isPostsList || isPostResultsList;
}

function shouldStampBodyExternalId(method: string, path: string): boolean {
  if (method !== "POST") return false;
  if (path === "/v1/social-accounts/auth-url") return true;
  if (path === "/v1/social-posts") return true;
  return false;
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

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing bearer token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: userData, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !userData?.user) {
    return new Response(JSON.stringify({ error: "Invalid session" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const userId = userData.user.id;

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

  if (!ALLOWED_METHODS.has(method)) {
    return new Response(JSON.stringify({ error: `Method ${method} not allowed` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!pathAllowed(path)) {
    return new Response(JSON.stringify({ error: `Path ${path} not allowed` }), {
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
  if (shouldFilterListByExternalId(method, path)) {
    // Always set, never trust client-supplied value
    sp.set("external_id", userId);
  }
  const qs = sp.toString();
  if (qs) url += (url.includes("?") ? "&" : "?") + qs;

  // Stamp external_id into POST bodies for create operations
  let bodyToSend = payload.body;
  if (shouldStampBodyExternalId(method, path)) {
    if (bodyToSend && typeof bodyToSend === "object" && !Array.isArray(bodyToSend)) {
      bodyToSend = { ...(bodyToSend as Record<string, unknown>), external_id: userId };
    } else {
      bodyToSend = { external_id: userId };
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
