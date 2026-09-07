/**
 * Link-preview tags for a public media kit.
 *
 * Pure: takes the kit payload the public-media-kit function returns and the
 * page URL, gives back the <head> fragment. Kept apart from the handler so it
 * can be unit-tested without Vercel. Files starting with "_" are not deployed
 * as functions.
 */

export interface KitPayloadLite {
  kit: {
    slug: string;
    display_name: string | null;
    headline: string | null;
    bio: string | null;
    avatar_url: string | null;
  };
  totals: { followers: number };
  platforms: { platform: string; handle: string | null }[];
  top_posts: { thumbnail_url: string }[];
}

export const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/;

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 146119 → "146K"; same rule as the page. */
export function compact(n: number): string {
  if (!Number.isFinite(n) || n < 1000) return String(Math.max(0, Math.round(n)));
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (n < 100_000) return `${trim((n / 1000).toFixed(1))}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${trim((n / 1_000_000).toFixed(1))}M`;
}

const LABEL: Record<string, string> = {
  instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', threads: 'Threads', facebook: 'Facebook', x: 'X', bluesky: 'Bluesky',
};

export function describe(p: KitPayloadLite): string {
  const parts: string[] = [];
  if (p.totals.followers > 0) parts.push(`${compact(p.totals.followers)} followers`);
  const names = p.platforms.map((x) => LABEL[x.platform] ?? x.platform);
  if (names.length) parts.push(names.join(', '));
  const lead = parts.join(' across ') || 'Media kit';
  const tail = (p.kit.headline || p.kit.bio || '').trim();
  return tail ? `${lead}. ${tail}`.slice(0, 200) : lead;
}

export function buildMeta(p: KitPayloadLite, pageUrl: string): string {
  const name = p.kit.display_name || p.kit.slug;
  const title = `${name} · Media kit`;
  const description = describe(p);
  const image = p.kit.avatar_url || p.top_posts[0]?.thumbnail_url || null;
  const tags = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(pageUrl)}" />`,
    `<meta property="og:site_name" content="Cliopatra" />`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
  ];
  if (image) {
    tags.push(`<meta property="og:image" content="${esc(image)}" />`);
    tags.push(`<meta name="twitter:image" content="${esc(image)}" />`);
  }
  return tags.join('\n    ');
}

/** Replace the shell's generic title/description and add the kit's tags before </head>. */
export function injectHead(html: string, metaFragment: string): string {
  const stripped = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta\s+name="description"[^>]*\/?>\s*/i, '');
  return stripped.replace(/<\/head>/i, `    ${metaFragment}\n  </head>`);
}
