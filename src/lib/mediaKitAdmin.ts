import { supabase } from './supabase';

/**
 * Owner-side media kit helpers: the editor and the leads inbox.
 *
 * Everything here goes through supabase-js as the signed-in user, so RLS
 * (owner-only + brand isolation) is the guard. The PUBLIC read is elsewhere
 * (src/lib/mediaKit.ts → the public-media-kit function).
 */

export const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$/;

/** Platforms a kit can show, in display order. */
export const KIT_PLATFORMS = ['instagram', 'youtube', 'tiktok', 'threads', 'facebook', 'x', 'bluesky'] as const;

/** Platforms whose follower count the app can sync itself (direct grants on the default brand). */
export const SYNCED_FOLLOWER_PLATFORMS = new Set(['instagram', 'youtube']);

export interface KitPlatformConfig {
  platform: string;
  visible: boolean;
  show_followers: boolean;
  show_growth: boolean;
  show_engagement: boolean;
  show_avg_views: boolean;
  followers_override: number | null;
  followers_override_at: string | null;
  /** All-time post count, for platforms the app cannot ask. */
  posts_override: number | null;
}

export type ContactMode = 'form' | 'email' | 'link';

export interface MediaKitRow {
  id: string;
  user_id: string;
  brand_id: string;
  slug: string;
  is_published: boolean;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  avatar_url: string | null;
  location: string | null;
  website: string | null;
  platforms: KitPlatformConfig[];
  show_top_posts: boolean;
  top_posts_limit: number;
  contact_mode: ContactMode;
  contact_email: string | null;
  contact_url: string | null;
  contact_label: string;
  stale_after_days: number;
  view_count: number;
  updated_at: string;
}

export interface MediaKitRateRow {
  id?: string;
  label: string;
  description: string | null;
  price_cents: number | null;
  price_prefix: string | null;
  currency: string;
  platform: string | null;
  sort_order: number;
  is_visible: boolean;
}

export interface MediaKitLeadRow {
  id: string;
  brand_name: string | null;
  contact_name: string | null;
  contact_email: string;
  budget_tier: string | null;
  message: string | null;
  status: 'new' | 'read' | 'converted' | 'spam';
  converted_prospect_id: string | null;
  created_at: string;
}

const KIT_SELECT =
  'id, user_id, brand_id, slug, is_published, display_name, headline, bio, avatar_url, location, website, ' +
  'platforms, show_top_posts, top_posts_limit, contact_mode, contact_email, contact_url, contact_label, ' +
  'stale_after_days, view_count, updated_at';

const RATE_SELECT = 'id, label, description, price_cents, price_prefix, currency, platform, sort_order, is_visible';

/** "Hey Cam!" → "hey-cam". Pads to the 3-char minimum so a short brand name still yields a valid slug. */
export function slugFromName(name: string): string {
  let s = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/, '');
  if (s.length < 3) s = (s + '-kit').slice(0, 32);
  return s;
}

function defaultConfig(platform: string): KitPlatformConfig {
  return {
    platform,
    visible: true,
    show_followers: true,
    show_growth: SYNCED_FOLLOWER_PLATFORMS.has(platform),
    show_engagement: true,
    show_avg_views: true,
    followers_override: null,
    followers_override_at: null,
    posts_override: null,
  };
}

/**
 * Stored configs first, in their stored order, then any connected platform
 * that has no config yet (visible by default), then the remaining known
 * platforms hidden. Unknown keys in stored JSON are dropped; missing keys
 * take the defaults, so an older row never breaks the editor.
 */
export function normalizeConfigs(raw: unknown, connectedPlatforms: string[]): KitPlatformConfig[] {
  const out: KitPlatformConfig[] = [];
  const seen = new Set<string>();
  const stored = Array.isArray(raw) ? (raw as Partial<KitPlatformConfig>[]) : [];
  for (const c of stored) {
    if (!c || typeof c.platform !== 'string' || seen.has(c.platform)) continue;
    const d = defaultConfig(c.platform);
    out.push({
      platform: c.platform,
      visible: c.visible ?? d.visible,
      show_followers: c.show_followers ?? d.show_followers,
      show_growth: c.show_growth ?? d.show_growth,
      show_engagement: c.show_engagement ?? d.show_engagement,
      show_avg_views: c.show_avg_views ?? d.show_avg_views,
      followers_override: typeof c.followers_override === 'number' ? c.followers_override : null,
      followers_override_at: typeof c.followers_override_at === 'string' ? c.followers_override_at : null,
      posts_override: typeof c.posts_override === 'number' ? c.posts_override : null,
    });
    seen.add(c.platform);
  }
  for (const p of connectedPlatforms) {
    if (seen.has(p)) continue;
    out.push(defaultConfig(p));
    seen.add(p);
  }
  for (const p of KIT_PLATFORMS) {
    if (seen.has(p)) continue;
    out.push({ ...defaultConfig(p), visible: false });
    seen.add(p);
  }
  return out;
}

/** "500" → 50000, "1,250.50" → 125050, "" → null. Money stays in integer cents. */
export function dollarsToCents(input: string): number | null {
  const s = input.replace(/[^0-9.]/g, '');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number | null): string {
  if (cents == null) return '';
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/**
 * The creator image: a logo for a brand like Gibsunday, a headshot for a
 * personal one. Goes to the public `media` bucket under the user's folder,
 * same as the media library, and the returned URL is what the kit stores.
 */
export async function uploadKitAvatar(userId: string, brandId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Keep the image under 5 MB.');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${userId}/kit/${brandId}-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage.from('media').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from('media').getPublicUrl(data.path).data.publicUrl;
}

export function kitUrl(slug: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/kit/${slug}`;
}

/** Postgres error → one sentence a creator can act on. */
export function friendlyKitError(err: { code?: string; message?: string } | null | undefined): string {
  if (!err) return 'Something went wrong.';
  if (err.code === '23505') {
    return err.message?.includes('one_per_brand')
      ? 'This brand already has a media kit.'
      : 'That link is already taken. Try another.';
  }
  if (err.code === '23514') return 'Links are 3 to 32 characters: letters, numbers, dashes or underscores.';
  return err.message || 'Something went wrong.';
}

function asKit(row: Record<string, unknown>): MediaKitRow {
  return { ...(row as unknown as MediaKitRow), platforms: normalizeConfigs(row.platforms, []) };
}

export async function loadKit(brandId: string): Promise<MediaKitRow | null> {
  const { data, error } = await supabase.from('media_kits').select(KIT_SELECT).eq('brand_id', brandId).maybeSingle();
  if (error) throw new Error(friendlyKitError(error));
  return data ? asKit(data as unknown as Record<string, unknown>) : null;
}

export async function createKit(
  userId: string,
  brand: { id: string; name: string },
  slug: string,
  platforms: KitPlatformConfig[],
): Promise<MediaKitRow> {
  const { data, error } = await supabase
    .from('media_kits')
    .insert({ user_id: userId, brand_id: brand.id, slug, display_name: brand.name, platforms })
    .select(KIT_SELECT)
    .single();
  if (error) throw new Error(friendlyKitError(error));
  return asKit(data as unknown as Record<string, unknown>);
}

export type KitPatch = Partial<
  Pick<
    MediaKitRow,
    | 'slug' | 'is_published' | 'display_name' | 'headline' | 'bio' | 'avatar_url' | 'location' | 'website'
    | 'platforms' | 'show_top_posts' | 'top_posts_limit' | 'contact_mode' | 'contact_email' | 'contact_url'
    | 'contact_label' | 'stale_after_days'
  >
>;

export async function saveKit(id: string, patch: KitPatch): Promise<MediaKitRow> {
  const { data, error } = await supabase.from('media_kits').update(patch).eq('id', id).select(KIT_SELECT).single();
  if (error) throw new Error(friendlyKitError(error));
  return asKit(data as unknown as Record<string, unknown>);
}

export async function listRates(kitId: string): Promise<MediaKitRateRow[]> {
  const { data, error } = await supabase
    .from('media_kit_rates')
    .select(RATE_SELECT)
    .eq('media_kit_id', kitId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(friendlyKitError(error));
  return (data ?? []) as MediaKitRateRow[];
}

/** Persist the whole rate card: upsert the rows in their current order, delete the removed ones. */
export async function saveRates(
  kit: { id: string; user_id: string; brand_id: string },
  rates: MediaKitRateRow[],
  deletedIds: string[],
): Promise<MediaKitRateRow[]> {
  if (deletedIds.length) {
    const { error } = await supabase.from('media_kit_rates').delete().in('id', deletedIds);
    if (error) throw new Error(friendlyKitError(error));
  }
  const rows = rates
    .filter((r) => r.label.trim())
    .map((r, i) => ({
      ...(r.id ? { id: r.id } : {}),
      media_kit_id: kit.id,
      user_id: kit.user_id,
      brand_id: kit.brand_id,
      label: r.label.trim(),
      description: r.description?.trim() || null,
      price_cents: r.price_cents,
      price_prefix: r.price_prefix || null,
      currency: r.currency || 'USD',
      platform: r.platform || null,
      sort_order: i,
      is_visible: r.is_visible,
    }));
  if (rows.length === 0) return [];
  const { data, error } = await supabase.from('media_kit_rates').upsert(rows, { onConflict: 'id' }).select(RATE_SELECT);
  if (error) throw new Error(friendlyKitError(error));
  return ((data ?? []) as MediaKitRateRow[]).sort((a, b) => a.sort_order - b.sort_order);
}

export async function listLeads(brandId: string): Promise<MediaKitLeadRow[]> {
  const { data, error } = await supabase
    .from('media_kit_leads')
    .select('id, brand_name, contact_name, contact_email, budget_tier, message, status, converted_prospect_id, created_at')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(friendlyKitError(error));
  return (data ?? []) as MediaKitLeadRow[];
}

export async function setLeadStatus(id: string, status: MediaKitLeadRow['status']): Promise<void> {
  const { error } = await supabase.from('media_kit_leads').update({ status }).eq('id', id);
  if (error) throw new Error(friendlyKitError(error));
}

/**
 * The deliberate click that moves an inbound lead into the CRM. The prospect
 * keeps brand_prospects' default status and is tagged so it is findable;
 * the lead is stamped with the prospect id so it cannot be converted twice.
 */
export async function convertLead(lead: MediaKitLeadRow, ctx: { userId: string; brandId: string }): Promise<string> {
  const { data, error } = await supabase
    .from('brand_prospects')
    .insert({
      user_id: ctx.userId,
      brand_id: ctx.brandId,
      brand_name: lead.brand_name?.trim() || lead.contact_email,
      contact_name: lead.contact_name,
      contact_email: lead.contact_email,
      budget_tier: lead.budget_tier,
      notes: lead.message,
      tags: ['inbound', 'media-kit'],
    })
    .select('id')
    .single();
  if (error) throw new Error(friendlyKitError(error));
  const prospectId = (data as { id: string }).id;
  const { error: leadErr } = await supabase
    .from('media_kit_leads')
    .update({ status: 'converted', converted_prospect_id: prospectId })
    .eq('id', lead.id);
  if (leadErr) throw new Error(friendlyKitError(leadErr));
  return prospectId;
}
