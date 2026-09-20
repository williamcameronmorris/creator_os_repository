import * as tus from 'tus-js-client';
import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/**
 * Supabase's resumable endpoint accepts exactly 6 MB chunks and rejects any
 * other value. Not a tuning knob.
 */
const CHUNK_SIZE = 6 * 1024 * 1024;

/** djb2, base36. Only needs to be stable and collision-resistant enough. */
function hashKey(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Stable object path for a file.
 *
 * tus-js-client fingerprints a file by name/size/lastModified, so a resumed
 * upload keeps writing to whatever objectName the ORIGINAL attempt created. If
 * the path were random per attempt (as it used to be, off Date.now()) a resume
 * would finish writing to the old path while the caller got handed a new one,
 * and the post would reference an object that was never completed. Deriving the
 * path from the same facts tus fingerprints on keeps the two in step.
 */
export function storagePathFor(userId: string, file: File): string {
  // lastIndexOf, not split().pop(): a name with no dot pops the whole name back
  // and would become the "extension". dot > 0 also leaves dotfiles alone.
  const dot = file.name.lastIndexOf('.');
  const raw = dot > 0 ? file.name.slice(dot + 1) : '';
  const ext = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'bin';
  return `${userId}/${hashKey(`${file.name}|${file.size}|${file.lastModified}`)}.${ext}`;
}

export interface ResumableUploadOptions {
  bucket?: string;
  /** Progress as a 0..1 fraction of this file. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

function uploadErrorMessage(err: Error, file: File): string {
  const status = (err as { originalResponse?: { getStatus(): number } }).originalResponse?.getStatus();
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  if (status === 413) return `${file.name} is ${mb} MB, which is over the storage limit.`;
  if (status === 415) return `${file.name} is a file type storage will not accept.`;
  if (status === 401 || status === 403) return 'Your session expired. Sign in again to upload.';
  return `Upload failed for ${file.name}. ${err.message}`;
}

/**
 * Upload one file to Storage over TUS and resolve with its object path.
 *
 * Replaces `supabase.storage.upload()`, which sends the whole file as a single
 * POST through the shared client — and that client carries a 30 second fetch
 * timeout (see src/lib/supabase.ts), so any upload slower than half a minute
 * was aborted mid-flight with nothing to resume from. That is most videos on
 * cell service. TUS sends 6 MB chunks over XHR, so it never touches that
 * timeout, retries a dropped chunk on its own, and can pick a half-finished
 * upload back up after a reload.
 */
export async function uploadResumable(
  file: File,
  path: string,
  { bucket = 'media', onProgress, signal }: ResumableUploadOptions = {},
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Your session expired. Sign in again to upload.');

  return new Promise<string>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Upload cancelled', 'AbortError'));
      return;
    }

    const upload = new tus.Upload(file, {
      endpoint: `${SUPABASE_URL}/storage/v1/upload/resumable`,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      headers: {
        authorization: `Bearer ${accessToken}`,
        // Resuming or retrying re-writes the same object path, so upsert has to
        // be on or the second attempt 409s against its own partial.
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: CHUNK_SIZE,
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onProgress: (sent, total) => onProgress?.(total > 0 ? sent / total : 0),
      onError: (err) => {
        cleanup();
        reject(new Error(uploadErrorMessage(err, file)));
      },
      onSuccess: () => {
        cleanup();
        resolve(path);
      },
    });

    const onAbort = () => {
      upload.abort();
      cleanup();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    signal?.addEventListener('abort', onAbort);

    // Pick up where an earlier attempt at this same file left off, if the
    // browser still remembers one.
    upload
      .findPreviousUploads()
      .then((previous) => {
        if (previous.length > 0) upload.resumeFromPreviousUpload(previous[0]);
      })
      .catch(() => { /* no resume available; start clean */ })
      .then(() => upload.start());
  });
}
