import { describe, it, expect } from 'vitest';
import { diagnose, hasProblems, foldDataHealthRows, type DataHealth, type PlatformHealth } from './dataHealth';

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();
const ahead = (d: number) => new Date(Date.now() + d * DAY).toISOString();

/** A fully healthy account; each test spoils exactly one thing. */
function healthy(over: Partial<DataHealth> = {}): DataHealth {
  return {
    user_id: 'u1',
    brand_id: 'b1',
    last_instagram_sync: ago(0),
    last_youtube_sync: ago(0),
    last_facebook_sync: ago(0),
    last_threads_sync: ago(0),
    meta_token_expires_at: ahead(60),
    youtube_token_expires_at: ahead(60),
    threads_token_expires_at: ahead(60),
    has_meta_token: true,
    has_youtube_refresh: true,
    has_threads_token: true,
    accounts_connected: 5,
    newest_snapshot_at: ago(0),
    total_posts: 546,
    newest_post_at: ago(3),
    platforms_with_posts: 5,
    newest_metric_date: ago(0),
    platforms_with_metrics: 5,
    scored_posts: 313,
    posts_with_verdict: 247,
    ...over,
  };
}

const ids = (fs: ReturnType<typeof diagnose>) => fs.map((f) => f.id);

describe('diagnose', () => {
  it('reports healthy when nothing is wrong', () => {
    const f = diagnose(healthy(), { postsInWindow: 12 });
    expect(ids(f)).toEqual(['healthy']);
    expect(hasProblems(f)).toBe(false);
  });

  it('returns nothing when health is unavailable', () => {
    expect(diagnose(null)).toEqual([]);
  });

  it('short-circuits to "nothing connected" and says nothing else', () => {
    // Someone with no account does not also need to hear their date range is
    // empty; piling both on is how you get neither read.
    const f = diagnose(healthy({ accounts_connected: 0, total_posts: 0 }), {
      postsInWindow: 0,
    });
    expect(ids(f)).toEqual(['no-connections']);
  });

  it('reports an expired YouTube token as blocked', () => {
    const f = diagnose(healthy({ youtube_token_expires_at: ago(30) }), { postsInWindow: 5 });
    expect(ids(f)).toContain('youtube-token-expired');
    expect(f.find((x) => x.id === 'youtube-token-expired')!.severity).toBe('blocked');
  });

  it('puts the token cause above the stale-sync symptom', () => {
    // An expired token is WHY the sync is stale. Leading with the symptom
    // sends people looking in the wrong place.
    const f = diagnose(
      healthy({ youtube_token_expires_at: ago(30), newest_metric_date: ago(10) }),
      { postsInWindow: 5 }
    );
    expect(ids(f).indexOf('youtube-token-expired')).toBeLessThan(ids(f).indexOf('metrics-stale'));
  });

  it('warns before the Meta token expires, not only after', () => {
    const f = diagnose(healthy({ meta_token_expires_at: ahead(3) }), { postsInWindow: 5 });
    expect(ids(f)).toContain('meta-token-expiring');
  });

  it('separates an empty window from an empty account', () => {
    // The exact case the old empty state got wrong: 546 posts, none in range.
    const f = diagnose(healthy(), { postsInWindow: 0, windowLabel: 'the last 30 days' });
    const w = f.find((x) => x.id === 'window-empty')!;
    expect(w).toBeDefined();
    expect(w.title).toContain('the last 30 days');
    expect(w.detail).toContain('546');
    expect(ids(f)).not.toContain('no-connections');
  });

  it('does not cry about an empty window when the window has posts', () => {
    expect(ids(diagnose(healthy(), { postsInWindow: 9 }))).not.toContain('window-empty');
  });

  it('flags a stale Post for Me sync', () => {
    const f = diagnose(healthy({ newest_snapshot_at: ago(5) }), { postsInWindow: 5 });
    expect(ids(f)).toContain('postforme-stale');
  });

  it('explains missing verdicts as insufficient history', () => {
    const f = diagnose(healthy({ posts_with_verdict: 0 }), { postsInWindow: 5 });
    expect(ids(f)).toContain('no-baseline');
  });

  it('gives blocked findings an action to take', () => {
    const f = diagnose(healthy({ youtube_token_expires_at: ago(1) }), { postsInWindow: 5 });
    expect(f.find((x) => x.id === 'youtube-token-expired')!.action?.to).toBe('/office/connections');
  });
});

function plat(over: Partial<PlatformHealth> & { platform: string }): PlatformHealth {
  return {
    accounts_connected: 1,
    newest_snapshot_at: ago(0),
    total_posts: 100,
    newest_post_at: ago(3),
    newest_metric_date: ago(0),
    posts_with_metrics_7d: 20,
    ...over,
  };
}

describe('diagnose per platform', () => {
  const ids = (f: ReturnType<typeof diagnose>) => f.map((x) => x.id);

  it('flags the platform whose metrics stopped and says since when', () => {
    const f = diagnose(
      healthy({ platforms: [plat({ platform: 'facebook' }), plat({ platform: 'instagram', newest_metric_date: ago(10) })] }),
      { postsInWindow: 5 },
    );
    const ig = f.find((x) => x.id === 'metrics-stale-instagram');
    expect(ig).toBeDefined();
    expect(ig!.severity).toBe('blocked');
    expect(ig!.title).toMatch(/^Instagram metrics stale since /);
    expect(ig!.action?.to).toBe('/office/connections');
    expect(ids(f)).not.toContain('metrics-stale-facebook');
    expect(ids(f)).not.toContain('healthy');
  });

  it('a live platform never vouches for a dead one', () => {
    // The old brand-level max(date) across platforms said "Everything is syncing" here.
    const f = diagnose(
      healthy({ newest_metric_date: ago(0), platforms: [plat({ platform: 'youtube' }), plat({ platform: 'threads', newest_metric_date: null })] }),
      { postsInWindow: 5 },
    );
    expect(ids(f)).toContain('metrics-stale-threads');
    expect(hasProblems(f)).toBe(true);
  });

  it('orders the worst platform first and keeps a few-day lag a warning', () => {
    const f = diagnose(
      healthy({ platforms: [plat({ platform: 'tiktok', newest_metric_date: ago(4) }), plat({ platform: 'instagram', newest_metric_date: ago(12) })] }),
      { postsInWindow: 5 },
    );
    const stale = f.filter((x) => x.id.startsWith('metrics-stale-'));
    expect(stale.map((x) => x.id)).toEqual(['metrics-stale-instagram', 'metrics-stale-tiktok']);
    expect(stale[1].severity).toBe('warning');
  });

  it('ignores platforms with nothing on them', () => {
    const f = diagnose(
      healthy({ platforms: [plat({ platform: 'bluesky', total_posts: 0, accounts_connected: 0, newest_metric_date: null })] }),
      { postsInWindow: 5 },
    );
    expect(ids(f)).toEqual(['healthy']);
  });
});

describe('foldDataHealthRows', () => {
  it('folds one row per platform into a brand with a platforms list', () => {
    const base = { ...healthy(), platform: null, platform_accounts_connected: null, platform_newest_snapshot_at: null,
      platform_total_posts: null, platform_newest_post_at: null, platform_newest_metric_date: null, platform_posts_with_metrics_7d: null };
    const h = foldDataHealthRows([
      { ...base, platform: 'instagram', platform_total_posts: 200, platform_newest_metric_date: '2026-09-04', platform_accounts_connected: 1, platform_posts_with_metrics_7d: 0 },
      { ...base, platform: 'youtube', platform_total_posts: 50, platform_newest_metric_date: '2026-09-14', platform_accounts_connected: 1, platform_posts_with_metrics_7d: 12 },
    ]);
    expect(h?.brand_id).toBe('b1');
    expect(h?.platforms?.map((p) => p.platform)).toEqual(['instagram', 'youtube']);
    expect(h?.platforms?.[0].newest_metric_date).toBe('2026-09-04');
    expect('platform' in (h as object)).toBe(false);
    expect(foldDataHealthRows([])).toBeNull();
  });
});

