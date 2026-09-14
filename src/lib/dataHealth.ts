import { supabase } from './supabase';

/**
 * "Why is this empty?"
 *
 * On 2026-08-22 Instagram metrics had been dead for seven weeks and nothing in
 * the app said so. Analytics then rendered "Connect your accounts in Settings"
 * for accounts that were connected, syncing, and holding 546 posts — because
 * the only thing it checked was whether two date-filtered queries came back
 * empty. Every fact needed to explain both problems was already in the
 * database; nothing read it.
 *
 * `data_health` is the view that reads it. `diagnose()` turns that row into
 * ordered, plain-language findings. The rules live here rather than in SQL so
 * they can be unit-tested and the wording changed without a migration.
 */

export interface DataHealth {
  user_id: string;
  brand_id: string;
  last_instagram_sync: string | null;
  last_youtube_sync: string | null;
  last_facebook_sync: string | null;
  last_threads_sync: string | null;
  meta_token_expires_at: string | null;
  youtube_token_expires_at: string | null;
  threads_token_expires_at: string | null;
  has_meta_token: boolean;
  has_youtube_refresh: boolean;
  has_threads_token: boolean;
  accounts_connected: number | null;
  newest_snapshot_at: string | null;
  total_posts: number;
  newest_post_at: string | null;
  platforms_with_posts: number;
  newest_metric_date: string | null;
  platforms_with_metrics: number;
  scored_posts: number;
  posts_with_verdict: number;
  /** One entry per platform the brand posts on or has connected. Absent
   *  when the view predates per-platform rows. */
  platforms?: PlatformHealth[];
}

/** Sync health for one platform of one brand. */
export interface PlatformHealth {
  platform: string;
  accounts_connected: number | null;
  newest_snapshot_at: string | null;
  total_posts: number;
  newest_post_at: string | null;
  newest_metric_date: string | null;
  posts_with_metrics_7d: number;
}

export type Severity = 'blocked' | 'warning' | 'ok';

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  /** Where the creator can actually do something about it. */
  action?: { label: string; to: string };
}

const DAY = 86_400_000;

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / DAY);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
  bluesky: 'Bluesky',
};

function platformLabel(p: string): string {
  return PLATFORM_LABELS[p] ?? p;
}

type DataHealthRow = DataHealth & {
  platform: string | null;
  platform_accounts_connected: number | null;
  platform_newest_snapshot_at: string | null;
  platform_total_posts: number | null;
  platform_newest_post_at: string | null;
  platform_newest_metric_date: string | null;
  platform_posts_with_metrics_7d: number | null;
};

/**
 * The view returns one row per BRAND and PLATFORM, brand-level columns
 * repeated on each. Fold them into one DataHealth with a platforms list. A
 * brand-level max across platforms is what let a live platform hide a dead
 * one: Gibsunday's Instagram feed went dark for ten days while the panel
 * said everything was syncing.
 */
export function foldDataHealthRows(rows: DataHealthRow[]): DataHealth | null {
  if (rows.length === 0) return null;
  const {
    platform: _p, platform_accounts_connected: _a, platform_newest_snapshot_at: _s,
    platform_total_posts: _t, platform_newest_post_at: _n, platform_newest_metric_date: _m,
    platform_posts_with_metrics_7d: _w, ...brand
  } = rows[0];
  const platforms: PlatformHealth[] = rows
    .filter((r) => !!r.platform)
    .map((r) => ({
      platform: r.platform!,
      accounts_connected: r.platform_accounts_connected,
      newest_snapshot_at: r.platform_newest_snapshot_at,
      total_posts: r.platform_total_posts ?? 0,
      newest_post_at: r.platform_newest_post_at,
      newest_metric_date: r.platform_newest_metric_date,
      posts_with_metrics_7d: r.platform_posts_with_metrics_7d ?? 0,
    }));
  return { ...(brand as DataHealth), platforms };
}

/** Connections, syncs and coverage for one brand, per platform. */
export async function fetchDataHealth(brandId: string): Promise<DataHealth | null> {
  const { data, error } = await supabase
    .from('data_health')
    .select('*')
    .eq('brand_id', brandId);
  if (error) {
    console.warn('data_health query failed:', error.message);
    return null;
  }
  return foldDataHealthRows((data ?? []) as unknown as DataHealthRow[]);
}

export interface DiagnoseOptions {
  /** Posts the current screen found inside its selected date range. */
  postsInWindow?: number;
  /** Human label for that range, e.g. "the last 30 days". */
  windowLabel?: string;
}

/**
 * Ordered worst-first. The caller shows the first finding, or all of them.
 *
 * Order matters more than completeness: a creator whose account is
 * disconnected does not need to be told their date range is empty, and being
 * told both at once is how you end up reading neither.
 */
export function diagnose(h: DataHealth | null, opts: DiagnoseOptions = {}): Finding[] {
  if (!h) return [];
  const findings: Finding[] = [];

  // ── Nothing connected ────────────────────────────────────────────────────
  if (!h.accounts_connected && h.total_posts === 0) {
    findings.push({
      id: 'no-connections',
      severity: 'blocked',
      title: 'Nothing is connected yet',
      detail: 'Connect a social account and the first sync will pull in your posts and their metrics.',
      action: { label: 'Connect an account', to: '/office/connections' },
    });
    return findings;
  }

  // ── Tokens ───────────────────────────────────────────────────────────────
  // Checked before sync age, because an expired token is the CAUSE of a stale
  // sync and reporting the symptom first sends people looking in the wrong place.
  const ytExpiry = daysUntil(h.youtube_token_expires_at);
  if (h.has_youtube_refresh && ytExpiry !== null && ytExpiry < 0) {
    findings.push({
      id: 'youtube-token-expired',
      severity: 'blocked',
      title: `YouTube stopped syncing on ${fmtDate(h.youtube_token_expires_at!)}`,
      detail:
        'Google rejected the stored token. Publish the OAuth consent screen to Production first — while it is in Testing, Google expires tokens after 7 days and a reconnect breaks again within the week.',
      action: { label: 'Reconnect YouTube', to: '/office/connections' },
    });
  }

  const metaExpiry = daysUntil(h.meta_token_expires_at);
  if (h.has_meta_token && metaExpiry !== null && metaExpiry < 0) {
    findings.push({
      id: 'meta-token-expired',
      severity: 'blocked',
      title: 'Your Meta token has expired',
      detail: 'Instagram and Facebook follower counts stop updating until it is renewed.',
      action: { label: 'Reconnect', to: '/office/connections' },
    });
  } else if (h.has_meta_token && metaExpiry !== null && metaExpiry <= 7) {
    findings.push({
      id: 'meta-token-expiring',
      severity: 'warning',
      title: `Meta token expires in ${metaExpiry} day${metaExpiry === 1 ? '' : 's'}`,
      detail: 'The nightly refresh should renew it automatically. Worth checking back tomorrow.',
    });
  }

  // ── Sync freshness ───────────────────────────────────────────────────────
  const snapshotAge = daysSince(h.newest_snapshot_at);
  if (h.accounts_connected && snapshotAge !== null && snapshotAge > 1) {
    findings.push({
      id: 'postforme-stale',
      severity: 'warning',
      title: `Post metrics last updated ${snapshotAge} days ago`,
      detail: 'Metrics normally refresh every six hours, so something is interrupting the sync.',
    });
  }

  // Per platform, worst first. One platform's fresh metrics never vouch for
  // another's: the page hides a platform whose metrics are over a week old
  // (post_performance's freshness gate), so say which one and since when
  // instead of letting its rows vanish.
  const platforms = (h.platforms ?? []).filter(
    (p) => p.total_posts > 0 || (p.accounts_connected ?? 0) > 0
  );
  if (platforms.length > 0) {
    const stale = platforms
      .map((p) => ({ p, age: daysSince(p.newest_metric_date) }))
      .filter(({ age }) => age === null || age > 2)
      .sort((a, b) => (b.age ?? Infinity) - (a.age ?? Infinity));
    for (const { p, age } of stale) {
      const name = platformLabel(p.platform);
      const dead = age === null || age > 7;
      findings.push({
        id: `metrics-stale-${p.platform}`,
        severity: dead ? 'blocked' : 'warning',
        title: age === null
          ? `No ${name} metrics yet`
          : `${name} metrics stale since ${fmtDate(p.newest_metric_date!)}`,
        detail: age === null
          ? `${name} has ${p.total_posts.toLocaleString()} posts but no metrics have come back for them. Nothing from ${name} can be scored until they do.`
          : dead
            ? `The ${name} feed has returned no post metrics for ${age} days. ${name} posts are left out of verdicts and lanes until it does, so check the connection.`
            : `${name} numbers reflect the last successful sync, ${age} days ago, not today.`,
        action: dead ? { label: 'Check the connection', to: '/office/connections' } : undefined,
      });
    }
  } else {
    const metricAge = daysSince(h.newest_metric_date);
    if (h.total_posts > 0 && (metricAge === null || metricAge > 2)) {
      findings.push({
        id: 'metrics-stale',
        severity: 'warning',
        title: metricAge === null
          ? 'No metrics have been recorded yet'
          : `Metrics are ${metricAge} days old`,
        detail: 'Numbers on this page reflect the last successful sync, not today.',
      });
    }
  }

  // ── Content vs the selected window ───────────────────────────────────────
  // The distinction the old empty state could not make: plenty of posts, none
  // of them inside the range you are looking at.
  const { postsInWindow, windowLabel = 'this date range' } = opts;
  if (postsInWindow === 0 && h.total_posts > 0) {
    findings.push({
      id: 'window-empty',
      severity: 'warning',
      title: `Nothing published in ${windowLabel}`,
      detail: h.newest_post_at
        ? `You have ${h.total_posts.toLocaleString()} posts synced. The most recent went out on ${fmtDate(h.newest_post_at)} — widen the range to include it.`
        : `You have ${h.total_posts.toLocaleString()} posts synced, none of them in this window.`,
    });
  }

  // ── Benchmark coverage ───────────────────────────────────────────────────
  if (h.scored_posts > 0 && h.posts_with_verdict === 0) {
    findings.push({
      id: 'no-baseline',
      severity: 'warning',
      title: 'Not enough history to score posts yet',
      detail:
        'A verdict compares a post to your last 20 in the same format. Once eight of them exist, scores appear automatically.',
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: 'healthy',
      severity: 'ok',
      title: 'Everything is syncing',
      detail: `${h.accounts_connected ?? 0} accounts connected, ${h.total_posts.toLocaleString()} posts tracked, ${h.posts_with_verdict.toLocaleString()} scored.`,
    });
  }

  return findings;
}

/** True when anything needs the creator's attention. */
export function hasProblems(findings: Finding[]): boolean {
  return findings.some((f) => f.severity !== 'ok');
}
