/**
 * Rules shared by the two Post for Me flows (Write a post, Drop a video) and
 * the Media library. Pure functions live here so the flows agree and the
 * rules are unit-tested once.
 */
import { supabase } from './supabase';

/** The `media` storage bucket rejects anything larger than this
 *  (migration 20251229043321_configure_storage_buckets.sql). */
export const MAX_UPLOAD_MB = 50;
export const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

/** Null when the file fits; otherwise the message to show at pick time. */
export function fileTooLargeMessage(file: { name: string; size: number }): string | null {
  if (file.size <= MAX_UPLOAD_BYTES) return null;
  const mb = (file.size / (1024 * 1024)).toFixed(1);
  return `${file.name} is ${mb} MB. The limit is ${MAX_UPLOAD_MB} MB.`;
}

/** YouTube's title limit. The caption is the description, not the title. */
export const YOUTUBE_TITLE_LIMIT = 100;

/** Anything up to three minutes publishes as a Short; longer is a video.
 *  Unknown duration (metadata unreadable) keeps the historical default. */
export const YOUTUBE_SHORT_MAX_SECONDS = 180;

export function youtubeContentType(durationSeconds: number | null | undefined): 'short' | 'video' {
  if (durationSeconds == null || !Number.isFinite(durationSeconds)) return 'short';
  return durationSeconds <= YOUTUBE_SHORT_MAX_SECONDS ? 'short' : 'video';
}

/** Read a video file's duration from its metadata. Resolves null when the
 *  browser cannot decode it, so the caller falls back to the default. */
export function readVideoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined' || !file.type.startsWith('video')) {
      resolve(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/** Same lead time the old composer enforced. */
export const MIN_SCHEDULE_LEAD_MINUTES = 20;

/** Null when the time is far enough out; otherwise the message to show. */
export function scheduleLeadTimeMessage(scheduledUtcIso: string, now: number = Date.now()): string | null {
  const at = Date.parse(scheduledUtcIso);
  if (Number.isNaN(at)) return 'Pick a date and time to schedule.';
  if (at < now + MIN_SCHEDULE_LEAD_MINUTES * 60_000) {
    return `Pick a time at least ${MIN_SCHEDULE_LEAD_MINUTES} minutes from now.`;
  }
  return null;
}

/** Free plan: this many scheduled posts per brand at a time. */
export const FREE_PLAN_SCHEDULE_LIMIT = 5;

/** Null when the plan allows `adding` more scheduled posts on top of
 *  `scheduledCount`; otherwise the message to show. */
export function scheduleCapMessage(scheduledCount: number, adding: number, isPremium: boolean): string | null {
  if (isPremium) return null;
  if (scheduledCount + adding <= FREE_PLAN_SCHEDULE_LIMIT) return null;
  return `The free plan allows ${FREE_PLAN_SCHEDULE_LIMIT} scheduled posts at a time. You have ${scheduledCount}. Upgrade to schedule more.`;
}

/** How many posts this brand already has waiting to publish. */
export async function countScheduledPosts(userId: string, brandId: string): Promise<number> {
  const { count, error } = await supabase
    .from('content_posts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('brand_id', brandId)
    .eq('status', 'scheduled');
  if (error) throw new Error(`Could not count scheduled posts: ${error.message}`);
  return count ?? 0;
}
