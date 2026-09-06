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

/** One row per BRAND: connections, syncs and coverage for that brand only. */
export async function fetchDataHealth(brandId: string): Promise<DataHealth | null> {
  const { data, error } = await supabase
    .from('data_health')
    .select('*')
    .eq('brand_id', brandId)
    .maybeSingle();
  if (error) {
    console.warn('data_health query failed:', error.message);
    return null;
  }
  return (data as DataHealth) ?? null;
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
