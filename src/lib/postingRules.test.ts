import { describe, it, expect } from 'vitest';
import {
  fileTooLargeMessage,
  formatFileSize,
  MAX_UPLOAD_BYTES,
  youtubeContentType,
  scheduleLeadTimeMessage,
  scheduleCapMessage,
  FREE_PLAN_SCHEDULE_LIMIT,
} from './postingRules';

describe('file size guard', () => {
  it('lets a file at the bucket cap through', () => {
    expect(fileTooLargeMessage({ name: 'clip.mp4', size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it('names the file, its size and the limit when it is too big', () => {
    const msg = fileTooLargeMessage({ name: 'clip.mp4', size: 72.4 * 1024 * 1024 });
    expect(msg).toBe('clip.mp4 is 72.4 MB. The limit is 50 MB.');
  });
});

describe('formatFileSize', () => {
  it('uses one decimal under 10 MB and drops it above, so tiles stay short', () => {
    expect(formatFileSize(3.25 * 1024 * 1024)).toBe('3.3 MB');
    expect(formatFileSize(38.4 * 1024 * 1024)).toBe('38 MB');
    expect(formatFileSize(205 * 1024 * 1024)).toBe('205 MB');
  });

  it('drops to KB and B for small files rather than showing 0.0 MB', () => {
    expect(formatFileSize(200 * 1024)).toBe('200 KB');
    expect(formatFileSize(512)).toBe('512 B');
  });
});

describe('youtube content type', () => {
  it('is a Short up to three minutes and a video after', () => {
    expect(youtubeContentType(59)).toBe('short');
    expect(youtubeContentType(180)).toBe('short');
    expect(youtubeContentType(181)).toBe('video');
    expect(youtubeContentType(600)).toBe('video');
  });

  it('keeps the old default when the duration is unknown', () => {
    expect(youtubeContentType(null)).toBe('short');
    expect(youtubeContentType(undefined)).toBe('short');
    expect(youtubeContentType(NaN)).toBe('short');
  });
});

describe('schedule lead time', () => {
  const now = Date.parse('2026-09-14T12:00:00Z');

  it('rejects the past and anything under twenty minutes out', () => {
    expect(scheduleLeadTimeMessage('2026-09-14T11:00:00Z', now)).toMatch(/20 minutes/);
    expect(scheduleLeadTimeMessage('2026-09-14T12:19:00Z', now)).toMatch(/20 minutes/);
  });

  it('accepts twenty minutes out', () => {
    expect(scheduleLeadTimeMessage('2026-09-14T12:20:00Z', now)).toBeNull();
  });

  it('asks for a time when the value is not a date', () => {
    expect(scheduleLeadTimeMessage('', now)).toMatch(/pick a date/i);
  });
});

describe('free plan scheduling cap', () => {
  it('never limits a paid plan', () => {
    expect(scheduleCapMessage(40, 10, true)).toBeNull();
  });

  it('allows up to the limit and refuses past it', () => {
    expect(scheduleCapMessage(FREE_PLAN_SCHEDULE_LIMIT - 1, 1, false)).toBeNull();
    expect(scheduleCapMessage(FREE_PLAN_SCHEDULE_LIMIT, 1, false)).toMatch(/free plan/i);
    // Drop Zone adds one row per account, so a batch can cross the line at once.
    expect(scheduleCapMessage(3, 3, false)).toMatch(/free plan/i);
  });
});
