import { describe, it, expect } from 'vitest';
import { assessTokenHealth, DIRECT_GRANTS } from './tokenHealth';

const NOW = Date.parse('2026-09-06T12:00:00Z');
const day = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();

describe('token health', () => {
  it('never mentions TikTok: nothing uses its direct grant any more', () => {
    expect(DIRECT_GRANTS.map((g) => g.platform)).not.toContain('tiktok');
  });

  it('flags a dead Threads token as a notice about comments only, not posting', () => {
    const [threads] = assessTokenHealth(
      { threads_connected: true, threads_token_expires_at: iso(NOW - 16 * day) },
      NOW,
    );
    expect(threads.platform).toBe('threads');
    expect(threads.status).toBe('expired');
    expect(threads.severity).toBe('notice');
    expect(threads.impact).toMatch(/comments/i);
    expect(threads.impact).toMatch(/posting and metrics are unaffected/i);
    expect(threads.impact).not.toMatch(/keep posting/i);
  });

  it('warns for Instagram within 24h of expiry and says what stops', () => {
    const [ig] = assessTokenHealth({ instagram_connected: true, instagram_token_expires_at: iso(NOW + 6 * 3600_000) }, NOW);
    expect(ig).toMatchObject({ platform: 'instagram', status: 'expired', severity: 'warning' });
    expect(ig.impact).toMatch(/follower counts/i);
  });

  it('judges YouTube by the refresh token, never by the 1h access-token expiry', () => {
    const [yt] = assessTokenHealth({ youtube_connected: true, youtube_token_expires_at: iso(NOW - 2 * day) }, NOW);
    expect(yt.status).toBe('connected');
  });

  it('leaves out platforms that were never connected', () => {
    expect(assessTokenHealth({ instagram_connected: false, threads_connected: null }, NOW)).toEqual([]);
    expect(assessTokenHealth(null, NOW)).toEqual([]);
  });

  it('treats a healthy token as connected', () => {
    const [ig] = assessTokenHealth({ instagram_connected: true, instagram_token_expires_at: iso(NOW + 40 * day) }, NOW);
    expect(ig.status).toBe('connected');
  });
});
