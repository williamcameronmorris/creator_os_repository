import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * loadVoiceContext
 *
 * Builds a prompt block describing a creator's writing voice, extracted from
 * their OWN posts by `analyze-captions` and stored in `user_content_profiles`.
 * Injected into the system prompt of the AI generators so output sounds like
 * the creator, not generic AI.
 *
 * Account separation: profiles are keyed (brand_id, social_account_id).
 * Rows with social_account_id NULL are the BRAND-level profile — the "main
 * voice" — and there is one per brand (migration 20260904170000). When
 * `socialAccountId` is passed we load THAT account's profile first and fall
 * back to the brand's main voice if the account hasn't built its own yet;
 * @gibsunday and @heycam each sound like themselves, and a brand-new account
 * still gets its brand's voice instead of generic AI.
 *
 * `brandId` pins the fallback. Without it, a user with two brands has two
 * main-voice rows and the fallback would pick one at random. Callers resolve
 * it with resolveBrandId() in _shared/auth.ts; 2- and 3-arg calls still work
 * for single-brand users.
 *
 * Returns `null` when no usable profile exists, so callers fall back to their
 * default prompt.
 *
 * The returned string is a STABLE per-user(-per-account) prefix. Callers
 * should place it in a `system` block carrying
 * `cache_control: { type: "ephemeral" }` so a creator's repeat generations
 * within the 5-minute window read the voice prefix from cache instead of
 * paying to re-process it.
 */

type ProfileVoiceRow = {
  voice_profile: unknown;
  caption_style: string | null;
  raw_analysis: unknown;
};

async function fetchProfileRow(
  supabase: SupabaseClient,
  userId: string,
  socialAccountId: string | null,
  brandId: string | null = null,
): Promise<ProfileVoiceRow | null> {
  let query = supabase
    .from("user_content_profiles")
    .select("voice_profile, caption_style, raw_analysis")
    .eq("user_id", userId);
  if (brandId) query = query.eq("brand_id", brandId);
  // Explicitly pin the account dimension: with per-account rows in the table,
  // an unfiltered .maybeSingle() would error on >1 rows.
  query = socialAccountId
    ? query.eq("social_account_id", socialAccountId)
    : query.is("social_account_id", null);
  const { data } = await query.maybeSingle();
  return (data as ProfileVoiceRow | null) ?? null;
}

function formatVoiceBlock(data: ProfileVoiceRow): string | null {
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

export async function loadVoiceContext(
  supabase: SupabaseClient,
  userId: string,
  socialAccountId?: string | null,
  brandId?: string | null,
): Promise<string | null> {
  if (socialAccountId) {
    const accountRow = await fetchProfileRow(supabase, userId, socialAccountId, brandId ?? null);
    if (accountRow) {
      const block = formatVoiceBlock(accountRow);
      if (block) return block;
    }
    // Account has no voice (or an unusable one) — fall back to the main voice.
  }
  const userRow = await fetchProfileRow(supabase, userId, null, brandId ?? null);
  if (!userRow) return null;
  return formatVoiceBlock(userRow);
}

/**
 * loadAccountNiche
 *
 * The account-scoped half of the niche resolution order:
 *   user_content_profiles.niche (for the account) → profiles.niche_preference.
 *
 * Returns the trimmed account niche, or null when the account has no profile
 * row / no niche set — callers then fall back to profiles.niche_preference
 * exactly as before.
 */
export async function loadAccountNiche(
  supabase: SupabaseClient,
  userId: string,
  socialAccountId?: string | null,
  brandId?: string | null,
): Promise<string | null> {
  if (!socialAccountId) return null;
  let query = supabase
    .from("user_content_profiles")
    .select("niche")
    .eq("user_id", userId)
    .eq("social_account_id", socialAccountId);
  if (brandId) query = query.eq("brand_id", brandId);
  const { data } = await query.maybeSingle();
  const niche = ((data as { niche?: string | null } | null)?.niche || "").trim();
  return niche || null;
}
