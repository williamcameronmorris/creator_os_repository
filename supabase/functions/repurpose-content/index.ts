import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser, corsHeaders } from "../_shared/auth.ts";

const PLATFORM_GUIDELINES: Record<string, {
  captionMaxChars: number;
  hashtagCount: string;
  tone: string;
  formatNotes: string;
  cta: string;
}> = {
  instagram: {
    captionMaxChars: 2200,
    hashtagCount: "10-15 hashtags",
    tone: "conversational, aspirational, personal",
    formatNotes: "Use line breaks for readability. Lead with a strong hook in the first line (shows before 'more'). Mix niche and broad hashtags.",
    cta: "Save this, tag someone, or 'Link in bio'",
  },
  tiktok: {
    captionMaxChars: 2200,
    hashtagCount: "3-5 trending hashtags",
    tone: "casual, energetic, trend-aware, Gen Z friendly",
    formatNotes: "Short punchy caption. First line should hook instantly. Use trending audio references when relevant. Emojis are encouraged.",
    cta: "Comment, duet, or stitch this",
  },
  youtube: {
    captionMaxChars: 5000,
    hashtagCount: "3-5 hashtags in description",
    tone: "informative, value-driven, searchable",
    formatNotes: "Front-load the description with keywords. Include timestamps if applicable. Add links and resources. Write for SEO — use the topic keyword in the first sentence.",
    cta: "Subscribe, like, and enable notifications",
  },
  threads: {
    captionMaxChars: 500,
    hashtagCount: "0-3 hashtags (optional)",
    tone: "conversational, direct, opinion-driven, Twitter-like",
    formatNotes: "Short and punchy. Works best as a take, opinion, or question. No need for hashtags. Can be a thread (multiple connected posts).",
    cta: "Reply with your thoughts",
  },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseKey);
    const auth = await requireUser(req, supabase);
    if (!auth.ok) return auth.response;
    const userId = auth.userId;

    const { postId, sourcePlatform, targetPlatforms, originalCaption, mediaType } = await req.json();
    if (!originalCaption) throw new Error("Missing required field: originalCaption");

    const targets: string[] = targetPlatforms || ["instagram", "tiktok", "youtube", "threads"];
    const results: Record<string, { caption: string; hashtags: string[]; tips: string[] }> = {};

    if (!anthropicKey) {
      // Fallback: rule-based repurposing without AI
      for (const target of targets) {
        if (target === sourcePlatform) continue;
        const guide = PLATFORM_GUIDELINES[target];
        if (!guide) continue;

        const truncated = originalCaption.substring(0, guide.captionMaxChars - 50);
        results[target] = {
          caption: truncated,
          hashtags: [],
          tips: [
            `Keep under ${guide.captionMaxChars} characters`,
            `Use ${guide.hashtagCount}`,
            guide.formatNotes,
            `CTA: ${guide.cta}`,
          ],
        };
      }
    } else {
      // AI-powered repurposing
      for (const target of targets) {
        if (target === sourcePlatform) continue;
        const guide = PLATFORM_GUIDELINES[target];
        if (!guide) continue;

        const prompt = `You are an expert social media content strategist. Repurpose the following ${sourcePlatform} caption for ${target}.

ORIGINAL CAPTION (${sourcePlatform}):
${originalCaption}

TARGET PLATFORM GUIDELINES (${target}):
- Max characters: ${guide.captionMaxChars}
- Hashtags: ${guide.hashtagCount}
- Tone: ${guide.tone}
- Format notes: ${guide.formatNotes}
- CTA to include: ${guide.cta}
- Content type: ${mediaType || "post"}

Respond ONLY with valid JSON in this exact format (no markdown, no code blocks):
{
  "caption": "The full repurposed caption text here",
  "hashtags": ["hashtag1", "hashtag2", "hashtag3"],
  "tips": ["Tip 1 for this platform", "Tip 2", "Tip 3"]
}

Requirements:
- Adapt the tone and style completely to match ${target}'s culture
- Keep the core message and value
- The caption field should NOT include hashtags (they go in the hashtags array)
- Hashtags should be without the # symbol
- Include 2-3 actionable platform-specific tips`;

        try {
          const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": anthropicKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-haiku-4-5-20251001",
              max_tokens: 1024,
              messages: [{ role: "user", content: prompt }],
            }),
          });

          const aiData = await aiRes.json();
          const rawText = aiData.content?.[0]?.text || "";

          // Parse JSON from response
          const jsonMatch = rawText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            results[target] = {
              caption: parsed.caption || originalCaption.substring(0, guide.captionMaxChars),
              hashtags: parsed.hashtags || [],
              tips: parsed.tips || [],
            };
          } else {
            throw new Error("Could not parse AI response");
          }
        } catch (aiErr) {
          console.error(`AI repurpose failed for ${target}:`, aiErr);
          // Fallback for this target
          results[target] = {
            caption: originalCaption.substring(0, guide.captionMaxChars),
            hashtags: [],
            tips: [`Use ${guide.hashtagCount}`, guide.formatNotes, `CTA: ${guide.cta}`],
          };
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("repurpose-content error:", err.message);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
