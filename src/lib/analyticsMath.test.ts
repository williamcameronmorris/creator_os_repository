import { describe, it, expect } from 'vitest';
import {
  presetRange,
  previousPeriod,
  exclusiveEndIso,
  isoDate,
  inRange,
  rangeDays,
  parseInputDate,
  latestFollowersByPlatform,
  sumFollowers,
  followerDelta,
  engagementRate,
  sumEngagement,
  engagementByDay,
} from './analyticsMath';

describe('date ranges', () => {
  it('builds the last 30 UTC days ending today, today included', () => {
    const now = new Date('2026-09-14T23:30:00-05:00'); // already Sep 15 in UTC
    const r = presetRange('last_30d', now);
    expect(isoDate(r.end)).toBe('2026-09-15');
    expect(isoDate(r.start)).toBe('2026-08-17');
    expect(rangeDays(r)).toBe(30);
  });

  it('puts the previous period immediately before, with the same day count', () => {
    const r = presetRange('last_7d', new Date('2026-09-14T12:00:00Z'));
    const p = previousPeriod(r);
    expect(isoDate(p.end)).toBe('2026-09-07');
    expect(isoDate(p.start)).toBe('2026-09-01');
    expect(rangeDays(p)).toBe(rangeDays(r));
  });

  it('keeps whole days across a DST change', () => {
    // US DST ended 2026-11-01; a 30-day window across it used to lose an hour.
    const r = { start: parseInputDate('2026-10-20'), end: parseInputDate('2026-11-18') };
    const p = previousPeriod(r);
    expect(rangeDays(r)).toBe(30);
    expect(isoDate(p.end)).toBe('2026-10-19');
    expect(isoDate(p.start)).toBe('2026-09-20');
    expect(rangeDays(p)).toBe(30);
  });

  it('exclusive end is the day after, so posts published on the last day count', () => {
    const r = { start: parseInputDate('2026-09-01'), end: parseInputDate('2026-09-14') };
    expect(exclusiveEndIso(r)).toBe('2026-09-15');
    expect(inRange('2026-09-14T22:15:00+00:00', r)).toBe(true);
    expect(inRange('2026-09-15', r)).toBe(false);
  });

  it('parses a date input as UTC midnight', () => {
    expect(parseInputDate('2026-03-08').toISOString()).toBe('2026-03-08T00:00:00.000Z');
  });
});

describe('followers', () => {
  const rows = [
    { date: '2026-09-12', platform: 'facebook', followers_count: 10_673 },
    { date: '2026-09-13', platform: 'facebook', followers_count: 10_680 },
    { date: '2026-09-14', platform: 'facebook', followers_count: 0 }, // born at 0 by the midnight sync
    { date: '2026-09-13', platform: 'youtube', followers_count: 6_610 },
    { date: '2026-09-14', platform: 'youtube', followers_count: 0 },
    { date: '2026-09-14', platform: 'threads', followers_count: 0 },
  ];

  it('takes the newest row with a real count per platform and skips zeros', () => {
    const m = latestFollowersByPlatform(rows);
    expect(m.get('facebook')).toBe(10_680);
    expect(m.get('youtube')).toBe(6_610);
    expect(m.has('threads')).toBe(false);
    expect(sumFollowers(rows)).toBe(17_290);
  });

  it('respects the end bound', () => {
    expect(latestFollowersByPlatform(rows, '2026-09-12').get('facebook')).toBe(10_673);
  });

  it('net change is last real reading minus first, and can be negative', () => {
    expect(followerDelta(rows.filter((r) => r.platform === 'facebook'))).toBe(7);
    expect(followerDelta([
      { date: '2026-09-01', platform: 'x', followers_count: 500 },
      { date: '2026-09-07', platform: 'x', followers_count: 480 },
      { date: '2026-09-08', platform: 'x', followers_count: 0 },
    ])).toBe(-20);
  });

  it('one reading is not a trend', () => {
    expect(followerDelta([{ date: '2026-09-01', platform: 'x', followers_count: 500 }])).toBe(0);
  });
});

describe('engagement', () => {
  it('rate is interactions over reach and null without reach', () => {
    expect(engagementRate(50, 1000)).toBeCloseTo(5);
    expect(engagementRate(50, 0)).toBeNull();
    expect(engagementRate(0, 0)).toBeNull();
  });

  it('sums the daily view rows and buckets them by day', () => {
    const rows = [
      { date: '2026-09-13', platform: 'instagram', engagements: 10, views: 400 },
      { date: '2026-09-13', platform: 'youtube', engagements: 5, views: 100 },
      { date: '2026-09-12', platform: 'instagram', engagements: 3, views: 50 },
    ];
    expect(sumEngagement(rows)).toEqual({ engagements: 18, views: 550 });
    expect(engagementByDay(rows)).toEqual([
      { date: '2026-09-12', engagements: 3 },
      { date: '2026-09-13', engagements: 15 },
    ]);
  });
});
