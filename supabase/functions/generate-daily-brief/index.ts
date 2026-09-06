import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders, resolveBrandId } from "../_shared/auth.ts";
import { canonicalNiche } from "../_shared/niche.ts";
import { loadVoiceContext, loadAccountNiche } from "../_shared/voice.ts";

/**
 * generate-daily-brief
 *
 * Builds each creator's morning Daily Brief and upserts it into
 * `ai_daily_briefs` (one row per user per day). The Clio home page reads
 * today's row and lights up the Daily Brief panel.
 *
 * Two modes (deploy `--no-verify-jwt`, same as the other functions):
 *
 *   1. User mode — `Authorization: Bearer <user-jwt>`. Generates (or, with
 *      body.force, regenerates) today's brief for the verified caller. This
 *      is Clio's "Generate now" button. Counts against the user's AI quota.
 *
 *   2. Cron mode — `{ "cronSecret": "..." }` in the body, matched against the
 *      `Cron_Secret` project secret. Generates briefs for EVERY user who has
 *      finished onboarding (profiles.onboarding_step = 'done') and has at
 *      least one content_posts row. Users are processed sequentially and
 *      per-user failures are collected — one bad user never kills the run.
 *      System-generated, so it does NOT consume anyone's AI quota.
 *
 *      NOTE: requireUserOrCron isn't used here because it binds cron mode to
 *      a single userId; the brief cron fans out to all eligible users. The
 *      secret comparison below is the same check requireUserOrCron performs.
 *
 * Setup (manual, one-time):
 *   - `Cron_Secret` project secret (already used by postforme-sync).
 *   - Schedule via Supabase Dashboard: daily at 11:00 UTC,
 *     body {"cronSecret":"<Cron_Secret>"}. See the ai_daily_briefs migration.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CRON_SECRET = Deno.env.get("Cron_Secret");

const MODEL = "claude-sonnet-5";

type BriefIdea = {
  topic: string;
  hook: string;
  reasoning: string;
  platform: string;
  content_type: string;
};

type BriefContent = {
  headline: string;
  performance: { summary: string; highlight_post: string | null };
  niche_trend: { summary: string; example_title: string | null };
  ideas: BriefIdea[];
  best_time: { hour_local: string; note: string };
};

/** UTC calendar date — must match the client, which also derives "today" via
 * toISOString(). */
function todayUtc(): string {
  return new Date().toISOString().split("T")[0];
}

// ─── Data gathering ──────────────────────────────────────────────────────────

type PostRow = {
  title: string | null;
  caption: string | null;
  platform: string | null;
  content_type: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  engagement_rate: number | null;
  published_at: string | null;
};

/** Ranking score for "top performer": views when the platform reports them,
 * likes+comments when it doesn't (views=0 is common on synced IG posts). */
function postScore(p: PostRow): number {
  const views = p.views || 0;
  return views > 0 ? views : (p.likes || 0) + (p.comments || 0);
}

function postLabel(p: PostRow): string {
  return (p.title || p.caption || "Untitled post").slice(0, 120);
}

async function gatherUserData(
  supabase: SupabaseClient,
  userId: string,
  socialAccountId: string | null = null,
) {
  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 86_400_000).toISOString();
  const fourteenDaysAgo = new Date(now - 14 * 86_400_000).toISOString();
  const ninetyDaysAgo = new Date(now - 90 * 86_400_000).toISOString();

  // Account scope (user mode's "Generate now" with the Account Switcher
  // pinned): only that account's posts feed the brief. Null → user-level,
  // exactly the pre-separation behavior — and the only mode cron uses.
  // Storage stays one brief per user per day; per-account briefs are a
  // follow-up (see PR body).
  let recentQuery = supabase
    .from("content_posts")
    .select("title, caption, platform, content_type, views, likes, comments, engagement_rate, published_at")
    .eq("user_id", userId)
    .eq("status", "published")
    // published_at is what the sync writes; published_date is a dead column.
    .gte("published_at", sevenDaysAgo);
  let priorCountQuery = supabase
    .from("content_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "published")
    .gte("published_at", fourteenDaysAgo)
    .lt("published_at", sevenDaysAgo);
  let historyQuery = supabase
    .from("content_posts")
    .select("published_at, likes, comments")
    .eq("user_id", userId)
    .eq("status", "published")
    .not("published_at", "is", null)
    .gte("published_at", ninetyDaysAgo);
  if (socialAccountId) {
    recentQuery = recentQuery.eq("social_account_id", socialAccountId);
    priorCountQuery = priorCountQuery.eq("social_account_id", socialAccountId);
    historyQuery = historyQuery.eq("social_account_id", socialAccountId);
  }

  const [profileRes, recentRes, priorCountRes, historyRes, accountNiche] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, first_name, niche_preference")
      .eq("id", userId)
      .maybeSingle(),
    recentQuery.order("published_at", { ascending: false }).limit(50),
    priorCountQuery,
    historyQuery.order("published_at", { ascending: false }).limit(200),
    // Niche resolution order: account profile.niche → profiles.niche_preference.
    loadAccountNiche(supabase, userId, socialAccountId),
  ]);

  const recent = (recentRes.data || []) as PostRow[];
  const topPosts = [...recent].sort((a, b) => postScore(b) - postScore(a)).slice(0, 3);

  // ── Best posting hour: weight each published hour by likes+comments (+1 so
  //    zero-engagement posts still count as frequency), pick the heaviest.
  const hourWeights = new Map<number, number>();
  for (const p of (historyRes.data || []) as PostRow[]) {
    if (!p.published_at) continue;
    const hour = new Date(p.published_at).getUTCHours();
    if (Number.isNaN(hour)) continue;
    const weight = (p.likes || 0) + (p.comments || 0) + 1;
    hourWeights.set(hour, (hourWeights.get(hour) || 0) + weight);
  }
  let bestHour = "18:00";
  let bestWeight = 0;
  for (const [hour, weight] of hourWeights) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestHour = `${String(hour).padStart(2, "0")}:00`;
    }
  }

  // ── Niche trend: top watch-feed videos for the resolved canonical niche
  //    (account niche first, profile niche as fallback).
  const rawNiche = accountNiche || (profileRes.data?.niche_preference || "").trim();
  const niche = canonicalNiche(rawNiche);
  let trendVideos: { title: string; view_count: number | null; creator: string }[] = [];
  if (niche) {
    const { data: videos } = await supabase
      .from("suggested_creator_videos")
      .select("title, view_count, is_top, packaging_percentile, suggested_creators!inner(title, niche)")
      .eq("suggested_creators.niche", niche)
      .order("is_top", { ascending: false })
      .order("packaging_percentile", { ascending: false, nullsFirst: false })
      .order("view_count", { ascending: false, nullsFirst: false })
      .limit(3);
    trendVideos = (videos || []).map((v) => ({
      title: v.title as string,
      view_count: v.view_count as number | null,
      creator:
        ((v.suggested_creators as unknown as { title?: string } | null)?.title) || "a top creator",
    }));
  }

  // Account-scoped voice when pinned (falls back to the main voice inside).
  const voiceContext = await loadVoiceContext(supabase, userId, socialAccountId);

  return {
    creatorName: profileRes.data?.first_name || profileRes.data?.display_name || "creator",
    niche: rawNiche,
    recentPosts: recent,
    topPosts,
    postCountThisWeek: recent.length,
    postCountPriorWeek: priorCountRes.count || 0,
    trendVideos,
    voiceContext,
    bestHour,
    hasHourData: bestWeight > 0,
  };
}

// ─── Claude ──────────────────────────────────────────────────────────────────

async function generateBriefContent(
  data: Awaited<ReturnType<typeof gatherUserData>>,
): Promise<BriefContent> {
  const systemPrompt = [
    "You are a sharp content strategist writing a punchy morning brief for ONE specific creator. Be specific to THEIR week and THEIR niche — never generic advice. Keep every string tight and energizing; this is the first thing they read today.",
    ...(data.voiceContext ? ["", data.voiceContext] : []),
    "",
    "Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation.",
  ].join("\n");

  const performanceBlock = data.recentPosts.length > 0
    ? `Posts published in the last 7 days: ${data.postCountThisWeek} (prior 7 days: ${data.postCountPriorWeek})
Top performers this week:
${data.topPosts.map((p, i) => `${i + 1}. [${p.platform || "?"}] "${postLabel(p)}" — ${p.views || 0} views, ${p.likes || 0} likes, ${p.comments || 0} comments`).join("\n")}`
    : `No posts published in the last 7 days (prior 7 days: ${data.postCountPriorWeek}). Nudge them to get one out today — kindly, not guilt-trippy.`;

  const trendBlock = data.trendVideos.length > 0
    ? `What's working in their niche right now (top videos from niche discovery):
${data.trendVideos.map((v, i) => `${i + 1}. "${v.title}" by ${v.creator}${v.view_count ? ` (${v.view_count.toLocaleString()} views)` : ""}`).join("\n")}`
    : "No niche trend data available — base the niche_trend summary on their own performance instead, and set example_title to null.";

  const userPrompt = `Creator: ${data.creatorName}
Niche: ${data.niche || "not set — infer from their content"}

${performanceBlock}

${trendBlock}

Best posting hour from their history (UTC, from post timestamps): ${data.hasHourData ? data.bestHour : "no data — default to 18:00"}

Write today's brief. Return ONLY a JSON object with this exact shape:
{
  "headline": "One energizing line, specific to their week (max 100 chars)",
  "performance": { "summary": "1-2 sentences on how their week went", "highlight_post": "title/caption of their standout post, or null" },
  "niche_trend": { "summary": "1-2 sentences on what's working in their niche", "example_title": "one real example title from the data above, or null" },
  "ideas": [
    { "topic": "Specific, compelling concept (max 70 chars)", "hook": "The opening line they'd say/write", "reasoning": "One sentence: why this will work for THEM today", "platform": "instagram" | "youtube" | "tiktok", "content_type": "reel" | "short" | "post" }
  ],
  "best_time": { "hour_local": "HH:00", "note": "One short sentence on why this window" }
}
Exactly 3 ideas. Use the best posting hour given above for best_time.hour_local.`;

  const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      // Deno's default User-Agent triggers Anthropic's bot challenge.
      "User-Agent": "cliopatra-daily-brief/1.0",
    },
    body: JSON.stringify({
      // Sonnet 5, thinking disabled: brief quality matters (it's the first
      // thing the creator reads) but it's a formatting-heavy task that
      // doesn't need extended reasoning.
      model: MODEL,
      max_tokens: 2000,
      thinking: { type: "disabled" },
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!claudeRes.ok) {
    const errText = await claudeRes.text();
    throw new Error(`Claude API error: ${claudeRes.status} ${errText.slice(0, 300)}`);
  }

  const claudeData = await claudeRes.json();
  const rawText = claudeData.content?.[0]?.text || "";

  // Strip potential markdown code fences (same cleanup as generate-ideas).
  const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  let parsed: BriefContent;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(`Failed to parse brief JSON: ${rawText.slice(0, 200)}`);
  }
  if (
    typeof parsed?.headline !== "string" ||
    !Array.isArray(parsed?.ideas) ||
    parsed.ideas.length === 0
  ) {
    throw new Error("Brief JSON missing headline/ideas — refusing to store garbage");
  }
  return parsed;
}

// ─── Per-user pipeline ───────────────────────────────────────────────────────

async function generateForUser(
  supabase: SupabaseClient,
  userId: string,
  force: boolean,
  socialAccountId: string | null = null,
): Promise<"generated" | "skipped_exists" | { row: Record<string, unknown> }> {
  const briefDate = todayUtc();
  // Briefs are one row per BRAND per day. Resolve from the account when the
  // caller scoped one, else the user's default brand (cron mode).
  const brandId = await resolveBrandId(supabase, userId, socialAccountId);

  if (!force) {
    const { data: existing } = await supabase
      .from("ai_daily_briefs")
      .select("id")
      .eq("brand_id", brandId)
      .eq("brief_date", briefDate)
      .maybeSingle();
    if (existing) return "skipped_exists";
  }

  const data = await gatherUserData(supabase, userId, socialAccountId);
  const content = await generateBriefContent(data);

  const { data: row, error } = await supabase
    .from("ai_daily_briefs")
    .upsert(
      { user_id: userId, brand_id: brandId, brief_date: briefDate, content, model: MODEL },
      { onConflict: "brand_id,brief_date" },
    )
    .select()
    .single();
  if (error) throw new Error(`Failed to save brief: ${error.message}`);
  return { row };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY secret not set. Add it in Supabase → Project Settings → Secrets.");
    }
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    let body: { cronSecret?: string; force?: boolean; socialAccountId?: string } = {};
    try {
      body = await req.json();
    } catch {
      // empty body is fine (user mode)
    }

    const isCron = !!(body.cronSecret && CRON_SECRET && body.cronSecret === CRON_SECRET);

    // ── Cron mode: fan out to every onboarded user with content ────────────
    if (isCron) {
      const { data: profiles, error: profErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("onboarding_step", "done");
      if (profErr) throw new Error(`Failed to list users: ${profErr.message}`);

      let generated = 0;
      let skipped = 0;
      const errors: { userId: string; error: string }[] = [];

      for (const profile of profiles || []) {
        const uid = profile.id as string;
        try {
          const { count } = await supabase
            .from("content_posts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid);
          if (!count) {
            skipped++;
            continue;
          }
          const result = await generateForUser(supabase, uid, !!body.force);
          if (result === "skipped_exists") skipped++;
          else generated++;
        } catch (err) {
          // Collect and continue — one bad user never kills the morning run.
          const message = err instanceof Error ? err.message : String(err);
          console.error(`daily-brief failed for ${uid}:`, message);
          errors.push({ userId: uid, error: message });
        }
      }

      return new Response(
        JSON.stringify({ success: true, generated, skipped, failed: errors.length, errors }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── User mode: on-demand "Generate now" for the verified caller ────────
    const auth = await requireUser(req, supabase);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    // On-demand generation is a user-initiated AI call — quota applies
    // (cron-generated briefs are system work and bypass this).
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });
    if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
    if (quotaData[0].requests_remaining <= 0) {
      return new Response(
        JSON.stringify({ error: "Daily AI quota exceeded. Resets at midnight." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Optional Account Switcher scope for on-demand briefs. The brief is
    // stored per BRAND per day (resolved from this account, or the default
    // brand in cron mode), so two brands never share a row.
    const socialAccountId: string | null =
      typeof body.socialAccountId === "string" && body.socialAccountId.trim()
        ? body.socialAccountId.trim()
        : null;

    const result = await generateForUser(supabase, userId, !!body.force, socialAccountId);

    if (result === "skipped_exists") {
      // Already have today's brief — return it so the client can render it.
      const { data: existing } = await supabase
        .from("ai_daily_briefs")
        .select("*")
        .eq("brand_id", await resolveBrandId(supabase, userId, socialAccountId))
        .eq("brief_date", todayUtc())
        .maybeSingle();
      return new Response(
        JSON.stringify({ success: true, brief: existing, alreadyExisted: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(
      JSON.stringify({ success: true, brief: (result as { row: Record<string, unknown> }).row }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-daily-brief error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
