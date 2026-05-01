import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";

/**
 * generate-analysis Edge Function
 *
 * Reads real post metrics vs historical average for a creator, calls Claude
 * to generate a performance retro (key learning + next idea), and writes
 * the result back to content_workflow_stages.analysis_notes.
 *
 * Request body:
 *   userId      - Supabase user ID
 *   workflowId  - content_workflow_stages ID
 *   postId      - content_posts ID (the published post)
 *   platform    - platform string
 *   contentType - content_type string
 *   metrics     - { views, likes, comments, engagementRate, avgViews, avgEngagement }
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
      throw new Error("ANTHROPIC_API_KEY not set.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const auth = await requireUser(req, supabase);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const { workflowId, postId, platform, contentType, metrics } = await req.json();

    // ── Check quota ──────────────────────────────────────────────────────────
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });

    if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
    if (quotaData[0].requests_remaining <= 0) {
      throw new Error("Daily AI quota exceeded. Resets at midnight.");
    }

    // ── Pull workflow context ────────────────────────────────────────────────
    const { data: workflow } = await supabase
      .from("content_workflow_stages")
      .select("idea_content, script_content")
      .eq("id", workflowId)
      .maybeSingle();

    const ideaTopic = workflow?.idea_content || "Unknown topic";
    const scriptContent = workflow?.script_content as any;
    const hook = scriptContent?.hook || "";

    // ── Build performance context ─────────────────────────────────────────────
    const views = metrics?.views || 0;
    const likes = metrics?.likes || 0;
    const comments = metrics?.comments || 0;
    const engRate = metrics?.engagementRate || 0;
    const avgViews = metrics?.avgViews || 0;
    const avgEng = metrics?.avgEngagement || 0;

    const hasComparison = avgViews > 0;
    const viewsDiff = hasComparison
      ? Math.round(((views - avgViews) / avgViews) * 100)
      : null;
    const engDiff = hasComparison && avgEng > 0
      ? Math.round(((engRate - avgEng) / avgEng) * 100)
      : null;

    const performanceSummary = hasComparison
      ? `This post ${viewsDiff !== null && viewsDiff >= 0 ? "outperformed" : "underperformed"} the creator's average by ${Math.abs(viewsDiff ?? 0)}% on views and ${Math.abs(engDiff ?? 0)}% on engagement.`
      : "This is one of the creator's first posts — no historical baseline yet.";

    const metricsBlock = `
Post: "${ideaTopic}"
Platform: ${platform} | Type: ${contentType}
${hook ? `Hook: "${hook}"` : ""}

Actual performance:
- Views: ${views.toLocaleString()}
- Likes: ${likes.toLocaleString()}
- Comments: ${comments.toLocaleString()}
- Engagement rate: ${engRate.toFixed(1)}%
${hasComparison ? `
Historical average (same platform, last 90 days):
- Avg views: ${avgViews.toLocaleString()}
- Avg engagement: ${avgEng.toFixed(1)}%
${performanceSummary}` : "No historical comparison data available yet."}`;

    // ── Call Claude ──────────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: "You are a content performance analyst for social media creators. Be direct, specific, and actionable. Never use generic advice.",
        messages: [
          {
            role: "user",
            content: `Analyze this content performance and produce a short retro.

${metricsBlock}

Return ONLY a JSON object with this exact shape:
{
  "key_learning": "One specific insight about why this performed the way it did (1-2 sentences, max 150 chars)",
  "what_worked": "The single most effective element of this post (1 sentence)",
  "next_idea": "A specific follow-up content idea that applies this learning (max 80 chars, suitable as a content title)"
}

No markdown. No explanation. Just the JSON.`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content?.[0]?.text || "").trim();

    let result: { key_learning: string; what_worked: string; next_idea: string };
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      // Fallback: use raw text as key_learning
      result = { key_learning: rawText.slice(0, 150), what_worked: "", next_idea: "" };
    }

    // ── Save to DB ───────────────────────────────────────────────────────────
    if (workflowId) {
      const existing = workflow?.script_content; // reuse workflow var
      await supabase
        .from("content_workflow_stages")
        .update({
          analysis_notes: JSON.stringify({
            key_learning: result.key_learning,
            what_worked: result.what_worked,
            next_idea: result.next_idea,
            ai_generated: true,
            generated_at: new Date().toISOString(),
          }),
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId);
    }

    // ── Decrement quota ──────────────────────────────────────────────────────
    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(
      JSON.stringify({
        success: true,
        key_learning: result.key_learning,
        what_worked: result.what_worked,
        next_idea: result.next_idea,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-analysis error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
