/**
 * Canonicalize a free-text niche_preference into a shared slug so the guitar
 * variants ("Rock Guitar", "Guitar improvisation", a whole paragraph, ...)
 * collapse onto ONE cached niche. Both the on-demand path (watch-ensure-niche)
 * and the weekly cron (watch-discovery) MUST use this same function, or the
 * cron writes creators under a different slug than the app reads and the feed
 * goes permanently stale.
 */
export function canonicalNiche(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return "";
  if (s.includes("guitar")) return "guitar";
  if (s.includes("real estate") || s.includes("realtor")) return "real estate";
  const words = s.split(/[\s,.;/|_-]+/).filter(Boolean);
  return words.slice(0, 3).join(" ");
}
