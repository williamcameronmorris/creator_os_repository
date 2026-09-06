/**
 * Shared auth helpers for edge functions.
 *
 * Project convention is to deploy edge functions with `--no-verify-jwt` and
 * verify the bearer token internally with the SERVICE_ROLE key. Without this
 * helper every function rolls its own check (or skips it), which is how we
 * ended up with several functions accepting an arbitrary `userId` in the body.
 *
 * Usage:
 *
 *   const auth = await requireUser(req, supabase);
 *   if (!auth.ok) return auth.response;   // 401 already built
 *   const userId = auth.userId;           // safe: token-verified
 *
 *   // Or, for cron-triggered functions, accept either a bearer token OR a
 *   // pre-shared secret in the body:
 *
 *   const auth = await requireUserOrCron(req, supabase, body, "Cron_Secret");
 *   if (!auth.ok) return auth.response;
 *   const userId = auth.userId;
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
  const expected = Deno.env.get(envSecretName);
  if (body.cronSecret && expected && body.cronSecret === expected) {
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
 *   - Without one: the user's default brand (brands.is_default). Right for
 *     user-level work: cron briefs, comments pulled through the direct grants.
 *
 * Never accept a brandId from the request body. The account id is the only
 * client-supplied scope, and it is validated against ownership here.
 */
export async function resolveBrandId(
  supabase: SupabaseClient,
  userId: string,
  socialAccountId?: string | null,
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
