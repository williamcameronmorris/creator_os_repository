/**
 * Public media kit: types, fetchers and number formatting.
 *
 * The public page talks ONLY to the public-media-kit edge function, never to
 * tables. That function is the single whitelisted read path into a creator's
 * numbers; see supabase/functions/public-media-kit/index.ts.
 */

export interface PublicKitPlatform {
  platform: string;
  handle: string | null;
  url: string | null;
  followers: number | null;
  followers_source: 'synced' | 'manual' | null;
  followers_as_of: string | null;
  growth_30d_pct: number | null;
  engagement_rate: number | null;
  total_posts: number;
  avg_views: number | null;
  as_of: string | null;
}

export interface PublicKitRate {
  label: string;
  description: string | null;
  price_cents: number | null;
  price_prefix: string | null;
  currency: string;
  platform: string | null;
}

export interface PublicKitPost {
  platform: string;
  thumbnail_url: string;
  permalink: string | null;
  published_at: string | null;
  metric_label: 'views' | 'likes';
  metric_value: number;
}

export interface PublicKit {
  kit: {
    slug: string;
    display_name: string | null;
    headline: string | null;
    bio: string | null;
    avatar_url: string | null;
    location: string | null;
    website: string | null;
    theme: string;
    contact: { mode: 'form' | 'email' | 'link'; label: string; email: string | null; url: string | null };
  };
  totals: { followers: number };
  platforms: PublicKitPlatform[];
  rates: PublicKitRate[];
  top_posts: PublicKitPost[];
  stats_as_of: string | null;
  stats_stale: boolean;
}

export interface LeadInput {
  brand_name: string;
  contact_name: string;
  contact_email: string;
  budget_tier: string;
  message: string;
  /** Honeypot. Always empty from a real browser. */
  website: string;
}

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-media-kit`;
const HEADERS = { apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string };

/** Null when the kit does not exist or is not published. */
export async function fetchPublicKit(slug: string): Promise<PublicKit | null> {
  // no-store: the owner opens this seconds after publishing; a cached miss
  // would say "not published" for a minute.
  const res = await fetch(`${FN_URL}?slug=${encodeURIComponent(slug)}`, { headers: HEADERS, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not load this media kit (${res.status})`);
  return (await res.json()) as PublicKit;
}

export async function submitLead(slug: string, lead: LeadInput): Promise<void> {
  const res = await fetch(`${FN_URL}/lead`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, ...lead }),
  });
  if (res.ok) return;
  let detail = '';
  try {
    detail = ((await res.json()) as { error?: string }).error ?? '';
  } catch {
    // no body
  }
  throw new Error(detail || `Could not send (${res.status})`);
}

/** 146119 → "146K", 30500 → "30.5K", 1250000 → "1.3M", 999 → "999". */
export function fmtCompact(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  const trim = (s: string) => s.replace(/\.0$/, '');
  if (abs < 1000) return String(Math.round(n));
  if (abs < 100_000) return `${trim((n / 1000).toFixed(1))}K`;
  if (abs < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${trim((n / 1_000_000).toFixed(1))}M`;
}

/** 1.52 → "+1.5%", -0.34 → "-0.3%", 0 → "0%". */
export function fmtPct(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return '0%';
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}%`;
}

/** 50000 → "$500", 125050 → "$1,250.50"; null → "Inquire"; prefix "from" → "from $250". */
export function fmtMoney(cents: number | null, currency = 'USD', prefix: string | null = null): string {
  if (cents == null) return 'Inquire';
  const whole = cents % 100 === 0;
  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(cents / 100);
  return prefix ? `${prefix} ${amount}` : amount;
}

/** "2026-07-04" or an ISO timestamp → "Jul 4, 2026". */
export function fmtDate(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
