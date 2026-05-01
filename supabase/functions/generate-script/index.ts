import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";

/**
 * generate-script Edge Function
 *
 * Calls Claude to generate a content script (hook/body/CTA or freeform notes)
 * based on the selected idea topic and content type.
 *
 * Caller must be authenticated; userId is taken from the verified bearer token
 * (any userId in the body is ignored). Deploy `--no-verify-jwt`.
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
    const { workflowId, topic, contentType, mode } = await req.json();

    // ── Check quota ──────────────────────────────────────────────────────────
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });

    if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
    if (quotaData[0].requests_remaining <= 0) {
      throw new Error("Daily AI quota exceeded. Resets at midnight.");
    }

    // ── Pull platform context from DB ────────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const [topPostsResult, profileResult] = await Promise.all([
      supabase
        .from("content_posts")
        .select("platform, title, content_type, engagement_rate")
        .eq("user_id", userId)
        .eq("status", "published")
        .gte("published_date", thirtyDaysAgoStr)
        .order("engagement_rate", { ascending: false })
        .limit(5),
      supabase
        .from("profiles")
        .select("display_name, first_name")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    const topPosts = (topPostsResult.data || []).map((p) =>
      `"${p.title || "Untitled"}" (${p.content_type}, ${(p.engagement_rate || 0).toFixed(1)}% engagement)`
    );

    const creatorName = profileResult.data?.first_name || profileResult.data?.display_name || "creator";
    const isLongForm = ["video", "blog"].includes(contentType || "");
    const isStructured = mode === "structured";

    // ── Determine content format context ─────────────────────────────────────
    const formatContext = isLongForm
      ? "a long-form video or blog post"
      : "a short-form social video (Reel, TikTok, or YouTube Short)";

    const topPostsBlock = topPosts.length > 0
      ? `Top performing recent content from this creator:\n${topPosts.map((p) => `- ${p}`).join("\n")}`
      : "No recent performance data — use general best practices.";

    // ── Build the prompt based on mode ───────────────────────────────────────
    let userPrompt: string;

    if (!isStructured) {
      // Simple / Quick Notes mode
      userPrompt = `You are a content script writer for ${formatContext}.

Topic: "${topic || "Creator content best practices"}"
Creator: ${creatorName}
${topPostsBlock}

Write a concise content outline in plain text (not JSON). Include:
- A strong hook idea (1-2 sentences)
- 3-5 bullet points for the core content
- A clear CTA

Keep it punchy and practical. Max 200 words. No markdown headers, just plain text.`;

    } else {
      // Structured mode
      userPrompt = `You are a content script writer for ${formatContext}.

Topic: "${topic || "Creator content best practices"}"
Creator: ${creatorName}
${topPostsBlock}

Write a complete structured script. Return ONLY a valid JSON object with this exact shape:
{
  "hook": "Attention-grabbing opening line or visual hook direction (1-2 sentences, max 120 chars)",
  "body": "The core content — numbered points, story beats, or key takeaways (max 300 words)",
  "cta": "Clear call-to-action for the viewer (1 sentence)",
  "caption": "Instagram/TikTok caption version (max 150 chars, no hashtags)",
  "hashtags": "#tag1 #tag2 #tag3 #tag4 #tag5"
}

No markdown. No explanation. Just the JSON object.`;
    }

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
        max_tokens: 1024,
        system: "You are an expert content strategist and script writer. Be direct, specific, and practical. Match the creator's voice.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content?.[0]?.text || "").trim();

    // ── Parse response based on mode ─────────────────────────────────────────
    let result: { mode: string; notes?: string; script?: Record<string, string> };

    if (!isStructured) {
      result = { mode: "simple", notes: rawText };
    } else {
      try {
        const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        result = {
          mode: "structured",
          script: {
            hook: parsed.hook || "",
            body: parsed.body || "",
            cta: parsed.cta || "",
            caption: parsed.caption || "",
            hashtags: parsed.hashtags || "",
          },
        };
      } catch {
        // Fallback: treat as notes if JSON parse fails
        result = { mode: "simple", notes: rawText };
      }
    }

    // ── Persist to DB if workflowId provided ─────────────────────────────────
    if (workflowId) {
      const scriptContent = result.mode === "structured"
        ? { ...result.script, hashtags: (result.script?.hashtags || "").split(" ").filter((t: string) => t.startsWith("#")) }
        : { notes: result.notes };

      await supabase
        .from("content_workflow_stages")
        .update({ script_content: scriptContent, updated_at: new Date().toISOString() })
        .eq("id", workflowId);
    }

    // ── Decrement quota ──────────────────────────────────────────────────────
    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("generate-script error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
