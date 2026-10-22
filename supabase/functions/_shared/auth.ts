/**
 * Shared auth helpers for edge functions. EVERY function authenticates
 * through one of these; scripts/check-guards.mjs fails CI on a function that
 * calls auth.getUser itself or compares a bearer to the service key inline.
 *
 * Project convention is to deploy edge functions with `--no-verify-jwt` and
 * verify inside. Before these helpers every function rolled its own check
 * (or skipped it), which is how several once accepted an arbitrary `userId`
 * in the body.
 *
 *   requireUser(req, supabase)                → signed-in caller only
 *   requireUserOrCron(req, supabase, body)    → cron secret, else a user
 *   requireService(req)                       → internal: service-role bearer
 *   requireServiceOrCron(req, body)           → scheduled/internal jobs
 *   optionalUser(req, supabase)               → public endpoints that behave
 *                                               differently for the owner
 *
 *   const auth = await requireUser(req, supabase);
 *   if (!auth.ok) return auth.response;   // 401 already built
 *   const userId = auth.userId;           // safe: token-verified
 *
 * Functions with no caller identity at all (signed webhooks) declare it with
 * an `@auth-exempt: <reason>` line in their header instead.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type AuthOk = { ok: true; userId: string; isCron: false };
type AuthCronOk = { ok: true; userId: string; isCron: true };
type AuthFail = { ok: false; response: Response };
export type AuthResult = AuthOk | AuthFail;
export type AuthOrCronResult = AuthOk | AuthCronOk | AuthFail;

/** Constant-time string compare for secrets. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function bearerOf(req: Request): string {
  const header = req.headers.get("Authorization") ?? "";
  return header.replace(/^Bearer\s+/i, "").trim();
}

/** True when the caller presented this project's service-role key. */
export function isServiceBearer(req: Request): boolean {
  const key = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  const bearer = bearerOf(req);
  return key !== "" && bearer !== "" && safeEqual(bearer, key);
}

/** True when the body carries the shared cron secret. */
export function isCronBody(body: { cronSecret?: unknown } | null | undefined, envSecretName = "Cron_Secret"): boolean {
  const expected = Deno.env.get(envSecretName);
  const given = body?.cronSecret;
  return !!expected && typeof given === "string" && given !== "" && safeEqual(given, expected);
}

function unauthorized(message = "Unauthorized"): AuthFail {
  return {
    ok: false,
    response: new Response(JSON.stringify({ error: message }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }),
  };
}

/**
 * Require a valid Supabase session bearer token. Returns the verified user id.
 * Always ignore body.userId — the only trustworthy id is the one bound to the
 * caller's session.
 */
export async function requireUser(
  req: Request,
  supabase: SupabaseClient,
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return unauthorized("Missing bearer token");

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return unauthorized("Invalid session");

  return { ok: true, userId: data.user.id, isCron: false };
}

/**
 * Accept either a valid bearer token (user mode) or a pre-shared secret in
 * the request body (cron mode). For cron mode you must also pass
 * `body.userId` (or set Default_PFM_User_Id in env as a fallback target).
 */
export async function requireUserOrCron(
  req: Request,
  supabase: SupabaseClient,
  body: { cronSecret?: string; userId?: string },
  envSecretName = "Cron_Secret",
  envDefaultUserName = "Default_PFM_User_Id",
): Promise<AuthOrCronResult> {
  if (isCronBody(body, envSecretName)) {
    const userId = body.userId || Deno.env.get(envDefaultUserName);
    if (!userId) return unauthorized("Cron mode requires userId in body or default-user env var");
    return { ok: true, userId, isCron: true };
  }
  return await requireUser(req, supabase);
}

/**
 * Resolve the brand a write belongs to. Brands are fully isolated tenants
 * (migration 20260828203000_add_brands.sql), so every brand-scoped row an edge
 * function writes must carry the brand of the account it came from.
 *
 *   - With a Post for Me `socialAccountId`: the brand that account is mapped
 *     to in brand_social_accounts. The mapping must belong to `userId`. An
 *     unmapped or foreign account THROWS rather than falling back, because
 *     silently filing one brand's data under another is the exact bug this
 *     layer exists to prevent.
 *   - Else with a `brandId` from the caller (the switcher's active brand for
 *     "all accounts" work): that brand, after verifying `userId` owns it.
 *   - Else, ONLY when `allowDefault` is true: the user's default brand
 *     (brands.is_default). That is right for user-level work with no brand in
 *     the request: cron briefs, the sync's voice rebuild, comments pulled
 *     through the direct grants. A client call that lands here has sent no
 *     brand (the brand context had not loaded), and guessing the default
 *     would file one brand's work under another, so it throws instead.
 *
 * Nothing client-supplied is trusted as-is: the account id is checked against
 * its mapping's owner, the brand id against brands.owner_id.
 */
export async function resolveBrandId(
  supabase: SupabaseClient,
  userId: string,
  socialAccountId?: string | null,
  brandId?: string | null,
  allowDefault = false,
): Promise<string> {
  if (socialAccountId) {
    const { data: mapping, error } = await supabase
      .from("brand_social_accounts")
      .select("brand_id, brands!inner(owner_id)")
      .eq("pfm_account_id", socialAccountId)
      .maybeSingle();
    if (error) throw new Error(`brand lookup for account ${socialAccountId}: ${error.message}`);
    const rel = mapping?.brands as { owner_id?: string } | { owner_id?: string }[] | null | undefined;
    const ownerId = Array.isArray(rel) ? rel[0]?.owner_id : rel?.owner_id;
    if (!mapping || ownerId !== userId) {
      throw new Error(
        `Account ${socialAccountId} is not mapped to one of your brands. Reconnect it under Office > Connections.`,
      );
    }
    return mapping.brand_id as string;
  }

  if (brandId) {
    const { data: own, error: ownErr } = await supabase
      .from("brands")
      .select("id")
      .eq("id", brandId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (ownErr) throw new Error(`brand lookup: ${ownErr.message}`);
    if (!own) throw new Error("That brand is not yours");
    return own.id as string;
  }

  if (!allowDefault) {
    throw new Error("No brand was given for this request. Reload the app and try again.");
  }

  const { data: brand, error } = await supabase
    .from("brands")
    .select("id")
    .eq("owner_id", userId)
    .eq("is_default", true)
    .maybeSingle();
  if (error) throw new Error(`default brand lookup: ${error.message}`);
  if (!brand) throw new Error(`No default brand for user ${userId}`);
  return brand.id as string;
}

type InternalOk = { ok: true; via: "service" | "cron" };

/**
 * Internal callers only: another edge function or a script holding the
 * service-role key. Functions behind this trust `userId` from the body, so a
 * user session must never get through.
 */
export function requireService(req: Request): { ok: true; via: "service" } | AuthFail {
  return isServiceBearer(req) ? { ok: true, via: "service" } : unauthorized("Internal function");
}

/**
 * Scheduled or internal jobs: the shared cron secret in the body (how pg_cron
 * calls, since its vault copy of the key stopped matching after the API key
 * migration) or the service-role bearer.
 */
export function requireServiceOrCron(
  req: Request,
  body: { cronSecret?: unknown } | null | undefined,
  envSecretName = "Cron_Secret",
): InternalOk | AuthFail {
  if (isCronBody(body, envSecretName)) return { ok: true, via: "cron" };
  if (isServiceBearer(req)) return { ok: true, via: "service" };
  return unauthorized("Unauthorized: cron-only function");
}

/**
 * Public endpoints that treat the owner differently (no view count on their
 * own media kit). Returns the verified user id, or null for anyone else or a
 * bad token. Never a failure: the endpoint is public either way.
 */
export async function optionalUser(req: Request, supabase: SupabaseClient): Promise<string | null> {
  const token = bearerOf(req);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  return error || !data?.user ? null : data.user.id;
}
