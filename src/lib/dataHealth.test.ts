import { describe, it, expect } from 'vitest';
import { diagnose, hasProblems, type DataHealth } from './dataHealth';

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
