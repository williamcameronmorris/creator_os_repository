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
