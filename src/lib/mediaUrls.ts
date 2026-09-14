import { supabase } from './supabase';

/**
 * Media bucket references.
 *
 * The `media` bucket is private: every object lives under the uploader's user
 * id and only the owner can read it. Nothing in the app should hand a raw
 * bucket URL to an <img>, a <video>, a download link or a publisher. This
 * module is the one place that turns a stored reference into something
 * fetchable.
 *
 * What gets STORED (media_library.file_url, content_posts.media_urls,
 * content_workflow_stages.creation_notes.media_url) is the reference
 * `mediaRef(path)` returns: the bucket's object URL,
 * `<supabase url>/storage/v1/object/public/media/<user id>/<file>`. That is
 * the same form every row written before the bucket went private holds, so
 * old and new rows resolve the same way, the content_posts_unified view can
 * still tell our uploads from a platform CDN, and edge functions need no
 * migration of stored data. A bare bucket path (`<user id>/<file>`) resolves
 * too. URLs that are not ours (Post for Me's CDN, a platform thumbnail) pass
 * through untouched.
 *
 * Two lifetimes:
 *   DISPLAY_TTL  one hour, for anything the signed-in owner looks at.
 *   PUBLISH_TTL  24 hours, for a URL handed to Post for Me or a platform,
 *                which fetches it on its own schedule.
 *
 * The server-side twin is supabase/functions/_shared/media.ts.
 */

export const MEDIA_BUCKET = 'media';
export const DISPLAY_TTL = 60 * 60;
export const PUBLISH_TTL = 24 * 60 * 60;

// `/storage/v1/object/public/media/<path>` (the stored form) and
// `/storage/v1/object/sign/media/<path>?token=…` (an already signed URL that
// found its way back into a row) both carry the path after the bucket name.
const BUCKET_URL_RE = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/media\/([^?#]+)/;

// A bare path always starts with the uploader's user id (a uuid), because the
// bucket's insert policy requires it.
const BARE_PATH_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/.+/i;

/** The reference to store for a freshly uploaded object at `path`. */
export function mediaRef(path: string): string {
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * The bucket path behind a stored reference, or null when the value is not a
 * media-bucket reference (a Post for Me CDN URL, a data: URL, an empty string).
 */
export function mediaPathFromRef(ref: string | null | undefined): string | null {
  if (!ref) return null;
  const m = ref.match(BUCKET_URL_RE);
  if (m) return decodeURIComponent(m[1]);
  if (BARE_PATH_RE.test(ref)) return ref;
  return null;
}

/** True when the reference points into our media bucket. */
export function isMediaRef(ref: string | null | undefined): boolean {
  return mediaPathFromRef(ref) !== null;
}

/**
 * Sign a batch of references at once. Bucket references come back as signed
 * URLs in the same order; anything else comes back unchanged. A signing
 * failure leaves the reference as-is rather than throwing, so one bad row
 * never blanks a whole list.
 */
export async function signMediaUrls(
  refs: readonly (string | null | undefined)[],
  expiresIn: number = DISPLAY_TTL,
): Promise<string[]> {
  const out = refs.map((r) => r ?? '');
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
  if (error || !data) {
    console.warn('[mediaUrls] could not sign', error?.message);
    return out;
  }
  data.forEach((row, j) => {
    if (row?.signedUrl) out[slots[j]] = row.signedUrl;
  });
  return out;
}

/** Sign one reference. Non-bucket references come back unchanged. */
export async function signMediaUrl(
  ref: string | null | undefined,
  expiresIn: number = DISPLAY_TTL,
): Promise<string> {
  const [url] = await signMediaUrls([ref], expiresIn);
  return url;
}
