import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders, resolveBrandId } from "../_shared/auth.ts";
import { canonicalNiche } from "../_shared/niche.ts";
import { loadVoiceContext, loadAccountNiche } from "../_shared/voice.ts";

/**
 * generate-ideas Edge Function
 *
 * Calls Claude to generate content ideas grounded in the same scored data the
 * Analytics page shows: post_performance (views as a multiple of the creator's
 * own trailing median, the lane it sat in, and what winning looks like in that
 * lane). It used to feed the model raw engagement rates from content_posts, so
 * ideas and the dashboard ran on different numbers. Writes results to
 * `ai_content_suggestions` and decrements the AI quota.
 *
 * Body:
 *   brandId         - the brand to generate for (ownership verified)
 *   socialAccountId - optional; scopes performance context, voice and niche
 *                     to one connected account (its voice falls back to the
 *                     brand's main voice; absent, the brand's posts and the
 *                     brand's main voice are used)
 *   sourcePostId    - optional; pins that post first and asks for four
 *                     variations of its angle (the Analytics "Make more like
 *                     this" button)
 *   force           - optional; skip the same-day cache below
 *
 * Same-day cache: without `force` or a source post, today's unused ('new')
 * suggestions for the brand come back as they are, with no model call and no
 * credit spent. Every click used to append four rows and burn one of the
 * user's 15 daily credits.
 *
 * Caller must be authenticated; we ignore any userId field in the body and
 * use the verified id from the bearer token instead. Deploy `--no-verify-jwt`.
 */

const PERF_SELECT =
  "id, platform, media_type, content_type, title, caption, views, saves, engagement_rate, " +
  "views_multiple, saves_multiple, outlier_metric, lane_name, winning_looks_like, published_at";

type PerfRow = {
  id: string;
  platform: string;
  media_type: string | null;
  content_type: string | null;
  title: string | null;
  caption: string | null;
  views: number | null;
  saves: number | null;
  engagement_rate: number | null;
  views_multiple: number | null;
  saves_multiple: number | null;
  outlier_metric: string | null;
  lane_name: string | null;
  winning_looks_like: string | null;
  published_at: string | null;
};

/** Short label: the hook line of the caption, else the title. */
function postLabel(p: { title?: string | null; caption?: string | null }): string {
  const caption = (p.caption || "").trim();
  if (caption) {
    const first = caption.split("\n").map((l) => l.trim()).find((l) => l && !/^[.\-•·#]+/.test(l)) || caption;
    return first.length > 140 ? first.slice(0, 140).trimEnd() + "…" : first;
  }
  return (p.title || "").trim() || "Untitled";
}

function perfLine(p: PerfRow): string {
  const bits = [`${p.views ?? 0} views`];
  if (p.views_multiple !== null) bits.push(`${p.views_multiple}x their median for a ${p.media_type ?? "post"} on ${p.platform}`);
  if (p.outlier_metric && p.outlier_metric !== "views") bits.push(`strongest on ${p.outlier_metric}`);
  if (p.engagement_rate) bits.push(`${Number(p.engagement_rate).toFixed(1)}% engagement`);
  const lane = p.lane_name
    ? ` Lane: ${p.lane_name}${p.winning_looks_like ? ` (what wins here: ${p.winning_looks_like})` : ""}.`
    : "";
  return `[${p.platform} · ${p.media_type ?? "post"}] "${postLabel(p)}" — ${bits.join(", ")}.${lane}`;
}

/** The brief's niche fallback: top watch-feed videos for the canonical niche. */
async function nicheVideos(supabase: SupabaseClient, rawNiche: string) {
  const niche = canonicalNiche(rawNiche);
  if (!niche) return [] as { title: string; view_count: number | null; creator: string }[];
  const { data } = await supabase
    .from("suggested_creator_videos")
    .select("title, view_count, is_top, packaging_percentile, suggested_creators!inner(title, niche)")
    .eq("suggested_creators.niche", niche)
    .order("is_top", { ascending: false })
    .order("packaging_percentile", { ascending: false, nullsFirst: false })
    .order("view_count", { ascending: false, nullsFirst: false })
    .limit(5);
  return (data || []).map((v) => ({
    title: v.title as string,
    view_count: v.view_count as number | null,
    creator: ((v.suggested_creators as unknown as { title?: string } | null)?.title) || "a top creator",
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY secret not set. Add it in Supabase → Project Settings → Secrets.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const auth = await requireUser(req, supabase);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const body = await req.json().catch(() => ({}));
    const socialAccountId: string | null =
      typeof body.socialAccountId === "string" && body.socialAccountId.trim()
        ? body.socialAccountId.trim()
        : null;
    const requestedBrandId: string | null =
      typeof (body as { brandId?: unknown }).brandId === "string"
        ? ((body as { brandId: string }).brandId.trim() || null)
        : null;
    const sourcePostId: string | null =
      typeof body.sourcePostId === "string" && body.sourcePostId.trim() ? body.sourcePostId.trim() : null;
    const force = body.force === true;
    // Ideas belong to the brand of the scoped account (or the default brand).
    const brandId = await resolveBrandId(supabase, userId, socialAccountId, requestedBrandId);

    // ── Same-day cache: hand back today's unused ideas, no model call ─────
    if (!force && !sourcePostId) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: cached } = await supabase
        .from("ai_content_suggestions")
        .select("*")
        .eq("user_id", userId)
        .eq("brand_id", brandId)
        .eq("status", "new")
        .gte("created_at", todayStart.toISOString())
        .order("created_at", { ascending: false })
        .limit(8);
      if (cached && cached.length > 0) {
        return new Response(
          JSON.stringify({ success: true, suggestions: cached, count: cached.length, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // ── Check and decrement quota ────────────────────────────────────────────
    const { data: reserved, error: quotaError } = await supabase
      .rpc("increment_ai_request", { p_user_id: userId });
    // Reserve BEFORE generating. The RPC is an atomic guarded UPDATE that
    // returns false at the day's limit, so two concurrent calls cannot both
    // slip through the way check-then-generate-then-count did.
    if (quotaError) throw new Error("Failed to check AI quota");
    if (!reserved) throw new Error("Daily AI quota exceeded. Resets at midnight.");

    // ── Pull performance context ─────────────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    let metricsQuery = supabase
      .from("platform_metrics")
      .select("platform, date, followers_count, avg_engagement_rate, total_views")
      .eq("user_id", userId).eq("brand_id", brandId)
      .gte("date", thirtyDaysAgoStr);
    // Scored posts as the Analytics page scores them, best multiple first.
    let perfQuery = supabase
      .from("post_performance")
      .select(PERF_SELECT)
      .eq("brand_id", brandId)
      .not("views_multiple", "is", null);
    if (socialAccountId) {
      // platform_metrics rows are brand-level (social_account_id NULL); the
      // same filter the Analytics page uses.
      metricsQuery = metricsQuery.or(`social_account_id.eq.${socialAccountId},social_account_id.is.null`);
      perfQuery = perfQuery.eq("social_account_id", socialAccountId);
    }

    const [metricsResult, perfResult, sourcePerfResult, profileResult, voiceContext, accountNiche] = await Promise.all([
      metricsQuery.order("date", { ascending: false }).limit(60),
      perfQuery.order("views_multiple", { ascending: false }).limit(5),
      sourcePostId
        ? supabase.from("post_performance").select(PERF_SELECT).eq("brand_id", brandId).eq("id", sourcePostId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("profiles")
        .select("display_name, first_name, niche_preference")
        .eq("id", userId)
        .maybeSingle(),
      // Always in the brand's voice: the account's own when one is pinned,
      // else the brand's main voice. "All accounts" used to skip voice.
      loadVoiceContext(supabase, userId, socialAccountId, brandId),
      loadAccountNiche(supabase, userId, socialAccountId, brandId),
    ]);

    // The source post may have aged out of post_performance's 7-day window;
    // fall back to the row itself so the button never dead-ends.
    let sourcePost: PerfRow | null = (sourcePerfResult.data as unknown as PerfRow | null) ?? null;
    if (sourcePostId && !sourcePost) {
      const { data: raw } = await supabase
        .from("content_posts")
        .select("id, platform, media_type, content_type, title, caption, views, saves, engagement_rate, published_at")
        .eq("brand_id", brandId)
        .eq("id", sourcePostId)
        .maybeSingle();
      if (raw) {
        sourcePost = {
          ...(raw as Omit<PerfRow, "views_multiple" | "saves_multiple" | "outlier_metric" | "lane_name" | "winning_looks_like">),
          views_multiple: null, saves_multiple: null, outlier_metric: null, lane_name: null, winning_looks_like: null,
        };
      }
    }
    if (sourcePostId && !sourcePost) throw new Error("That post is not in this brand.");

    // Followers: the newest row per platform that carries a count (rows are
    // newest-first). A day's row can sit at 0 before the follower sync fills it.
    const platformSummary: Record<string, { followers: number; avgEngagement: number; totalViews: number }> = {};
    for (const m of metricsResult.data || []) {
      if (!platformSummary[m.platform]) {
        platformSummary[m.platform] = { followers: 0, avgEngagement: Number(m.avg_engagement_rate) || 0, totalViews: Number(m.total_views) || 0 };
      }
      const s = platformSummary[m.platform];
      if (s.followers === 0 && Number(m.followers_count) > 0) s.followers = Number(m.followers_count);
    }

    // PostgREST types a view select as GenericStringError[] when it cannot
    // resolve the shape, so go through unknown rather than fight it.
    const topPerf = ((perfResult.data || []) as unknown as PerfRow[]).filter((p) => p.id !== sourcePostId);
    const creatorName = profileResult.data?.first_name || profileResult.data?.display_name || "creator";
    // Niche resolution order: account profile.niche → profiles.niche_preference.
    const niche = accountNiche || (profileResult.data?.niche_preference || "").trim();

    const platforms = Object.keys(platformSummary);
    const hasOwnData = topPerf.length > 0 || sourcePost !== null;

    // ── Context block ────────────────────────────────────────────────────────
    const blocks: string[] = [];
    if (sourcePost) {
      blocks.push(`SOURCE POST to build on:\n${perfLine(sourcePost)}`);
    }
    if (topPerf.length > 0) {
      blocks.push(`Their top posts, ranked by views as a multiple of their OWN median for that format (1.0x = normal for them):\n${topPerf.map((p) => `- ${perfLine(p)}`).join("\n")}`);
    }
    if (platforms.length > 0) {
      blocks.push(`Audience (last 30 days):\n${platforms.map((p) => `- ${p}: ${platformSummary[p].followers > 0 ? `${platformSummary[p].followers.toLocaleString()} followers, ` : ""}${platformSummary[p].avgEngagement.toFixed(1)}% engagement across recent posts`).join("\n")}`);
    }
    if (!hasOwnData) {
      // First run: nothing of their own is scored yet. Borrow the brief's
      // niche discovery rather than "creator best practices".
      const videos = await nicheVideos(supabase, niche);
      blocks.push(videos.length > 0
        ? `No scored posts of their own yet. What's working in their niche right now (top videos from niche discovery):\n${videos.map((v, i) => `${i + 1}. "${v.title}" by ${v.creator}${v.view_count ? ` (${v.view_count.toLocaleString()} views)` : ""}`).join("\n")}\nAdapt these angles to this creator — do not copy titles.`
        : "No scored posts of their own yet and no niche discovery data — reason from the niche alone.");
    }
    const contextBlock = blocks.join("\n\n");

    const task = sourcePost
      ? `Generate exactly 4 VARIATIONS of the source post's angle: keep the promise and the hook mechanism that made it work, change the specific topic, example or framing in each. Stay on ${sourcePost.platform} as ${sourcePost.media_type ?? "the same format"} unless the data above says another platform is stronger.`
      : `Generate exactly 4 content ideas. Lean on the lanes and formats that beat their median; say which lane each idea belongs to in the reasoning.`;

    // ── Call Claude ──────────────────────────────────────────────────────────
    const systemPrompt = `You are a content strategy AI for social media creators. Generate content ideas that will maximize engagement based on the creator's own scored performance data.
${voiceContext ? `\n${voiceContext}\n` : ""}
Always respond with a valid JSON array. No markdown, no explanation, just the array.`;

    const userPrompt = `Creator: ${creatorName}
${niche ? `Niche: ${niche}` : "Niche: not set — infer it from the performance data below."}

${contextBlock}

Every idea must be specific to this creator's niche — no generic "post more reels" advice.
${task}
Return ONLY a JSON array with this exact shape:
[
  {
    "platform": "instagram" | "tiktok" | "youtube" | "facebook" | "threads",
    "content_type": "reel" | "video" | "post" | "story" | "short",
    "suggested_topic": "Specific, compelling title/concept (max 60 chars)",
    "suggested_format": "One sentence format description (max 80 chars)",
    "reasoning": "One sentence explaining why this will perform well based on their data",
    "confidence_score": number between 70 and 98
  }
]`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "[]";

    let ideas: any[];
    try {
      // Strip potential markdown code fences
      const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      ideas = JSON.parse(cleaned);
      if (!Array.isArray(ideas)) throw new Error("Not an array");
    } catch {
      throw new Error(`Failed to parse Claude response: ${rawText.substring(0, 200)}`);
    }

    // ── Write suggestions to DB ──────────────────────────────────────────────
    // inspired_by_post_id: the pinned source, else the post the prompt led
    // with. Every idea used to be written with all three provenance columns
    // null, so nothing could say where an idea came from.
    const inspiredBy = sourcePost?.id ?? topPerf[0]?.id ?? null;
    const rows = ideas.slice(0, 5).map((idea: any) => ({
      user_id: userId,
      brand_id: brandId,
      platform: idea.platform || sourcePost?.platform || "instagram",
      content_type: idea.content_type || sourcePost?.media_type || "reel",
      suggested_topic: idea.suggested_topic || "Untitled Idea",
      suggested_format: idea.suggested_format || "",
      reasoning: idea.reasoning || "",
      confidence_score: Math.min(100, Math.max(0, Number(idea.confidence_score) || 80)),
      status: "new",
      inspired_by_post_id: inspiredBy,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("ai_content_suggestions")
      .insert(rows)
      .select();

    if (insertError) throw new Error(`Failed to save suggestions: ${insertError.message}`);

    return new Response(
      JSON.stringify({ success: true, suggestions: inserted, count: inserted?.length || 0, cached: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-ideas error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
