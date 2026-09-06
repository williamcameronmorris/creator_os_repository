import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { format, parseISO } from 'date-fns';
import { useAccount } from '../contexts/AccountContext';
import { useBrand } from '../contexts/BrandContext';
import { KpiRow } from '../components/analytics/KpiRow';
import { MetricWidget } from '../components/analytics/MetricWidget';
import { BreakdownTable } from '../components/analytics/BreakdownTable';
import {
  DateComparisonPill,
  defaultDateComparison,
  type DateComparisonValue,
  type DateRange,
} from '../components/analytics/DateComparisonPill';
import { computeDelta, formatCount, formatPercent, formatCompact } from '../components/analytics/format';
import type { BreakdownRow, ChartSeries } from '../components/analytics/types';
import { Eyebrow, SectionHead } from '../components/ui/tac';
import { DataHealthPanel } from '../components/DataHealthPanel';
import { VerdictCard, VerdictRow } from '../components/analytics/VerdictCard';
import { LaneLeaderboard } from '../components/analytics/LaneLeaderboard';
import {
  fetchPostPerformance,
  buildLaneStats,
  type PostPerformance,
} from '../lib/postPerformance';

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X / Twitter',
  bluesky: 'Bluesky',
};


interface PlatformMetricRow {
  date: string;
  platform: string;
  followers_count: number;
  total_likes: number;
  total_comments: number;
  total_views: number;
  total_shares: number;
  avg_engagement_rate: number;
}

interface ContentPostRow {
  id: string;
  platform: string;
  caption: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  published_date: string | null;
  published_at: string | null;
  scheduled_date: string | null;
  instagram_post_id: string | null;
  youtube_video_id: string | null;
  tiktok_post_id: string | null;
  ab_pair_id?: string | null;
  ab_test_group?: 'A' | 'B' | null;
}


export function Analytics() {
  const { user } = useAuth();
  const { activeAccount } = useAccount();
  const { activeBrand } = useBrand();

  const [dateValue, setDateValue] = useState<DateComparisonValue>(() => defaultDateComparison());
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PlatformMetricRow[]>([]);
  const [posts, setPosts] = useState<ContentPostRow[]>([]);
  const [perf, setPerf] = useState<PostPerformance[]>([]);

  useEffect(() => {
    if (user && activeBrand) loadAnalytics();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, activeBrand, activeAccount?.id, dateValue.range.start.getTime(), dateValue.range.end.getTime(), dateValue.comparison?.start.getTime(), dateValue.comparison?.end.getTime()]);

  const loadAnalytics = async () => {
    if (!user || !activeBrand) return;
    setLoading(true);
    const safetyTimer = setTimeout(() => setLoading(false), 5000);
    // Scored posts are independent of the date pill: the verdict compares a
    // post to the creator's own trailing median, not to a calendar window.
    fetchPostPerformance(activeBrand.id, { platform: activeAccount?.platform, limit: 60 })
      .then(setPerf)
      .catch(() => setPerf([]));
    try {
      // Fetch the FULL window covering both comparison and current ranges in one query.
      const queryStart = dateValue.comparison?.start ?? dateValue.range.start;
      const queryStartIso = isoDate(queryStart);
      const queryEndIso = isoDate(dateValue.range.end);

      // Account scope: with an account pinned in the Account Switcher, only
      // its rows count. Legacy NULL rows (pre-backfill, or metrics from the
      // still user-level sync) surface only under "All accounts".
      let metricsQuery = supabase
        .from('platform_metrics')
        .select('date, platform, followers_count, total_likes, total_comments, total_views, total_shares, avg_engagement_rate')
        .eq('user_id', user.id)
        .eq('brand_id', activeBrand.id)
        .gte('date', queryStartIso)
        .lte('date', queryEndIso);
      let postsQuery = supabase
        .from('content_posts')
        .select('id, platform, caption, published_date, published_at, likes, comments, views, saves, shares, media_type, thumbnail_url, instagram_post_id, youtube_video_id, tiktok_post_id')
        .eq('user_id', user.id)
        .eq('brand_id', activeBrand.id)
        .eq('status', 'published')
        // App-published posts set published_at (not published_date), so filter
        // on either column — otherwise the user's own content is excluded.
        .or(
          `and(published_at.gte.${isoDate(dateValue.range.start)},published_at.lte.${isoDate(dateValue.range.end)}),` +
          `and(published_date.gte.${isoDate(dateValue.range.start)},published_date.lte.${isoDate(dateValue.range.end)})`
        );
      if (activeAccount) {
        // platform_metrics is a USER-LEVEL roll-up: postforme-sync aggregates
        // across every account on a platform, and the follower syncs are
        // per-profile, so every row is written with social_account_id NULL.
        // Filtering strictly by account therefore matched nothing and the page
        // fell through to its empty state while the data sat right there.
        // Include the user-level rows alongside the pinned account's.
        metricsQuery = metricsQuery.or(
          `social_account_id.eq.${activeAccount.id},social_account_id.is.null`
        );
        postsQuery = postsQuery.eq('social_account_id', activeAccount.id);
      }

      const [metricsRes, postsRes] = await Promise.all([
        metricsQuery.order('date', { ascending: true }),
        postsQuery.order('likes', { ascending: false }).limit(20),
      ]);

      setMetrics((metricsRes.data ?? []) as PlatformMetricRow[]);
      setPosts((postsRes.data ?? []) as ContentPostRow[]);

    } catch (err) {
      console.error('loadAnalytics error', err);
    } finally {
      clearTimeout(safetyTimer);
      setLoading(false);
    }
  };

  // ── Derive page state ──────────────────────────────────────────────────────

  const split = useMemo(
    () => splitByRange(metrics, dateValue.range, dateValue.comparison),
    [metrics, dateValue]
  );

  const kpis = useMemo(
    () => buildKpis(split).filter((k) => hasFollowerDataRef(metrics) || 
      (k.label !== 'Followers' && k.label !== 'Net Growth')),
    [split, metrics]
  );
  const audienceWidget = useMemo(() => buildAudienceWidget(split), [split]);
  const engagementsWidget = useMemo(() => buildEngagementsWidget(split), [split]);

  // Follower counts still come from the direct Meta/YouTube syncs, which are
  // currently failing auth. Rather than render a wall of zeros and quietly lie,
  // the audience band is hidden entirely until real numbers land.
  const hasFollowerData = useMemo(
    () => metrics.some((m) => (m.followers_count ?? 0) > 0),
    [metrics]
  );

  const scored = useMemo(() => perf.filter((p) => p.views_multiple !== null), [perf]);
  const heroPost = perf[0] ?? null;
  const recentPosts = useMemo(() => perf.slice(1, 9), [perf]);
  const laneStats = useMemo(() => buildLaneStats(perf), [perf]);
  const platformLabel = activeAccount?.platform
    ? PLATFORM_LABELS[activeAccount.platform] ?? activeAccount.platform
    : 'all platforms';

  // Scored posts count as data. Bands 1 and 3 read post_performance, which is
  // deliberately independent of the date pill — a verdict compares a post to
  // the creator's own trailing median, not to a calendar window. Gating the
  // whole page on the date-filtered queries meant the one section guaranteed
  // to have something to show never got the chance to render.
  const hasData = metrics.length > 0 || posts.length > 0 || perf.length > 0;


  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="t-micro text-muted-foreground mb-2">
            Analytics
            {activeAccount && (
              <span style={{ color: 'var(--accent)' }}>
                {' '}· {activeAccount.username ? `@${activeAccount.username}` : activeAccount.platform}
              </span>
            )}
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
            Profile Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {activeAccount
              ? `Performance for ${activeAccount.username ? `@${activeAccount.username}` : 'the selected account'} in the selected window.`
              : 'Cross-platform performance across all accounts for the selected window.'}
          </p>
        </div>
        <DateComparisonPill value={dateValue} onChange={setDateValue} />
      </div>

      {!hasData ? (
        <DataHealthPanel
          postsInWindow={posts.length}
          windowLabel="the selected date range"
        />
      ) : (
        <>
          <DataHealthPanel compact postsInWindow={posts.length} windowLabel="the selected date range" />

          {/* ── Band 1 · Verdict ────────────────────────────────────────
              Was that post good or bad. The multiple is the hero, not the
              count: a raw number cannot be read without a baseline. */}
          <section className="space-y-4">
            <div>
              <Eyebrow>01 · Verdict</Eyebrow>
              <div className="mt-2">
                <SectionHead accent="last post.">How you did on your</SectionHead>
              </div>
            </div>

            {heroPost ? (
              <>
                <VerdictCard post={heroPost} />
                {recentPosts.length > 0 && (
                  <div className="border border-border bg-card">
                    <header className="px-5 py-3 border-b border-border">
                      <p className="t-micro">Before that</p>
                    </header>
                    <ul>
                      {recentPosts.map((post) => (
                        <VerdictRow key={post.id} post={post} />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div className="border border-border bg-card px-5 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  No scored posts yet. Metrics sync every six hours.
                </p>
              </div>
            )}
          </section>

          {/* ── Band 2 · Trend ──────────────────────────────────────────────
              Am I growing. One chart, not three. The audience widget only
              appears once follower data is real. */}
          <section className="space-y-4 pt-4">
            <div>
              <Eyebrow>02 · Trend</Eyebrow>
              <div className="mt-2">
                <SectionHead accent="moving.">Where the numbers are</SectionHead>
              </div>
            </div>

            <KpiRow cards={kpis} />

            <MetricWidget
              title="Engagements"
              subtitle="Total likes plus comments earned during the selected period."
              series={engagementsWidget.series}
            >
              <BreakdownTable
                rowHeader="Engagement Metrics"
                columns={[{ label: 'Total' }]}
                rows={engagementsWidget.rows}
              />
            </MetricWidget>

            {hasFollowerData && (
              <MetricWidget
                title="Audience Growth"
                subtitle="Net new followers across connected platforms during the selected period."
                series={audienceWidget.series}
              >
                <BreakdownTable
                  rowHeader="Audience Metrics"
                  columns={[{ label: 'Net Growth' }]}
                  rows={audienceWidget.rows}
                />
              </MetricWidget>
            )}
          </section>

          {/* ── Band 3 · What's working ─────────────────────────────────────
              What should I make next. Lanes are the creator's own Starter Kit
              taxonomy, so the guidance shown back is their own words. */}
          <section className="space-y-4 pt-4">
            <div>
              <Eyebrow>03 · What&rsquo;s working</Eyebrow>
              <div className="mt-2">
                <SectionHead accent="next.">What to make</SectionHead>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Your lanes on {platformLabel}, ranked by median views. Scored
                against {scored.length} posts with enough history to judge.
              </p>
            </div>
            <LaneLeaderboard lanes={laneStats} platformLabel={platformLabel} />
          </section>

        </>
      )}
    </div>
  );
}

// ── Math: snapshot-as-stock period-over-period ─────────────────────────────

interface SplitMetrics {
  current: PlatformMetricRow[];
  previous: PlatformMetricRow[];
  byPlatformCurrent: Map<string, PlatformMetricRow[]>;
  byPlatformPrevious: Map<string, PlatformMetricRow[]>;
}

function splitByRange(
  rows: PlatformMetricRow[],
  range: DateRange,
  comparison: DateRange | null
): SplitMetrics {
  const inRange = (iso: string, r: DateRange) => {
    const d = iso.slice(0, 10);
    return d >= isoDate(r.start) && d <= isoDate(r.end);
  };
  const current = rows.filter((r) => inRange(r.date, range));
  const previous = comparison ? rows.filter((r) => inRange(r.date, comparison)) : [];
  return {
    current,
    previous,
    byPlatformCurrent: groupByPlatform(current),
    byPlatformPrevious: groupByPlatform(previous),
  };
}

function groupByPlatform(rows: PlatformMetricRow[]): Map<string, PlatformMetricRow[]> {
  const out = new Map<string, PlatformMetricRow[]>();
  for (const r of rows) {
    if (!out.has(r.platform)) out.set(r.platform, []);
    out.get(r.platform)!.push(r);
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

/**
 * Snapshot-as-stock delta: take last_value − first_value per platform, sum
 * across platforms. This is what Sprout calls "Net Audience Growth" math —
 * the value at the END of the window minus the value at the START.
 *
 * Replaces the old (broken) approach of summing every daily snapshot, which
 * counted each lifetime cumulative number once per day in the window.
 */
function periodDelta(byPlatform: Map<string, PlatformMetricRow[]>, field: keyof PlatformMetricRow): number {
  let total = 0;
  for (const list of byPlatform.values()) {
    if (list.length === 0) continue;
    const first = Number(list[0][field] ?? 0);
    const last = Number(list[list.length - 1][field] ?? 0);
    total += Math.max(0, last - first);
  }
  return total;
}

/** Latest stock value (sum of most-recent snapshot per platform). For followers. */
function latestStock(byPlatform: Map<string, PlatformMetricRow[]>, field: keyof PlatformMetricRow): number {
  let total = 0;
  for (const list of byPlatform.values()) {
    if (list.length === 0) continue;
    total += Number(list[list.length - 1][field] ?? 0);
  }
  return total;
}

/** True once any platform reports a non-zero follower count. Gates every
 *  follower-derived surface so a broken sync reads as absent, not as zero. */
function hasFollowerDataRef(metrics: PlatformMetricRow[]): boolean {
  return metrics.some((m) => (m.followers_count ?? 0) > 0);
}

function buildKpis(split: SplitMetrics) {
  const curEngagements =
    periodDelta(split.byPlatformCurrent, 'total_likes') +
    periodDelta(split.byPlatformCurrent, 'total_comments');
  const prevEngagements =
    periodDelta(split.byPlatformPrevious, 'total_likes') +
    periodDelta(split.byPlatformPrevious, 'total_comments');

  const curFollowers = latestStock(split.byPlatformCurrent, 'followers_count');
  const prevFollowers = latestStock(split.byPlatformPrevious, 'followers_count');

  const curNetGrowth = periodDelta(split.byPlatformCurrent, 'followers_count');
  const prevNetGrowth = periodDelta(split.byPlatformPrevious, 'followers_count');

  const curRate = curFollowers > 0 ? (curEngagements / curFollowers) * 100 : 0;
  const prevRate = prevFollowers > 0 ? (prevEngagements / prevFollowers) * 100 : 0;

  return [
    {
      label: 'Engagements',
      value: formatCompact(curEngagements),
      delta: computeDelta(curEngagements, split.previous.length > 0 ? prevEngagements : null),
      hero: true,
    },
    {
      label: 'Followers',
      value: formatCompact(curFollowers),
      delta: computeDelta(curFollowers, split.previous.length > 0 ? prevFollowers : null),
    },
    {
      label: 'Net Growth',
      value: formatCount(curNetGrowth),
      delta: computeDelta(curNetGrowth, split.previous.length > 0 ? prevNetGrowth : null),
    },
    {
      label: 'Engagement Rate',
      value: formatPercent(curRate, 2),
      delta: computeDelta(curRate, split.previous.length > 0 ? prevRate : null),
    },
  ];
}

function buildAudienceWidget(split: SplitMetrics) {
  const series: ChartSeries[] = Array.from(split.byPlatformCurrent.entries()).map(
    ([platform, rows], idx) => ({
      name: PLATFORM_LABELS[platform] ?? platform,
      variant: 'line',
      color: idx === 0 ? 'var(--chart-1)' : idx === 1 ? 'var(--chart-3)' : 'var(--chart-2)',
      data: rows.map((r) => ({ x: format(parseISO(r.date), 'MMM d'), y: r.followers_count })),
    })
  );

  const totalCur = periodDelta(split.byPlatformCurrent, 'followers_count');
  const totalPrev = periodDelta(split.byPlatformPrevious, 'followers_count');
  const rows: BreakdownRow[] = [
    {
      label: 'Net Audience Growth',
      values: [formatCount(totalCur)],
      delta: computeDelta(totalCur, split.previous.length > 0 ? totalPrev : null),
      isTotal: true,
    },
    ...Array.from(split.byPlatformCurrent.keys()).map((platform): BreakdownRow => {
      const cur = perPlatformDelta(split.byPlatformCurrent, platform, 'followers_count');
      const prev = perPlatformDelta(split.byPlatformPrevious, platform, 'followers_count');
      return {
        label: `${PLATFORM_LABELS[platform] ?? platform} Net Follower Growth`,
        values: [formatCount(cur)],
        delta: computeDelta(cur, split.previous.length > 0 ? prev : null),
      };
    }),
  ];

  return { series, rows };
}

function buildEngagementsWidget(split: SplitMetrics) {
  // Engagements per day = (today's lifetime total likes+comments) − (yesterday's),
  // computed per platform then summed across platforms for the chart.
  const dailyMap = new Map<string, Record<string, number>>();
  for (const [platform, rows] of split.byPlatformCurrent.entries()) {
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1];
      const cur = rows[i];
      const dailyEng = Math.max(
        0,
        (cur.total_likes - prev.total_likes) + (cur.total_comments - prev.total_comments)
      );
      const key = format(parseISO(cur.date), 'MMM d');
      const row = dailyMap.get(key) ?? { all: 0 };
      row[platform] = (row[platform] ?? 0) + dailyEng;
      row.all = (row.all ?? 0) + dailyEng;
      dailyMap.set(key, row);
    }
  }
  const series: ChartSeries[] = [
    {
      name: 'Engagements',
      variant: 'area',
      color: 'var(--chart-1)',
      data: Array.from(dailyMap.entries()).map(([x, v]) => ({ x, y: v.all ?? 0 })),
    },
  ];

  const totalCur =
    periodDelta(split.byPlatformCurrent, 'total_likes') +
    periodDelta(split.byPlatformCurrent, 'total_comments');
  const totalPrev =
    periodDelta(split.byPlatformPrevious, 'total_likes') +
    periodDelta(split.byPlatformPrevious, 'total_comments');

  const rows: BreakdownRow[] = [
    {
      label: 'Engagements',
      values: [formatCount(totalCur)],
      delta: computeDelta(totalCur, split.previous.length > 0 ? totalPrev : null),
      isTotal: true,
    },
    ...Array.from(split.byPlatformCurrent.keys()).map((platform): BreakdownRow => {
      const cur =
        perPlatformDelta(split.byPlatformCurrent, platform, 'total_likes') +
        perPlatformDelta(split.byPlatformCurrent, platform, 'total_comments');
      const prev =
        perPlatformDelta(split.byPlatformPrevious, platform, 'total_likes') +
        perPlatformDelta(split.byPlatformPrevious, platform, 'total_comments');
      return {
        label: `${PLATFORM_LABELS[platform] ?? platform} Engagements`,
        values: [formatCount(cur)],
        delta: computeDelta(cur, split.previous.length > 0 ? prev : null),
      };
    }),
  ];

  return { series, rows };
}

function perPlatformDelta(
  byPlatform: Map<string, PlatformMetricRow[]>,
  platform: string,
  field: keyof PlatformMetricRow
): number {
  const list = byPlatform.get(platform) ?? [];
  if (list.length === 0) return 0;
  return Math.max(0, Number(list[list.length - 1][field] ?? 0) - Number(list[0][field] ?? 0));
}

// ── Small helpers ───────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}


