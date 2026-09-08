import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * schedule-batch
 *
 * The back door for scheduling posts WITHOUT a browser session: Claude (or a
 * script) drops a folder of videos, and this function does what Compose and
 * Drop Zone do from the app, on the server, gated by the cron secret.
 *
 * Every call: POST { cronSecret, action, ... }. Actions:
 *
 *   upload-url  { filename, contentType }
 *       Asks Post for Me for a direct upload URL. The caller PUTs the file
 *       there; the returned media URL goes into `create`. Files never touch
 *       the app's storage (50 MB cap on the Free plan; clips are 75–250 MB).
 *
 *   create      { brandId, socialAccountIds, caption, mediaUrls, scheduledAt,
 *                 youtubeTitle?, dryRun? }
 *       One Post for Me post for the given accounts (all must be mapped to
 *       brandId, and brandId must belong to the default user), scheduled at
 *       scheduledAt (ISO, UTC). Mirrors one content_posts row per account,
 *       provider 'postforme', so Schedule and Analytics see it. dryRun
 *       validates and returns the payload without calling Post for Me.
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
  if (!body.cronSecret || !CRON_SECRET || body.cronSecret !== CRON_SECRET) return json({ error: "Unauthorized" }, 401);
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
        media_type: "video",
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
