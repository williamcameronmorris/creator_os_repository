import { describe, it, expect } from 'vitest';
import { suggestedTimeToLocalInput } from './suggestedTimes';

// Monday 2026-09-14 03:00 UTC: Sunday 20:00 in Los Angeles, Monday 13:00 in Tokyo.
const NOW = new Date('2026-09-14T03:00:00Z');
const MON_11 = { day: 'mon' as const, hour: 11, score: 1 };

describe('suggestedTimeToLocalInput', () => {
  it('builds the chip value on the profile timezone clock, not the browser clock', () => {
    // Still Sunday evening in LA: Monday 11:00 is tomorrow.
    expect(suggestedTimeToLocalInput(MON_11, 'America/Los_Angeles', NOW)).toBe('2026-09-14T11:00');
    // Monday afternoon in Tokyo: 11:00 has passed, so next Monday.
    expect(suggestedTimeToLocalInput(MON_11, 'Asia/Tokyo', NOW)).toBe('2026-09-21T11:00');
    // Monday small hours in UTC: later today.
    expect(suggestedTimeToLocalInput(MON_11, 'UTC', NOW)).toBe('2026-09-14T11:00');
  });

  it('wraps to next week for a day that already passed', () => {
    expect(suggestedTimeToLocalInput({ day: 'sat', hour: 9, score: 1 }, 'UTC', NOW)).toBe('2026-09-19T09:00');
    expect(suggestedTimeToLocalInput({ day: 'sun', hour: 10, score: 1 }, 'UTC', NOW)).toBe('2026-09-20T10:00');
  });
});
