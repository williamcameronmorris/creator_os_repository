import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * loadVoiceContext
 *
 * Builds a prompt block describing a creator's writing voice, extracted from
 * their OWN posts by `analyze-captions` and stored per-user in
 * `user_content_profiles`. Injected into the system prompt of the AI generators
 * so output sounds like the creator, not generic AI.
 *
 * Per-user by construction: keyed on `user_id`, owner-scoped by RLS. There is
 * no shared/house voice — each creator gets their own.
 *
 * Returns `null` when the user has no usable profile yet, so callers fall back
 * to their default prompt. Fully additive: a user with no Voice behaves exactly
 * as before.
 *
 * The returned string is a STABLE per-user prefix. Callers should place it in a
 * `system` block carrying `cache_control: { type: "ephemeral" }` so a creator's
 * repeat generations within the 5-minute window read the voice prefix from
 * cache instead of paying to re-process it.
 */
export async function loadVoiceContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("user_content_profiles")
    .select("voice_profile, caption_style, raw_analysis")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return null;

  const vp = (data.voice_profile ?? null) as
    | {
        tone?: string;
        formality?: string;
        emoji_use?: string;
        sentence_shapes?: string[];
        signature_phrases?: string[];
        hook_openers?: string[];
        cta_style?: string;
        avoid?: string[];
      }
    | null;
  const captionStyle = (data.caption_style as string) || "";
  const voiceSignature =
    (data.raw_analysis as { voice_signature?: string } | null)?.voice_signature || "";

  // Nothing usable yet (e.g. an older profile built before voice extraction, or
  // a brand-new user). Let the caller use its default prompt.
  if (!vp && !captionStyle && !voiceSignature) return null;

  const lines: string[] = [
    "THE CREATOR'S VOICE — write everything below to sound exactly like them, not like AI:",
  ];
  if (voiceSignature) lines.push(`- Voice in one line: ${voiceSignature}`);
  if (vp?.tone) lines.push(`- Tone: ${vp.tone}`);
  const register = [vp?.formality, vp?.emoji_use].filter(Boolean).join("; ");
  if (register) lines.push(`- Register: ${register}`);
  if (vp?.sentence_shapes?.length) {
    lines.push(`- Sentence shapes they use: ${vp.sentence_shapes.join(" · ")}`);
  }
  if (vp?.signature_phrases?.length) {
    lines.push(`- Signature phrases (use naturally, never force): ${vp.signature_phrases.join(" · ")}`);
  }
  if (vp?.hook_openers?.length) {
    lines.push(`- How they open hooks: ${vp.hook_openers.join(" · ")}`);
  }
  if (vp?.cta_style) lines.push(`- Their CTA style: ${vp.cta_style}`);
  if (captionStyle) lines.push(`- Caption style: ${captionStyle}`);
  if (vp?.avoid?.length) lines.push(`- NEVER do this (reads as off-voice): ${vp.avoid.join(" · ")}`);
  lines.push("Match this voice precisely. The output should read like the creator wrote it themselves.");

  return lines.join("\n");
}
