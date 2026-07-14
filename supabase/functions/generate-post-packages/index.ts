import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";
import { loadVoiceContext } from "../_shared/voice.ts";

/**
 * generate-post-packages Edge Function — the Drop Zone brain.
 *
 * The creator drops a finished vertical video and (optionally) one line about
 * it. This function makes ONE Claude call and returns a complete,
 * platform-tailored post package for every requested platform: caption,
 * hashtags, a YouTube title where applicable, and a one-line "why this fits
 * the platform" note. The client renders one editable card per selected
 * ACCOUNT (accounts on the same platform share that platform's package
 * initially) and fans out one PFM post per account on send.
 *
 * Caller must be authenticated; userId is taken from the verified bearer token
 * (any userId in the body is ignored). Deploy `--no-verify-jwt`.
 *
 * Body:
 *   {
 *     description?: string,        // the creator's one optional line
 *     platforms: string[],         // unique platforms of the selected accounts
 *     mediaType: 'video' | 'image',
 *     socialAccountId?: string,    // reserved: per-account voice is a parallel
 *   }                              // workstream; accepted but unused today
 */

// Per-platform format rules encoded into the prompt. Keys are PFM platform ids.
const PLATFORM_SPECS: Record<string, string> = {
  instagram:
    'instagram — Reel caption, max 2200 chars, but the HOOK must land in the first 125 chars (only those show before "…more"). hashtags: 3-5, space-separated with #.',
  youtube:
    'youtube — this is a YouTube SHORT. title: required, max 90 chars, punchy and searchable. caption: the video description, 1-3 short paragraphs. hashtags: 2-3 (they render under the title).',
  tiktok:
    "tiktok — caption max 2200 chars, conversational and native to TikTok (talk like a person, not a brand). hashtags: 3-5.",
  x:
    'x — max 280 chars TOTAL for the caption INCLUDING any hashtag. Punchy, standalone. If one hashtag genuinely helps, put it inside the caption text; hashtags field must be "" (empty).',
  threads:
    'threads — max 500 chars, conversational, reads like a thought not an ad. No hashtag stuffing: hashtags field must be "" (empty).',
  facebook:
    "facebook — caption max 2200 chars, slightly fuller/warmer than IG. hashtags: minimal, 0-2.",
  bluesky:
    'bluesky — max 300 chars, conversational, community-native. hashtags: "" (empty) or at most 1.',
};

interface PostPackage {
  platform: string;
  caption: string;
  hashtags: string;
  title?: string;
  notes: string;
}

interface RecentPost {
  caption: string | null;
  title: string | null;
  platform: string | null;
  engagement_rate: number | null;
  likes: number | null;
  comments: number | null;
  published_at: string | null;
}

/** Rank score: engagement_rate when the sync computed one, likes+comments fallback. */
function engagementScore(p: RecentPost): number {
  const er = p.engagement_rate || 0;
  return er > 0 ? er : (p.likes || 0) + (p.comments || 0);
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

    const body = await req.json();
    const description: string = (body.description || "").trim();
    const mediaType: string = body.mediaType === "image" ? "image" : "video";
    // socialAccountId is accepted for forward-compat (per-account voice is a
    // parallel workstream) but intentionally unused here.
    const requested: string[] = Array.isArray(body.platforms) ? body.platforms : [];
    const platforms = [...new Set(requested)].filter((p) => PLATFORM_SPECS[p]);

    if (platforms.length === 0) {
      throw new Error("No supported platforms requested. Pass the unique platforms of the selected accounts.");
    }

    // ── Check quota ──────────────────────────────────────────────────────────
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });

    if (quotaError || !quotaData?.[0]) throw new Error("Failed to check AI quota");
    if (quotaData[0].requests_remaining <= 0) {
      throw new Error("Daily AI quota exceeded. Resets at midnight.");
    }

    // ── Gather creator context ───────────────────────────────────────────────
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const [voiceContext, profileResult, recentResult] = await Promise.all([
      // 2-arg call by design — do not add per-account args here (parallel
      // workstream owns _shared/voice.ts).
      loadVoiceContext(supabase, userId),
      supabase
        .from("profiles")
        .select("display_name, first_name, niche_preference")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("content_posts")
        .select("caption, title, platform, engagement_rate, likes, comments, published_at")
        .eq("user_id", userId)
        .eq("status", "published")
        // published_at is what the sync writes; published_date is a dead column.
        .gte("published_at", thirtyDaysAgoStr)
        .order("published_at", { ascending: false })
        .limit(30),
    ]);

    const niche = (profileResult.data?.niche_preference || "").trim();
    const creatorName = profileResult.data?.first_name || profileResult.data?.display_name || "the creator";

    // Top 3 recent posts by engagement for style grounding.
    const topPosts = ((recentResult.data || []) as RecentPost[])
      .sort((a, b) => engagementScore(b) - engagementScore(a))
      .slice(0, 3)
      .map((p) => {
        const text = (p.caption || p.title || "").slice(0, 300);
        return text ? `- [${p.platform || "unknown"}] "${text}"` : null;
      })
      .filter(Boolean) as string[];

    const topPostsBlock = topPosts.length > 0
      ? `Their top-performing recent posts (match this energy and style):\n${topPosts.join("\n")}`
      : "No recent performance data — lean fully on the voice profile and best practices.";

    // ── Build the prompt ─────────────────────────────────────────────────────
    const specsBlock = platforms.map((p) => `- ${PLATFORM_SPECS[p]}`).join("\n");

    const userPrompt = `A creator just finished a ${mediaType === "video" ? "vertical short-form video (Reel / Short / TikTok)" : "post image"} and wants to publish it everywhere at once. Write a COMPLETE, platform-tailored post package for each platform below. Do NOT write near-identical captions — each platform gets its own native version.

Creator: ${creatorName}${niche ? `\nNiche: ${niche} — keep everything specific to this niche.` : ""}
${description ? `What the ${mediaType} is about (their words): "${description}"` : `The creator gave no description — write packages that work for a strong ${niche || "creator"} ${mediaType === "video" ? "short" : "post"}, kept general enough to fit, hooks first.`}

${topPostsBlock}

Platform format rules — follow the char limits EXACTLY:
${specsBlock}

Return ONLY a valid JSON object, no markdown, with this exact shape:
{
  "packages": [
    {
      "platform": "one of: ${platforms.join(", ")}",
      "caption": "the full caption/description text for that platform",
      "hashtags": "space-separated with #, e.g. \\"#a #b #c\\" — or \\"\\" where the rules say empty",
      "title": "YouTube ONLY: the Short's title, max 90 chars. Omit for other platforms.",
      "notes": "1 short line: what makes this version fit this platform"
    }
  ]
}
Exactly one package per platform listed above (${platforms.length} total). No explanation. Just the JSON object.`;

    // ── Call Claude ──────────────────────────────────────────────────────────
    // Same caching pattern as generate-script: base instructions + the per-user
    // voice fingerprint form a stable prefix, so the voice block carries
    // cache_control and repeat drops within 5 minutes read it from cache. The
    // varying video description lives in the user message. thinking disabled to
    // keep latency/spend predictable for the tiered quota system.
    const baseSystem =
      "You are an expert social media packager for content creators. You turn one finished video into native, platform-perfect post copy. Be specific, hooky, and human — never generic, never AI-flavored.";
    const system = voiceContext
      ? [
          { type: "text", text: baseSystem },
          { type: "text", text: voiceContext, cache_control: { type: "ephemeral" } },
        ]
      : `${baseSystem} Match the creator's voice from the sample posts.`;

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        thinking: { type: "disabled" },
        system,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      throw new Error(`Claude API error: ${claudeRes.status} ${errText}`);
    }

    const claudeData = await claudeRes.json();
    const rawText = (claudeData.content?.[0]?.text || "").trim();

    // A max_tokens cutoff means the JSON is incomplete — surface a clear
    // retryable error instead of dumping half-JSON at the client.
    if (claudeData.stop_reason === "max_tokens") {
      throw new Error("Package generation was cut off before it finished. Please try again.");
    }

    // ── Parse (fence-strip pattern) ──────────────────────────────────────────
    let packages: PostPackage[];
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed?.packages)) throw new Error("missing packages array");
      packages = platforms.map((platform) => {
        const pkg = parsed.packages.find((x: PostPackage) => x?.platform === platform);
        if (!pkg || typeof pkg.caption !== "string" || pkg.caption.trim().length === 0) {
          throw new Error(`missing package for ${platform}`);
        }
        return {
          platform,
          caption: pkg.caption.trim(),
          hashtags: typeof pkg.hashtags === "string" ? pkg.hashtags.trim() : "",
          title: platform === "youtube" ? (pkg.title || "").trim().slice(0, 90) : undefined,
          notes: typeof pkg.notes === "string" ? pkg.notes.trim() : "",
        };
      });
    } catch {
      // Never return half-JSON — a clean retryable error lets the client just
      // re-invoke.
      throw new Error("Clio's response didn't parse cleanly. Please try again.");
    }

    // ── Decrement quota ──────────────────────────────────────────────────────
    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(
      JSON.stringify({ success: true, packages }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("generate-post-packages error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
