/**
 * Canonicalize a free-text niche_preference into a shared slug so the guitar
 * variants ("Rock Guitar", "Guitar improvisation", a whole paragraph, ...)
 * collapse onto ONE cached niche. Both the on-demand path (watch-ensure-niche)
 * and the weekly cron (watch-discovery) MUST use this same function, or the
 * cron writes creators under a different slug than the app reads and the feed
 * goes permanently stale.
 */
// Filler words stripped before slugging so verbose niches ("how to grow a
// channel for busy dads") collapse onto their content words instead of
// wasting the 3-word budget on glue.
const STOPWORDS = new Set([
  "the", "a", "an", "for", "and", "of", "my", "to", "in", "on", "with", "how",
]);

export function canonicalNiche(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("guitar")) return "guitar";
  if (s.includes("real estate") || s.includes("realtor")) return "real estate";
  const allWords = s.split(/[\s,.;/|_-]+/).filter(Boolean);
  const words = allWords.filter((w) => !STOPWORDS.has(w));
  // Degenerate case: the whole niche was stopwords — fall back to raw words
  // rather than returning an empty slug.
  return (words.length > 0 ? words : allWords).slice(0, 3).join(" ");
}

/**
 * `inspiration_entries` is ONE Notion-synced table shared by every user: no
 * user_id, no brand_id, 416 rows. It is a reference shelf of other creators'
 * posts, not anybody's private library, and the only column that says what a
 * row is about is `topic_tags`.
 *
 * This maps a creator's free-text niche onto that tag vocabulary so Clio can
 * read the slice of the shelf that has something to do with their work. An
 * unrecognised niche returns [] and the caller leaves the query unfiltered —
 * the whole shelf is the honest answer there, and the prompt says plainly that
 * it is shared reference material either way.
 *
 * The vocabulary mirrors the tags Notion actually writes. A tag that appears
 * in Notion but not here simply never gets matched; nothing breaks.
 */
export const INSPIRATION_TOPIC_TAGS = [
  "Content Creation",
  "Monetization",
  "Social Media Growth",
  "Marketing",
  "Personal Brand",
  "Audience Building",
  "AI Tools",
  "Copywriting",
  "Video Editing",
  "Productivity",
] as const;

// Single words are matched as whole words; entries containing a space are
// matched as a phrase anywhere in the niche text.
const TAG_KEYWORDS: Record<string, string[]> = {
  "Content Creation": [
    "content", "creator", "creators", "creating", "post", "posts", "posting",
    "reel", "reels", "short", "shorts", "video", "videos", "youtube",
    "instagram", "tiktok", "podcast", "vlog", "filming",
  ],
  "Monetization": [
    "monetize", "monetise", "monetization", "money", "income", "revenue",
    "sell", "selling", "sales", "offer", "offers", "pricing", "product",
    "products", "course", "courses", "coaching", "freelance", "freelancing",
    "client", "clients", "digital products",
  ],
  "Social Media Growth": [
    "growth", "grow", "growing", "followers", "viral", "algorithm", "reach",
    "social media", "going viral",
  ],
  "Marketing": [
    "marketing", "funnel", "funnels", "ads", "advertising", "email",
    "newsletter", "seo", "launch", "launches", "promotion",
  ],
  "Personal Brand": [
    "brand", "branding", "positioning", "authority", "personal brand",
    "thought leadership",
  ],
  "Audience Building": [
    "audience", "community", "subscribers", "followership", "fans",
    "email list", "building an audience",
  ],
  "AI Tools": [
    "ai", "automation", "automate", "gpt", "llm", "prompt", "prompts",
    "chatgpt", "claude", "ai tools",
  ],
  "Copywriting": [
    "copywriting", "copy", "writing", "writer", "hook", "hooks", "headline",
    "headlines", "caption", "captions", "scripting",
  ],
  "Video Editing": [
    "editing", "editor", "capcut", "premiere", "davinci", "b-roll", "broll",
    "video editing",
  ],
  "Productivity": [
    "productivity", "systems", "workflow", "workflows", "habits",
    "time management",
  ],
};

/** Tags from INSPIRATION_TOPIC_TAGS that a free-text niche plausibly covers.
 *  Empty when nothing matches — the caller then filters nothing. */
export function inspirationTagsForNiche(raw: string): string[] {
  const text = (raw || "").toLowerCase().trim();
  if (!text) return [];
  const words = new Set(text.split(/[^a-z0-9+]+/).filter(Boolean));
  const hits: string[] = [];
  for (const tag of INSPIRATION_TOPIC_TAGS) {
    const keywords = TAG_KEYWORDS[tag] || [];
    const matched = keywords.some((k) => (k.includes(" ") ? text.includes(k) : words.has(k)));
    if (matched) hits.push(tag);
  }
  return hits;
}
