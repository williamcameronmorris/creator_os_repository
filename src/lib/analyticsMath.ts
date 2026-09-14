/**
 * Pure math behind the Analytics page. Kept out of the component so every
 * rule here can be unit-tested and read on its own.
 *
 * Dates are UTC calendar days throughout. platform_metrics.date and
 * engagement_daily.date are the UTC date the sync wrote, so a range built
 * from local midnights drifted by a day for anyone east or west of Greenwich
 * and by an hour across a DST change. Every Date in a range is UTC midnight;
 * every comparison is on the ISO date string.
 */

export interface DateRange {
  start: Date;
  end: Date;
}

export const DAY_MS = 86_400_000;

/** YYYY-MM-DD of a Date's UTC calendar day. */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** UTC midnight of the calendar day the instant falls on, in UTC. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUtcDays(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/** Parse a date input's value (YYYY-MM-DD) as UTC midnight. */
export function parseInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

/** Whole UTC days in a range, inclusive of both ends. */
export function rangeDays(range: DateRange): number {
  return Math.round((startOfUtcDay(range.end).getTime() - startOfUtcDay(range.start).getTime()) / DAY_MS) + 1;
}

/** The last N UTC days ending today (UTC), today included. */
export function presetRange(preset: 'last_7d' | 'last_30d' | 'last_90d', now: Date = new Date()): DateRange {
  const days = preset === 'last_7d' ? 7 : preset === 'last_30d' ? 30 : 90;
  const end = startOfUtcDay(now);
  return { start: addUtcDays(end, -(days - 1)), end };
}

/**
 * The same number of whole days immediately before the range. Counted in
 * days rather than milliseconds so a 30-day window spanning a DST change
 * lands on the same calendar boundary in both periods.
 */
export function previousPeriod(range: DateRange): DateRange {
  const days = rangeDays(range);
  const end = addUtcDays(startOfUtcDay(range.start), -1);
  return { start: addUtcDays(end, -(days - 1)), end };
}

/** The day after the range end, as an ISO date: use with a `<` bound so the
 *  last day's posts are included instead of cut at its midnight. */
export function exclusiveEndIso(range: DateRange): string {
  return isoDate(addUtcDays(startOfUtcDay(range.end), 1));
}

export function inRange(iso: string, range: DateRange): boolean {
  const d = iso.slice(0, 10);
  return d >= isoDate(range.start) && d <= isoDate(range.end);
}

// ── Followers ──────────────────────────────────────────────────────────────

export interface FollowerRow {
  date: string;
  platform: string;
  followers_count: number | null;
}

/**
 * Newest count per platform on or before `endIso` that is actually a count.
 * A day's row can exist at 0 before the follower sync fills it, and 0 is an
 * absence, not a reading. Same rule the public media kit uses.
 */
export function latestFollowersByPlatform<T extends FollowerRow>(rows: T[], endIso?: string): Map<string, number> {
  const out = new Map<string, { date: string; count: number }>();
  for (const r of rows) {
    const count = Number(r.followers_count) || 0;
    if (count <= 0) continue;
    const d = r.date.slice(0, 10);
    if (endIso && d > endIso) continue;
    const cur = out.get(r.platform);
    if (!cur || d > cur.date) out.set(r.platform, { date: d, count });
  }
  return new Map(Array.from(out.entries()).map(([p, v]) => [p, v.count]));
}

export function sumFollowers<T extends FollowerRow>(rows: T[], endIso?: string): number {
  let total = 0;
  for (const n of latestFollowersByPlatform(rows, endIso).values()) total += n;
  return total;
}

/**
 * Net change across one platform's rows (any order): last real reading minus
 * first real reading. Never clamped, so a losing week reads as a loss. Zero
 * when there are fewer than two readings, because one number is not a trend.
 */
export function followerDelta<T extends FollowerRow>(rows: T[]): number {
  const real = rows
    .filter((r) => (Number(r.followers_count) || 0) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (real.length < 2) return 0;
  return Number(real[real.length - 1].followers_count) - Number(real[0].followers_count);
}

// ── Engagement ─────────────────────────────────────────────────────────────

export interface EngagementDay {
  date: string;
  platform: string;
  engagements: number;
  views: number;
}

export function sumEngagement(rows: EngagementDay[]): { engagements: number; views: number } {
  let engagements = 0;
  let views = 0;
  for (const r of rows) {
    engagements += Number(r.engagements) || 0;
    views += Number(r.views) || 0;
  }
  return { engagements, views };
}

/** Engagements per day summed across platforms, oldest first. */
export function engagementByDay(rows: EngagementDay[]): { date: string; engagements: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const d = r.date.slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + (Number(r.engagements) || 0));
  }
  return Array.from(byDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, engagements]) => ({ date, engagements }));
}

/**
 * Interactions over reach, as a percent. Null when there is no reach to
 * divide by: a rate of 0.00% stated as fact is how Hey Cam's page read for a
 * month, and null renders as N/A instead.
 */
export function engagementRate(interactions: number, reach: number): number | null {
  if (!(reach > 0)) return null;
  return (interactions / reach) * 100;
}
