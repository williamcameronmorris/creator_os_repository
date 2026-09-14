import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/**
 * Media bucket references, server side.
 *
 * The `media` bucket is private. A row stores the bucket's object URL
 * (`…/storage/v1/object/public/media/<user id>/<file>`, the same form rows
 * held before the bucket went private) or a bare bucket path. Anything that
 * hands a file to a platform must sign it first; the platform fetches it on
 * its own schedule, so the link lives 24 hours. URLs that are not ours (Post
 * for Me's CDN, a platform thumbnail) pass through untouched. Mirrors
 * src/lib/mediaUrls.ts.
 */

export const MEDIA_BUCKET = "media";
export const PUBLISH_TTL = 24 * 60 * 60;

const BUCKET_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/media\/([^?#]+)/;
const BARE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/.+/i;

export function mediaPathFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(BUCKET_URL_RE);
  if (m) return decodeURIComponent(m[1]);
  if (BARE_PATH_RE.test(ref)) return ref;
  return null;
}

/**
 * Sign every bucket reference in `refs` with the service-role client. Order
 * is preserved; foreign URLs come back unchanged. Throws when signing fails,
 * because a publisher given an unsigned private URL would fail later with a
 * less useful error.
 */
export async function signMediaUrls(
  supabase: SupabaseClient,
  refs: readonly (string | null | undefined)[],
  expiresIn: number = PUBLISH_TTL,
): Promise<string[]> {
  const out = refs.map((r) => r ?? "");
  const paths: string[] = [];
  const slots: number[] = [];
  out.forEach((ref, i) => {
    const path = mediaPathFromRef(ref);
    if (path) {
      paths.push(path);
      slots.push(i);
    }
  });
  if (paths.length === 0) return out;

  const { data, error } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, expiresIn);
  if (error || !data) throw new Error(`Could not sign media URLs: ${error?.message ?? "no data"}`);
  data.forEach((row, j) => {
    if (row?.signedUrl) out[slots[j]] = row.signedUrl;
    else throw new Error(`Could not sign media URL for ${paths[j]}: ${row?.error ?? "unknown"}`);
  });
  return out;
}
