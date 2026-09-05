import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUserOrCron, corsHeaders, resolveBrandId } from "../_shared/auth.ts";

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
 *   userId          - Supabase user ID
 *   force           - (optional) boolean, re-analyze even if profile is fresh (default: false)
 *   socialAccountId - (optional) Post for Me social account id. When present,
 *                     only THAT account's posts are analyzed and the result is
 *                     upserted into the (user_id, social_account_id) profile
 *                     row — each connected account gets its own voice. When
 *                     absent, behavior is exactly the legacy user-level
 *                     analysis (social_account_id NULL row).
 *
 * Called automatically at the end of instagram-sync (and future platform syncs).
 * Can also be triggered manually from the settings page.
 */

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
    // Accept EITHER a user JWT (settings-page trigger — unchanged behavior)
    // OR { cronSecret, userId } in the body, so sync functions and cron can
    // fire the voice/caption analysis for any user server-side.
    const body = await req.json().catch(() => ({}));
    const auth = await requireUserOrCron(req, supabase, body, "Cron_Secret");
    if (!auth.ok) return auth.response;
    const userId = auth.userId;
    const { force = false } = body;
    // Optional per-account scope. Non-string / empty values collapse to null
    // (user-level analysis, the legacy behavior).
    const socialAccountId: string | null =
      typeof body.socialAccountId === "string" && body.socialAccountId.trim()
        ? body.socialAccountId.trim()
        : null;
    // The voice profile belongs to the brand of the scoped account (or the
    // default brand for the account-less legacy row).
    const brandId = await resolveBrandId(supabase, userId, socialAccountId);

    if (!userId) throw new Error("Missing required field: userId");

    // ── Skip if analysis is still fresh (unless forced) ───────────────────────
    // Freshness is per profile ROW: an account-scoped rebuild checks the
    // account's row, not the user-level one.
    if (!force) {
      let freshnessQuery = supabase
        .from("user_content_profiles")
        .select("analyzed_at, posts_analyzed")
        .eq("user_id", userId);
      freshnessQuery = socialAccountId
        ? freshnessQuery.eq("social_account_id", socialAccountId)
        : freshnessQuery.is("social_account_id", null);
      const { data: existingProfile } = await freshnessQuery.maybeSingle();

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
    let postsQuery = supabase
      .from("content_posts")
      .select("id, caption, platform, media_type, likes, comments, views, engagement_rate, published_date, account_username")
      .eq("user_id", userId)
      .eq("status", "published")
      .not("caption", "eq", "")
      .not("caption", "is", null);
    // Account scope: only that account's posts feed its voice. User-level
    // analysis keeps reading everything (legacy behavior).
    if (socialAccountId) postsQuery = postsQuery.eq("social_account_id", socialAccountId);
    const { data: posts, error: postsError } = await postsQuery
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

    // CANONICAL hook-framework taxonomy — must match inspiration_entries.hook_framework
    // (see migration 20260323000002_add_inspiration_entries.sql). Free-form names
    // here would never join against the Outlier library that powers framework
    // matching, silently breaking it.
    const CANONICAL_FRAMEWORKS = [
      "Proof-First", "Curiosity Gap", "Pain Point", "Challenge",
      "Question + Proof", "Bold Claim", "Storytelling", "Contrarian",
      "How-To", "List/Ranking",
    ];

    const userPrompt = `Analyze these ${validPosts.length} posts from a creator (sorted by performance, top performers first).
Identify the patterns that make their content work.

${postSummaries}

Return ONLY a valid JSON object with this exact shape:
{
  "hook_frameworks": [
    "Framework name — choose ONLY from this list, exactly as written: ${CANONICAL_FRAMEWORKS.map((f) => `'${f}'`).join(", ")}"
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
  "voice_signature": "One sentence capturing the creator's unique voice/personality as expressed through their captions",
  "voice_profile": {
    "tone": "2-4 words for their tone (e.g. 'warm, direct, a little cheeky')",
    "formality": "casual | conversational | polished | formal",
    "emoji_use": "how they use emojis (e.g. 'rare, only for emphasis' or 'frequent and playful')",
    "sentence_shapes": ["2-4 short descriptions of their sentence rhythm (e.g. 'short punchy fragments', 'one long build then a payoff')"],
    "signature_phrases": ["3-6 exact words or phrases they ACTUALLY reuse across posts"],
    "hook_openers": ["2-4 ways they ACTUALLY start a post or hook"],
    "cta_style": "how they ask for action (e.g. 'soft, curiosity-led' or 'direct: comment a word')",
    "avoid": ["2-3 things that would read as OFF their voice (e.g. 'corporate jargon', 'hashtag stuffing')"]
  }
}

Rules:
- hook_frameworks: list 3-6 frameworks you actually see in the posts. Choose ONLY from the canonical list above — never invent new framework names, never rephrase them
- dominant_topics: list 2-5 actual topic clusters
- top_patterns: identify exactly 3 patterns tied to the best-performing posts
- content_gaps: suggest 2-3 specific gaps
- voice_profile: fill every field from what you ACTUALLY observe — quote their real phrases in signature_phrases, never invent them
- Be specific to THIS creator — no generic advice`;

    // ── Call Claude ───────────────────────────────────────────────────────────
    // Sonnet 5 for the extractor: the voice profile is foundational — a richer
    // read of the creator's voice improves every downstream generation — and it
    // runs rarely (on rebuild, rate-limited to once/24h). thinking is disabled
    // to keep cost and latency predictable; the task is extraction, not reasoning.
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 2200,
        thinking: { type: "disabled" },
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
      voice_profile?: Record<string, unknown>;
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
    // Denormalized handle for UI labels ("@gibsunday's voice"). Taken from the
    // analyzed posts themselves — they're already scoped to the account.
    type PostWithHandle = { account_username?: string | null };
    const postWithHandle = socialAccountId
      ? (validPosts as PostWithHandle[]).find((p) => p.account_username)
      : undefined;
    const accountUsername = postWithHandle?.account_username ?? null;

    const profileData = {
      user_id: userId,
      brand_id: brandId,
      // NULL = the brand-level/legacy "main voice" row.
      social_account_id: socialAccountId,
      account_username: accountUsername,
      hook_frameworks: analysis.hook_frameworks || [],
      dominant_topics: analysis.dominant_topics || [],
      caption_style: analysis.caption_style || "",
      avg_caption_length: avgLen,
      top_patterns: analysis.top_patterns || [],
      // The voice fingerprint the generators write in (see _shared/voice.ts).
      voice_profile: analysis.voice_profile || null,
      raw_analysis: {
        content_gaps: analysis.content_gaps || [],
        voice_signature: analysis.voice_signature || "",
        model: "claude-sonnet-5",
        post_ids_analyzed: validPosts.map((p) => p.id),
      },
      posts_analyzed: validPosts.length,
      analyzed_at: new Date().toISOString(),
    };

    // Conflict target is the (brand, account) key. social_account_key is a
    // STORED generated column (coalesce(social_account_id,'')) so brand-level
    // rows (NULL account → '') and per-account rows share one upsert path.
    // Was (user, account) until migration 20260904170000_brand_isolation.sql;
    // per user, a second brand's voice would have overwritten the first's.
    const { error: upsertError } = await supabase
      .from("user_content_profiles")
      .upsert(profileData, { onConflict: "brand_id,social_account_key" });

    if (upsertError) throw new Error(`Failed to save content profile: ${upsertError.message}`);

    console.log(
      `Caption analysis complete for user ${userId}${socialAccountId ? ` (account ${socialAccountId})` : ""}: ${validPosts.length} posts analyzed`,
    );

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
