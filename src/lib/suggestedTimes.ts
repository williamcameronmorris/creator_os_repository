/**
 * Suggested posting times — industry defaults + personal cache lookup.
 *
 * Tries to read from suggested_times_cache (populated weekly by the
 * compute-suggested-times cron once a user has 10+ posts on a platform).
 * Falls back to industry defaults sourced from public engagement-time research.
 *
 * Sources for defaults:
 *   - Sprout Social "Best Times to Post" 2026 report
 *   - Hootsuite social media benchmarks
 *   - Buffer engagement data analysis
 *
 * Times are stored in 24h local time (interpreted in user's timezone client-side).
 */
import { supabase } from './supabase';

export interface SuggestedTime {
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  hour: number;     // 0-23
  score: number;    // 0-1, relative ranking within the platform
}

export interface SuggestedTimesResult {
  times: SuggestedTime[];
  source: 'industry_default' | 'personal';
  computedAt: string | null;
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Industry defaults per platform. Top 3 highest-engagement windows.
 * Used as fallback when a user has fewer than 10 posts on a platform.
 */
export const INDUSTRY_DEFAULT_TIMES: Record<string, SuggestedTime[]> = {
  instagram: [
    { day: 'tue', hour: 11, score: 1.0 },
    { day: 'wed', hour: 13, score: 0.92 },
    { day: 'fri', hour: 12, score: 0.85 },
  ],
  tiktok: [
    { day: 'tue', hour: 18, score: 1.0 },
    { day: 'thu', hour: 19, score: 0.94 },
    { day: 'fri', hour: 21, score: 0.88 },
  ],
  facebook: [
    { day: 'wed', hour: 9, score: 1.0 },
    { day: 'thu', hour: 13, score: 0.93 },
    { day: 'fri', hour: 10, score: 0.86 },
  ],
  youtube: [
    { day: 'sat', hour: 9, score: 1.0 },
    { day: 'sun', hour: 10, score: 0.95 },
    { day: 'thu', hour: 15, score: 0.82 },
  ],
  twitter: [
    { day: 'tue', hour: 9, score: 1.0 },
    { day: 'wed', hour: 12, score: 0.91 },
    { day: 'thu', hour: 17, score: 0.86 },
  ],
  threads: [
    { day: 'tue', hour: 12, score: 1.0 },
    { day: 'wed', hour: 19, score: 0.90 },
    { day: 'thu', hour: 13, score: 0.84 },
  ],
  linkedin: [
    { day: 'tue', hour: 9, score: 1.0 },
    { day: 'wed', hour: 8, score: 0.95 },
    { day: 'thu', hour: 10, score: 0.89 },
  ],
};

/**
 * Returns suggested posting times for a user + platform.
 * Reads personal cache first, falls back to industry defaults.
 */
export async function getSuggestedTimes(
  userId: string,
  platform: string
): Promise<SuggestedTimesResult> {
  try {
    const { data } = await supabase
      .from('suggested_times_cache')
      .select('best_times, source, computed_at')
      .eq('user_id', userId)
      .eq('platform', platform)
      .maybeSingle();

    if (data?.best_times && Array.isArray(data.best_times) && data.best_times.length > 0) {
      return {
        times: data.best_times.slice(0, 3),
        source: data.source === 'personal' ? 'personal' : 'industry_default',
        computedAt: data.computed_at,
      };
    }
  } catch {
    // Fall through to defaults
  }

  return {
    times: INDUSTRY_DEFAULT_TIMES[platform] || [],
    source: 'industry_default',
    computedAt: null,
  };
}

/**
 * Converts a SuggestedTime to the next future Date matching that day-of-week + hour.
 * Useful for autofilling a date/time picker when the user clicks a chip.
 */
export function suggestedTimeToDate(time: SuggestedTime, fromDate = new Date()): Date {
  const targetDayIdx = DAYS.indexOf(time.day);
  const result = new Date(fromDate);
  const currentDayIdx = result.getDay();
  let daysAhead = targetDayIdx - currentDayIdx;
  if (daysAhead < 0) daysAhead += 7;
  // If it's the same day but the hour has already passed, push to next week
  if (daysAhead === 0 && result.getHours() >= time.hour) daysAhead = 7;
  result.setDate(result.getDate() + daysAhead);
  result.setHours(time.hour, 0, 0, 0);
  return result;
}

/**
 * Formats a SuggestedTime as a short label, e.g. "TUE 11:00 AM"
 */
export function formatSuggestedTime(time: SuggestedTime): string {
  const day = time.day.toUpperCase();
  const hour12 = time.hour === 0 ? 12 : time.hour > 12 ? time.hour - 12 : time.hour;
  const ampm = time.hour < 12 ? 'AM' : 'PM';
  return `${day} ${String(hour12).padStart(2, '0')}:00 ${ampm}`;
}
