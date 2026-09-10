import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * schedule-batch
 *
 * The back door for scheduling posts WITHOUT a browser session: Claude (or a
 * script) drops a folder of videos, and this function does what Compose and
 * Drop Zone do from the app, on the server, gated by the cron secret.
 *
 * Every call: POST { action, ... } with either { cronSecret } in the body or
 * the service-role key as a bearer token. Actions:
 *
 *   upload-url  { filename, contentType }
 *       Asks Post for Me for a direct upload URL. The caller PUTs the file
 *       there; the returned media URL goes into `create`. Files never touch
 *       the app's storage (50 MB cap on the Free plan; clips are 75–250 MB).
 *
 *   create      { brandId, socialAccountIds, caption, mediaUrls, scheduledAt,
 *                 mediaType?, youtubeTitle?, dryRun? }
 *       mediaType is 'video' (default), 'image' or 'carousel'. It is what the
 *       mirror rows record, and it is a guard: YouTube only takes video, so an
 *       image post aimed at a YouTube account is refused before Post for Me
 *       sees it. TikTok photo posts and Instagram/Threads carousels are fine.
 *       One Post for Me post for the given accounts (all must be mapped to
 *       brandId, and brandId must belong to the default user), scheduled at
 *       scheduledAt (ISO, UTC). Mirrors one content_posts row per account,
 *       provider 'postforme', so Schedule and Analytics see it. dryRun
 *       validates and returns the payload without calling Post for Me.
 *
 *   status      { postIds: [...] }
 *       Post for Me's own status and per-account results for up to 20 posts.
 *
 *   list        { brandId }
 *       Upcoming scheduled rows for review.
 *
 * Single-tenant on purpose: the only brands it will touch are the default
 * user's. Widening it to other users means widening the trust model, and
 * that is a decision, not a parameter.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PFM_KEY = Deno.env.get("Post_For_Me_API");
const CRON_SECRET = Deno.env.get("Cron_Secret");
const DEFAULT_USER = Deno.env.get("Default_PFM_User_Id");
const PFM_BASE = "https://api.postforme.dev";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function pfm(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${PFM_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${PFM_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

interface AccountRow {
  pfm_account_id: string;
  platform: string;
  username: string | null;
}

async function resolveBrand(supabase: SupabaseClient, brandId: unknown): Promise<{ id: string; owner_id: string }> {
  if (typeof brandId !== "string" || !brandId) throw new Error("brandId is required");
  const { data, error } = await supabase.from("brands").select("id, owner_id").eq("id", brandId).maybeSingle();
  if (error) throw new Error(`brand lookup: ${error.message}`);
  if (!data) throw new Error("Unknown brand");
  if (data.owner_id !== DEFAULT_USER) throw new Error("schedule-batch only serves the default user's brands");
  return data as { id: string; owner_id: string };
}

async function resolveAccounts(supabase: SupabaseClient, brandId: string, ids: unknown): Promise<AccountRow[]> {
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === "string")) {
    throw new Error("socialAccountIds must be a non-empty array of Post for Me account ids");
  }
  const { data, error } = await supabase
    .from("brand_social_accounts")
    .select("pfm_account_id, platform, username")
    .eq("brand_id", brandId)
    .in("pfm_account_id", ids as string[]);
  if (error) throw new Error(`account lookup: ${error.message}`);
  const rows = (data ?? []) as AccountRow[];
  const missing = (ids as string[]).filter((id) => !rows.some((r) => r.pfm_account_id === id));
  if (missing.length) throw new Error(`Not mapped to this brand: ${missing.join(", ")}`);
  return rows;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  // Two callers: pg_cron style ({ cronSecret } in the body) and a script
  // holding the project's service-role key as a bearer. Real key comparison,
  // same as instagram-sync: a decoded role claim alone would be forgeable.
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  const isCron = !!body.cronSecret && !!CRON_SECRET && body.cronSecret === CRON_SECRET;
  const isServiceRole = bearer !== "" && !!SERVICE_KEY && bearer === SERVICE_KEY.trim();
  if (!isCron && !isServiceRole) return json({ error: "Unauthorized" }, 401);
  if (!PFM_KEY || !DEFAULT_USER) return json({ error: "Missing Post_For_Me_API or Default_PFM_User_Id" }, 500);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const action = body.action;

  try {
    if (action === "upload-url") {
      const payload: Record<string, unknown> = {};
      if (typeof body.filename === "string") payload.file_name = body.filename;
      if (typeof body.contentType === "string") payload.content_type = body.contentType;
      const r = await pfm("/v1/media/create-upload-url", { method: "POST", body: JSON.stringify(payload) });
      const data = await r.json().catch(() => null);
      return json({ ok: r.ok, status: r.status, data }, r.ok ? 200 : 502);
    }

    if (action === "status") {
      // Ground truth from Post for Me for one or more posts: status plus the
      // per-account results, which is where a platform rejection shows up.
      const ids = Array.isArray(body.postIds) ? (body.postIds as unknown[]).filter((x) => typeof x === "string") as string[] : [];
      if (ids.length === 0 || ids.length > 20) throw new Error("postIds: 1 to 20 Post for Me post ids");
      const out: Record<string, unknown>[] = [];
      for (const id of ids) {
        const r = await pfm(`/v1/social-posts/${encodeURIComponent(id)}`, { method: "GET" });
        const post = await r.json().catch(() => null);
        const rr = await pfm(`/v1/social-post-results?post_id=${encodeURIComponent(id)}&limit=50`, { method: "GET" });
        const results = await rr.json().catch(() => null);
        // The results endpoint ignores the filter and returns everything, so
        // keep only the rows that belong to this post.
        const all = Array.isArray(results?.data) ? results.data as Record<string, unknown>[] : [];
        const belongs = (x: Record<string, unknown>) =>
          x.social_post_id === id || x.post_id === id || (x.social_post as Record<string, unknown> | undefined)?.id === id;
        const rows = all.some(belongs) ? all.filter(belongs) : all;
        out.push({ id, http: r.status, status: post?.status ?? null, scheduled_at: post?.scheduled_at ?? null,
          filtered: all.some(belongs), result_keys: all[0] ? Object.keys(all[0]) : [],
          results: rows.map((x: Record<string, unknown>) => ({
            account: x.social_account_id, success: x.success, error: x.error ?? null, details: x.details ?? null,
            platform_data: x.platform_data ?? null, social_post_id: x.social_post_id ?? x.post_id ?? null })) });
      }
      return json({ ok: true, posts: out });
    }

    if (action === "accounts") {
      // Connection state per account, tokens stripped. Enough to tell a dead
      // TikTok connection from a rejected post.
      const r = await pfm("/v1/social-accounts?limit=50", { method: "GET" });
      const data = await r.json().catch(() => null);
      const rows = Array.isArray(data?.data) ? data.data : [];
      return json({ ok: r.ok, accounts: rows.map((a: Record<string, unknown>) => ({
        id: a.id, platform: a.platform, username: a.username, status: a.status,
        access_token_expires_at: a.access_token_expires_at, refresh_token_expires_at: a.refresh_token_expires_at,
        metadata: a.metadata ?? null })) });
    }

    if (action === "list") {
      const brand = await resolveBrand(supabase, body.brandId);
      const { data, error } = await supabase
        .from("content_posts")
        .select("id, platform, account_username, caption, scheduled_for, status, publish_status, postforme_post_id, media_urls")
        .eq("brand_id", brand.id)
        .eq("provider", "postforme")
        .gte("scheduled_for", new Date(Date.now() - 6 * 3600_000).toISOString())
        .order("scheduled_for", { ascending: true });
      if (error) throw new Error(error.message);
      return json({ ok: true, rows: data ?? [] });
    }

    if (action === "create") {
      const brand = await resolveBrand(supabase, body.brandId);
      const accounts = await resolveAccounts(supabase, brand.id, body.socialAccountIds);
      const caption = typeof body.caption === "string" ? body.caption : "";
      const mediaUrls = Array.isArray(body.mediaUrls) ? (body.mediaUrls as unknown[]).filter((u) => typeof u === "string") as string[] : [];
      if (mediaUrls.length === 0) throw new Error("mediaUrls is required");
      const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt : null;
      if (!scheduledAt || Number.isNaN(Date.parse(scheduledAt))) throw new Error("scheduledAt must be an ISO timestamp");
      if (Date.parse(scheduledAt) < Date.now() + 5 * 60_000) throw new Error("scheduledAt must be at least 5 minutes in the future");
      const youtubeTitle = typeof body.youtubeTitle === "string" && body.youtubeTitle.trim() ? body.youtubeTitle.trim().slice(0, 90) : null;
      const mediaType = body.mediaType === "image" || body.mediaType === "carousel" ? body.mediaType : "video";
      if (mediaType !== "video" && accounts.some((a) => a.platform === "youtube")) {
        throw new Error("YouTube only takes video; drop the YouTube account for image posts");
      }
      if (mediaType === "carousel" && mediaUrls.length < 2) throw new Error("A carousel needs at least two media URLs");

      const pfmBody: Record<string, unknown> = {
        caption,
        social_accounts: accounts.map((a) => a.pfm_account_id),
        external_id: brand.owner_id,
        media: mediaUrls.map((url) => ({ url })),
        scheduled_at: scheduledAt,
      };
      if (youtubeTitle && accounts.some((a) => a.platform === "youtube")) {
        pfmBody.platform_configurations = { youtube: { title: youtubeTitle } };
      }

      if (body.dryRun) return json({ ok: true, dryRun: true, pfmBody, accounts });

      const r = await pfm("/v1/social-posts", { method: "POST", body: JSON.stringify(pfmBody) });
      const post = await r.json().catch(() => null);
      if (!r.ok || !post?.id) return json({ ok: false, status: r.status, error: "Post for Me rejected the post", detail: post }, 502);

      const rows = accounts.map((a) => ({
        user_id: brand.owner_id,
        brand_id: brand.id,
        platform: a.platform,
        social_account_id: a.pfm_account_id,
        account_username: a.username,
        caption,
        media_urls: mediaUrls,
        media_type: mediaType,
        scheduled_date: scheduledAt,
        scheduled_for: scheduledAt,
        status: "scheduled",
        provider: "postforme",
        postforme_post_id: post.id,
        content_type: a.platform === "youtube" ? "short" : "post",
      }));
      const { data: inserted, error: insErr } = await supabase.from("content_posts").insert(rows).select("id, platform");
      if (insErr) return json({ ok: true, postId: post.id, mirrorError: insErr.message }, 207);
      return json({ ok: true, postId: post.id, scheduledAt, rows: inserted });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
});
