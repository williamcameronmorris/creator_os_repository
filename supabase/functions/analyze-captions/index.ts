import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * analyze-captions Edge Function
 *
 * Runs Claude Haiku over a user's top-performing post captions to extract:
 *   - Hook frameworks being used (e.g. "Question Hook", "Bold Claim", "Story Opener")
 *   - Dominant topic clusters (e.g. "guitar gear", "music production")
 *   - Caption style characteristics (length, tone, emoji/hashtag patterns)
 *   - Top patterns correlated with high engagement
 *
 * Upserts results into `user_content_profiles` for use by the recommendation engine.
 *
 * Request body:
 *   userId  - Supabase user ID
 *   force   - (optional) boolean, re-analyze even if profile is fresh (default: false)
 *
 * Called automatically at the end of instagram-sync (and future platform syncs).
 * Can also be triggered manually from the settings page.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// How many top posts to feed into the analysis
const POSTS_TO_ANALYZE = 25;

// Minimum posts required before we bother running analysis
const MIN_POSTS_REQUIRED = 5;

// Re-analyze if the last analysis is older than this (in hours)
const REANALYZE_AFTER_HOURS = 24;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!anthropicKey) {
      throw new Error("ANTHROPIC_API_KEY secret not set.");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const body = await req.json();
    const { userId, force = false } = body;

    if (!userId) throw new Error("Missing required field: userId");

    // ── Skip if analysis is still fresh (unless forced) ───────────────────────
    if (!force) {
      const { data: existingProfile } = await supabase
        .from("user_content_profiles")
        .select("analyzed_at, posts_analyzed")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingProfile?.analyzed_at) {
        const lastAnalyzed = new Date(existingProfile.analyzed_at).getTime();
        const hoursSince = (Date.now() - lastAnalyzed) / (1000 * 60 * 60);
        if (hoursSince < REANALYZE_AFTER_HOURS) {
          console.log(`Skipping analysis for ${userId} — last ran ${hoursSince.toFixed(1)}h ago`);
          return new Response(
            JSON.stringify({
              success: true,
              skipped: true,
              reason: `Analysis is fresh (${hoursSince.toFixed(1)}h old). Pass force:true to override.`,
              postsAnalyzed: existingProfile.posts_analyzed,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ── Pull top-performing published posts with captions ────────────────────
    // Sort by engagement_rate DESC, fall back to (likes + comments) for posts
    // that were synced before engagement_rate was calculated.
    const { data: posts, error: postsError } = await supabase
      .from("content_posts")
      .select("id, caption, platform, media_type, likes, comments, views, engagement_rate, published_date")
      .eq("user_id", userId)
      .eq("status", "published")
      .not("caption", "eq", "")
      .not("caption", "is", null)
      .order("engagement_rate", { ascending: false })
      .limit(POSTS_TO_ANALYZE);

    if (postsError) throw new Error(`Failed to fetch posts: ${postsError.message}`);

    const validPosts = (posts || []).filter((p) => p.caption && p.caption.trim().length > 10);

    if (validPosts.length < MIN_POSTS_REQUIRED) {
      return new Response(
        JSON.stringify({
          success: false,
          skipped: true,
          reason: `Not enough posts with captions to analyze (found ${validPosts.length}, need ${MIN_POSTS_REQUIRED}).`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Build the Claude prompt ───────────────────────────────────────────────
    const avgLen = Math.round(
      validPosts.reduce((sum, p) => sum + (p.caption?.length || 0), 0) / validPosts.length
    );

    const postSummaries = validPosts.map((p, i) => {
      const engagementScore = (p.likes || 0) + (p.comments || 0) * 2; // comments weighted higher
      const label = i < 5 ? "⭐ TOP PERFORMER" : "";
      return `Post ${i + 1} ${label}
Platform: ${p.platform} | Type: ${p.media_type}
Engagement: ${p.likes || 0} likes, ${p.comments || 0} comments, ${p.views || 0} views (score: ${engagementScore})
Caption: """
${p.caption.trim()}
"""`;
    }).join("\n\n---\n\n");

    const systemPrompt = `You are an expert content strategist analyzing a creator's top-performing social media posts.
Your job is to identify patterns in their captions that explain why their content performs well.

You understand hook frameworks, content structure, and what makes captions scroll-stopping.
Always respond with a single valid JSON object. No markdown, no explanation outside the JSON.`;

    const userPrompt = `Analyze these ${validPosts.length} posts from a creator (sorted by performance, top performers first).
Identify the patterns that make their content work.

${postSummaries}

Return ONLY a valid JSON object with this exact shape:
{
  "hook_frameworks": [
    "Framework name (e.g. 'Question Hook', 'Bold Claim', 'Story Opener', 'How-To', 'Contrarian Take', 'Behind The Scenes', 'Social Proof', 'Scarcity/FOMO')"
  ],
  "dominant_topics": [
    "Topic cluster (e.g. 'guitar gear reviews', 'music production tips', 'studio life', 'songwriting process')"
  ],
  "caption_style": "2-3 sentences describing their overall style: length preference, tone, use of line breaks, emojis, hashtags, CTAs",
  "top_patterns": [
    {
      "pattern": "Specific pattern description (max 80 chars)",
      "example_caption": "Brief excerpt from one of their top posts illustrating this pattern (max 120 chars)",
      "why_it_works": "One sentence on why this drives engagement"
    }
  ],
  "content_gaps": [
    "Topic or format this creator hasn't tried but their audience would likely respond to (based on their niche)"
  ],
  "voice_signature": "One sentence capturing the creator's unique voice/personality as expressed through their captions"
}

Rules:
- hook_frameworks: list 3-6 frameworks you actually see in the posts (not invented)
- dominant_topics: list 2-5 actual topic clusters
- top_patterns: identify exactly 3 patterns tied to the best-performing posts
- content_gaps: suggest 2-3 specific gaps
- Be specific to THIS creator — no generic advice`;

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
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text || "{}";

    let analysis: {
      hook_frameworks: string[];
      dominant_topics: string[];
      caption_style: string;
      top_patterns: Array<{ pattern: string; example_caption: string; why_it_works: string }>;
      content_gaps: string[];
      voice_signature: string;
    };

    try {
      const cleaned = rawText
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "")
        .trim();
      analysis = JSON.parse(cleaned);
    } catch {
      throw new Error(`Failed to parse Claude response: ${rawText.substring(0, 300)}`);
    }

    // ── Upsert user_content_profiles ──────────────────────────────────────────
    const profileData = {
      user_id: userId,
      hook_frameworks: analysis.hook_frameworks || [],
      dominant_topics: analysis.dominant_topics || [],
      caption_style: analysis.caption_style || "",
      avg_caption_length: avgLen,
      top_patterns: analysis.top_patterns || [],
      raw_analysis: {
        content_gaps: analysis.content_gaps || [],
        voice_signature: analysis.voice_signature || "",
        model: "claude-haiku-4-5-20251001",
        post_ids_analyzed: validPosts.map((p) => p.id),
      },
      posts_analyzed: validPosts.length,
      analyzed_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from("user_content_profiles")
      .upsert(profileData, { onConflict: "user_id" });

    if (upsertError) throw new Error(`Failed to save content profile: ${upsertError.message}`);

    console.log(`Caption analysis complete for user ${userId}: ${validPosts.length} posts analyzed`);

    return new Response(
      JSON.stringify({
        success: true,
        postsAnalyzed: validPosts.length,
        hookFrameworks: analysis.hook_frameworks,
        dominantTopics: analysis.dominant_topics,
        voiceSignature: analysis.voice_signature,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("analyze-captions error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
