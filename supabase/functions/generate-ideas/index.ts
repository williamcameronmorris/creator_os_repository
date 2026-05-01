import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";

/**
 * generate-ideas Edge Function
 *
 * Calls Claude to generate content ideas based on the user's platform performance
 * data. Writes results to `ai_content_suggestions` and decrements the AI quota.
 *
 * Caller must be authenticated; we ignore any userId field in the body and
 * use the verified id from the bearer token instead. Deploy `--no-verify-jwt`.
 */

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

    // ── Check and decrement quota ────────────────────────────────────────────
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });

    if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
    if (quotaData[0].requests_remaining <= 0) {
      throw new Error("Daily AI quota exceeded. Resets at midnight.");
    }

    // ── Pull performance context ─────────────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const [metricsResult, topPostsResult, profileResult] = await Promise.all([
      supabase
        .from("platform_metrics")
        .select("platform, followers_count, avg_engagement_rate, total_views, total_likes, total_comments")
        .eq("user_id", userId)
        .gte("date", thirtyDaysAgoStr)
        .order("date", { ascending: false })
        .limit(30),
      supabase
        .from("content_posts")
        .select("platform, title, content_type, views, likes, comments, engagement_rate")
        .eq("user_id", userId)
        .eq("status", "published")
        .gte("published_date", thirtyDaysAgoStr)
        .order("engagement_rate", { ascending: false })
        .limit(10),
      supabase
        .from("profiles")
        .select("display_name, first_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    // Aggregate metrics by platform
    const platformSummary: Record<string, { followers: number; avgEngagement: number; totalViews: number }> = {};
    for (const m of metricsResult.data || []) {
      if (!platformSummary[m.platform]) {
        platformSummary[m.platform] = { followers: m.followers_count || 0, avgEngagement: m.avg_engagement_rate || 0, totalViews: 0 };
      }
      platformSummary[m.platform].totalViews += m.total_views || 0;
    }

    const topPosts = (topPostsResult.data || []).map((p) => ({
      platform: p.platform,
      topic: p.title || "Untitled",
      type: p.content_type || "post",
      engagementRate: Math.round((p.engagement_rate || 0) * 10) / 10,
    }));

    const platforms = Object.keys(platformSummary);
    const hasPlatformData = platforms.length > 0;

    const contextBlock = hasPlatformData
      ? `Platform performance (last 30 days):
${platforms.map((p) => `- ${p}: ${platformSummary[p].followers.toLocaleString()} followers, ${platformSummary[p].avgEngagement.toFixed(1)}% avg engagement, ${platformSummary[p].totalViews.toLocaleString()} total views`).join("\n")}

Top performing posts:
${topPosts.slice(0, 5).map((p) => `- [${p.platform}] "${p.topic}" (${p.type}, ${p.engagementRate}% engagement)`).join("\n")}`
      : "No platform data yet — generate ideas based on creator best practices.";

    // ── Call Claude ──────────────────────────────────────────────────────────
    const systemPrompt = `You are a content strategy AI for social media creators. Generate content ideas that will maximize engagement based on platform performance data.

Always respond with a valid JSON array. No markdown, no explanation, just the array.`;

    const userPrompt = `${contextBlock}

Generate exactly 4 content ideas. Return ONLY a JSON array with this exact shape:
[
  {
    "platform": "instagram" | "tiktok" | "youtube",
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
    const rows = ideas.slice(0, 5).map((idea: any) => ({
      user_id: userId,
      platform: idea.platform || "instagram",
      content_type: idea.content_type || "reel",
      suggested_topic: idea.suggested_topic || "Untitled Idea",
      suggested_format: idea.suggested_format || "",
      reasoning: idea.reasoning || "",
      confidence_score: Math.min(100, Math.max(0, Number(idea.confidence_score) || 80)),
      status: "new",
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("ai_content_suggestions")
      .insert(rows)
      .select();

    if (insertError) throw new Error(`Failed to save suggestions: ${insertError.message}`);

    // ── Decrement quota ──────────────────────────────────────────────────────
    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(
      JSON.stringify({ success: true, suggestions: inserted, count: inserted?.length || 0 }),
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
