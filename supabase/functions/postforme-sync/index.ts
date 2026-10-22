import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { syncForUser, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } from "./sync.ts";
import { requireUserOrCron } from "../_shared/auth.ts";

/**
 * postforme-sync
 *
 * Pulls connected-account state and post analytics from Post for Me into our
 * own tables so OfficeHub, Clio, and any other surface can read real numbers
 * without making round-trips to PFM on every render.
 *
 * Two modes:
 *
 *   1. User-triggered (default)
 *      Caller sends `Authorization: Bearer <user-jwt>`. We verify the JWT,
 *      pull the user's id, and sync that user.
 *
 *   2. Cron-triggered
 *      Caller sends `{ cronSecret: "..." }` in the body. If it matches the
 *      `Cron_Secret` Supabase secret, we sync the user whose id is stored in
 *      the `Default_PFM_User_Id` Supabase secret. (Single-tenant for now —
 *      Cam's PFM workspace is shared, so all accounts belong to one user.)
 *
 * METRICS SOURCE (changed 2026-08-21):
 *
 *   Metrics now come from the ACCOUNT FEED with `?expand=metrics`, not from
 *   /v1/social-post-results. A live probe against all five connected accounts
 *   showed social-post-results returns zero rows (it only ever covers posts
 *   PFM itself published), which is why platform_metrics had gone stale while
 *   this function reported success every six hours. The feed returns real
 *   lifetime metrics for every post on every connected account:
 *
 *     instagram  views reach likes comments shares saved follows
 *                profile_visits profile_activity total_interactions
 *     youtube    views likes comments dislikes
 *     tiktok     view_count like_count comment_count share_count
 *     threads    views likes replies reposts quotes shares
 *     facebook   reactions_total video_views reach comments shares (+video_*)
 *
 *   social-post-results is still queried, but only to mirror status onto posts
 *   Cliopatra published through PFM. It is no longer the source of the
 *   platform_metrics roll-up.
 *
 * RECONCILE (changed 2026-09-09):
 *
 *   Compose and schedule-batch book one content_posts row per account when a
 *   post is scheduled (provider 'postforme', postforme_post_id 'sp_…', no
 *   platform_post_id). Once it publishes, the feed lists it with
 *   `social_post_id` — the same 'sp_…' id — so the feed pass now UPDATES the
 *   booked row (status, publish_status, published_at, platform_post_id,
 *   platform_url, metrics) instead of importing a second, published-only row.
 *   Before this, Schedule kept showing the booked row as scheduled and every
 *   per-post count doubled. Feed posts with no booked row are still imported.
 *
 *   The results pass was also dead: PFM results carry `success` and
 *   `platform_data.{id,url}`, not the `status`/`platform`/`platform_post_id`
 *   fields it looked for, so every result was dropped. It now reads the real
 *   fields, marks failed posts 'failed', and never writes zero metrics over
 *   what the feed stamped.
 *
 *   TikTok (2026-09-10): its feed items carry no social_post_id, and its
 *   result reports a publish handle ('v_pub_file~…'), not the video id. So
 *   TikTok booked rows are paired by account + a 30-minute window around
 *   scheduled_for (reconcile.ts matchByPublishWindow), and publish handles
 *   are never written to platform_post_id.
 *
 *   Feeds are walked two accounts at a time with a backoff on HTTP 429; nine
 *   in parallel had PFM rate-limiting five of them every run.
 *
 * PFM does NOT expose follower counts anywhere in its public API (verified
 * against the account object, which carries only id/platform/username/status/
 * tokens/profile_photo_url/metadata). followers_count therefore stays owned by
 * instagram-sync and youtube-sync. This function CARRIES the newest known
 * count forward when it opens a new day's row (2026-09-14): the column
 * defaults to 0, so the midnight run used to create the row at 0 and every
 * follower surface summed zeros until the direct syncs patched it at 03:00.
 *
 * An account whose feed comes back 2xx with no posts, or with posts but no
 * metrics block, is reported in summary.errors (2026-09-14). Gibsunday's
 * Instagram feed returned an empty page for ten days while every run said
 * success; the snapshot is still written so the raw payload can be inspected.
 *
 * What it writes:
 *
 *   pfm_account_snapshots — one row per connected PFM account per run, with
 *     the raw feed payload kept for debugging + future analysis.
 *
 *   content_posts — imports feed posts not already mirrored locally, then
 *     stamps live metrics (views/likes/comments/saves/shares/reach/
 *     engagement_rate) onto every mirrored row the feed knows about.
 *
 *   content_post_metrics_daily — one append-only snapshot per post per day,
 *     which is what powers period-over-period math at the post level.
 *
 *   platform_metrics — one row per (user, platform, TODAY) holding the
 *     aggregate across the posts in the feed window. Never writes the
 *     GENERATED columns (views/likes/comments/shares/saves are generated from
 *     the matching total_* columns; writing them raises 428C9 and aborts the
 *     whole upsert).
 */

const CRON_SECRET = Deno.env.get("Cron_Secret");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

  let body: { cronSecret?: string; userId?: string } = {};
  try {
    const raw = await req.text();
    if (raw) body = JSON.parse(raw);
  } catch {
    // empty / invalid body is fine
  }

  // Cron syncs the default PFM user (any userId in a cron body is ignored,
  // as before); otherwise the signed-in caller syncs themselves.
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const auth = await requireUserOrCron(req, admin, { cronSecret: body.cronSecret });
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  try {
    const summary = await syncForUser(userId);

    // ── Trigger caption/voice analysis (fire-and-forget) ────────────────────
    // One call PER BRAND: a voice is learned from a brand's own posts, and the
    // posts just synced are the first chance a new brand has to earn one.
    // analyze-captions skips a brand whose voice is under 24h old.
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: brandRows } = await admin.from("brands").select("id").eq("owner_id", userId);
    const brandIds = (brandRows ?? []).map((b) => b.id as string);
    for (const brandId of brandIds.length > 0 ? brandIds : [null]) {
      fetch(`${SUPABASE_URL}/functions/v1/analyze-captions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ cronSecret: CRON_SECRET, userId, force: false, ...(brandId ? { brandId } : {}) }),
      }).catch((err) => {
        console.warn("analyze-captions fire-and-forget failed:", (err as Error).message);
      });
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error("postforme-sync fatal:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
