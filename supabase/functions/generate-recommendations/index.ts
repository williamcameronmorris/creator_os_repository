import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * generate-recommendations Edge Function
 *
 * The core proactive AI recommendation engine. Produces 3 personalized
 * content recommendations by cross-referencing:
 *
 *   1. user_content_profiles  — what hook frameworks + topics the user already uses
 *   2. inspiration_entries    — which Outlier posts use those same frameworks
 *   3. platform_metrics       — their current engagement context
 *
 * Logic:
 *   - Find frameworks the user uses → look for Outlier entries using the same frameworks
 *   - Also surface 1 "stretch" rec using a framework they haven't tried yet
 *   - Pass all context to Claude Haiku → get back 3 actionable recommendations
 *   - Write to ai_content_suggestions (same table generate-ideas uses)
 *
 * Request body:
 *   userId  - Supabase user ID
 *   force   - (optional) bypass 6-hour freshness check
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// How many Outlier examples to pull per matching framework
const OUTLIERS_PER_FRAMEWORK = 3;

// How many total Outlier examples to send to Claude (cap to keep prompt tight)
const MAX_OUTLIER_EXAMPLES = 9;

// Re-generate only if last recommendations are older than this (hours)
const FRESHNESS_HOURS = 6;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) throw new Error("ANTHROPIC_API_KEY secret not set.");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, force = false } = await req.json();
    if (!userId) throw new Error("Missing required field: userId");

    // ── Freshness check ───────────────────────────────────────────────────────
    if (!force) {
      const { data: recent } = await supabase
        .from("ai_content_suggestions")
        .select("created_at")
        .eq("user_id", userId)
        .eq("source", "recommendation_engine")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recent?.created_at) {
        const hoursSince = (Date.now() - new Date(recent.created_at).getTime()) / (1000 * 60 * 60);
        if (hoursSince < FRESHNESS_HOURS) {
          return new Response(
            JSON.stringify({
              success: true,
              skipped: true,
              reason: `Recommendations are fresh (${hoursSince.toFixed(1)}h old). Pass force:true to regenerate.`,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ── Check AI quota ────────────────────────────────────────────────────────
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });

    if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
    if (quotaData[0].requests_remaining <= 0) {
      throw new Error("Daily AI quota exceeded. Resets at midnight.");
    }

    // ── Load the user's content profile ──────────────────────────────────────
    const { data: profile, error: profileError } = await supabase
      .from("user_content_profiles")
      .select("hook_frameworks, dominant_topics, caption_style, avg_caption_length, top_patterns, raw_analysis, posts_analyzed")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) throw new Error(`Failed to load content profile: ${profileError.message}`);

    const hasProfile = profile && profile.posts_analyzed > 0;
    const userFrameworks: string[] = profile?.hook_frameworks || [];
    const userTopics: string[] = profile?.dominant_topics || [];
    const topPatterns: any[] = profile?.top_patterns || [];
    const contentGaps: string[] = profile?.raw_analysis?.content_gaps || [];
    const voiceSignature: string = profile?.raw_analysis?.voice_signature || "";

    // ── Load recent platform metrics for context ──────────────────────────────
    const { data: metrics } = await supabase
      .from("platform_metrics")
      .select("platform, followers_count, avg_engagement_rate, total_views, total_likes, total_comments")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(5);

    const latestMetrics = metrics?.[0] || null;

    // ── Query inspiration_entries for matching Outliers ───────────────────────
    let outlierExamples: any[] = [];

    if (userFrameworks.length > 0) {
      // Primary: Outlier entries that share the user's existing frameworks
      const { data: matchingOutliers } = await supabase
        .from("inspiration_entries")
        .select("post_title, hook_framework, hook_text, performance_tier, topic_tags, tactical_notes, likes, comments, content_format")
        .eq("performance_tier", "Outlier")
        .in("hook_framework", userFrameworks)
        .order("likes", { ascending: false })
        .limit(MAX_OUTLIER_EXAMPLES);

      outlierExamples = matchingOutliers || [];
    }

    // If we got fewer than 3 matches, pad with any Outliers
    if (outlierExamples.length < 3) {
      const { data: anyOutliers } = await supabase
        .from("inspiration_entries")
        .select("post_title, hook_framework, hook_text, performance_tier, topic_tags, tactical_notes, likes, comments, content_format")
        .eq("performance_tier", "Outlier")
        .not("hook_framework", "in", `(${userFrameworks.map(f => `"${f}"`).join(",")})`)
        .order("likes", { ascending: false })
        .limit(3);

      outlierExamples.push(...(anyOutliers || []));
    }

    // ── Find one "stretch" framework the user hasn't used yet ─────────────────
    const allFrameworks = [
      "Proof-First", "Curiosity Gap", "Pain Point", "Challenge",
      "Question + Proof", "Bold Claim", "Storytelling", "Contrarian",
      "How-To", "List/Ranking"
    ];
    const unusedFrameworks = allFrameworks.filter(f => !userFrameworks.includes(f));

    let stretchExample: any = null;
    if (unusedFrameworks.length > 0) {
      const { data: stretchOutliers } = await supabase
        .from("inspiration_entries")
        .select("post_title, hook_framework, hook_text, performance_tier, topic_tags, tactical_notes, likes, comments, content_format")
        .eq("performance_tier", "Outlier")
        .in("hook_framework", unusedFrameworks)
        .order("likes", { ascending: false })
        .limit(1);

      stretchExample = stretchOutliers?.[0] || null;
    }

    // ── Build the Claude prompt ───────────────────────────────────────────────
    const profileBlock = hasProfile
      ? `CREATOR PROFILE (from caption analysis of ${profile.posts_analyzed} real posts):
Voice: ${voiceSignature || "Not yet determined"}
Hook frameworks they already use: ${userFrameworks.join(", ") || "None identified yet"}
Topic clusters: ${userTopics.join(", ") || "None identified yet"}
Caption style: ${profile.caption_style || "Unknown"}
Avg caption length: ${profile.avg_caption_length} characters

Their top-performing patterns:
${topPatterns.map((p: any, i: number) => `${i + 1}. ${p.pattern}
   Example: "${p.example_caption}"
   Why it works: ${p.why_it_works}`).join("\n\n") || "Not yet analyzed"}

Content gaps identified:
${contentGaps.map((g: string) => `- ${g}`).join("\n") || "None identified"}`
      : "CREATOR PROFILE: No caption analysis yet — recommend based on content creation best practices for Instagram.";

    const metricsBlock = latestMetrics
      ? `PLATFORM CONTEXT:
Platform: ${latestMetrics.platform}
Followers: ${latestMetrics.followers_count?.toLocaleString() || "Unknown"}
Avg engagement rate: ${latestMetrics.avg_engagement_rate?.toFixed(2) || "0"}%
Total views: ${latestMetrics.total_views?.toLocaleString() || "0"}`
      : "PLATFORM CONTEXT: No metrics available yet.";

    const outliersBlock = outlierExamples.length > 0
      ? `OUTLIER EXAMPLES FROM INSPIRATION LIBRARY (proven high-performers):
${outlierExamples.slice(0, MAX_OUTLIER_EXAMPLES).map((e, i) => `${i + 1}. [${e.hook_framework}] "${e.hook_text}"
   Format: ${e.content_format} | Topics: ${Array.isArray(e.topic_tags) ? e.topic_tags.join(", ") : e.topic_tags}
   Performance: ${e.likes?.toLocaleString() || 0} likes, ${e.comments?.toLocaleString() || 0} comments
   Tactical insight: ${e.tactical_notes?.substring(0, 150) || "N/A"}`).join("\n\n")}`
      : "OUTLIER EXAMPLES: Library not yet synced.";

    const stretchBlock = stretchExample
      ? `STRETCH OPPORTUNITY (framework they haven't tried):
[${stretchExample.hook_framework}] "${stretchExample.hook_text}"
Format: ${stretchExample.content_format} | ${stretchExample.likes?.toLocaleString() || 0} likes
Insight: ${stretchExample.tactical_notes?.substring(0, 120) || "N/A"}`
      : "";

    const systemPrompt = `You are an AI content strategist for social media creators.
You have access to a creator's real performance data and a library of proven high-performing posts.
Your job is to generate 3 specific, actionable content recommendations tailored to THIS creator.

Rules:
- Make recommendations feel personally tailored, not generic
- Reference specific patterns from their data
- Hook Text must be a compelling, specific opening line (not a category description)
- Reasoning must connect their data to the Outlier examples
- Always respond with valid JSON only, no markdown fences`;

    const userPrompt = `${profileBlock}

${metricsBlock}

${outliersBlock}

${stretchBlock}

Generate exactly 3 content recommendations. At least 2 should use frameworks from their existing repertoire.
If there's a stretch example, include it as recommendation 3.

Return ONLY a JSON array:
[
  {
    "platform": "instagram",
    "content_type": "reel" | "carousel" | "post",
    "hook_framework": "exact framework name from the list",
    "suggested_topic": "Specific, compelling content concept (max 70 chars)",
    "hook_text": "The exact opening line/hook for this piece of content (max 100 chars)",
    "suggested_format": "One sentence describing the format and structure",
    "reasoning": "2 sentences connecting their data + the Outlier examples to why this will perform for them",
    "confidence_score": number 70-98,
    "inspiration_source": "Brief note on which Outlier example informed this (optional)"
  }
]`;

    // ── Call Claude Haiku ─────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1800,
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

    let recommendations: any[];
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      recommendations = JSON.parse(cleaned);
      if (!Array.isArray(recommendations)) throw new Error("Not an array");
    } catch {
      throw new Error(`Failed to parse Claude response: ${rawText.substring(0, 300)}`);
    }

    // ── Write to ai_content_suggestions ──────────────────────────────────────
    const rows = recommendations.slice(0, 3).map((rec: any) => ({
      user_id: userId,
      platform: rec.platform || "instagram",
      content_type: rec.content_type || "reel",
      suggested_topic: rec.suggested_topic || "Untitled",
      suggested_format: rec.suggested_format || "",
      reasoning: rec.reasoning || "",
      confidence_score: Math.min(100, Math.max(0, Number(rec.confidence_score) || 80)),
      status: "new",
      source: "recommendation_engine",
      hook_framework: rec.hook_framework || "",
      hook_text: rec.hook_text || "",
      metadata: { inspiration_source: rec.inspiration_source || null },
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("ai_content_suggestions")
      .insert(rows)
      .select();

    if (insertError) throw new Error(`Failed to save recommendations: ${insertError.message}`);

    // ── Decrement quota ───────────────────────────────────────────────────────
    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(
      JSON.stringify({
        success: true,
        count: inserted?.length || 0,
        recommendations: inserted,
        context: {
          hadContentProfile: hasProfile,
          outlierExamplesUsed: outlierExamples.length,
          userFrameworks,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-recommendations error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
