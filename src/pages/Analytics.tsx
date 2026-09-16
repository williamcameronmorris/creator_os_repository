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
import {
  isoDate,
  exclusiveEndIso,
  inRange,
  sumFollowers,
  followerDelta,
  sumEngagement,
  engagementByDay,
  engagementRate,
  type EngagementDay,
} from '../lib/analyticsMath';
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
  // Engagements per brand/platform/day from the engagement_daily view: the
  // sum of each post's day-over-day change. The old figure was last-minus-
  // first of a lifetime total over a rolling 150-post window, so a post
  // ageing out read as zero growth and a new one dumped its whole lifetime
  // count into a single day.
  const [engagementDays, setEngagementDays] = useState<EngagementDay[]>([]);

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
      // The end bound is "before the day after": `lte` against a bare date
      // compared timestamps to the end day's midnight and dropped everything
      // published that day, which is usually the post you came to check.
      const rangeStartIso = isoDate(dateValue.range.start);
      const rangeEndExclusive = exclusiveEndIso(dateValue.range);
      let postsQuery = supabase
        .from('content_posts')
        .select('id, platform, caption, published_date, published_at, likes, comments, views, saves, shares, media_type, thumbnail_url, instagram_post_id, youtube_video_id, tiktok_post_id')
        .eq('user_id', user.id)
        .eq('brand_id', activeBrand.id)
        .eq('status', 'published')
        // App-published posts set published_at (not published_date), so filter
        // on either column — otherwise the user's own content is excluded.
        .or(
          `and(published_at.gte.${rangeStartIso},published_at.lt.${rangeEndExclusive}),` +
          `and(published_date.gte.${rangeStartIso},published_date.lt.${rangeEndExclusive})`
        );
      let engagementQuery = supabase
        .from('engagement_daily')
        .select('date, platform, engagements, views')
        .eq('brand_id', activeBrand.id)
        .gte('date', queryStartIso)
        .lte('date', queryEndIso);
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
        // engagement_daily is per brand and platform; the pinned account's
        // platform is the closest honest scope.
        engagementQuery = engagementQuery.eq('platform', activeAccount.platform);
      }

      const [metricsRes, postsRes, engagementRes] = await Promise.all([
        metricsQuery.order('date', { ascending: true }),
        postsQuery.order('likes', { ascending: false }).limit(20),
        engagementQuery.order('date', { ascending: true }),
      ]);

      setMetrics((metricsRes.data ?? []) as PlatformMetricRow[]);
      setPosts((postsRes.data ?? []) as ContentPostRow[]);
      if (engagementRes.error) {
        console.warn('engagement_daily query failed:', engagementRes.error.message);
      }
      setEngagementDays((engagementRes.data ?? []) as unknown as EngagementDay[]);

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

  const engagementSplit = useMemo(
    () => ({
      current: engagementDays.filter((r) => inRange(r.date, dateValue.range)),
      previous: dateValue.comparison
        ? engagementDays.filter((r) => inRange(r.date, dateValue.comparison!))
        : [],
    }),
    [engagementDays, dateValue]
  );

  const kpis = useMemo(
    () => buildKpis(metrics, split, engagementSplit, dateValue.range, dateValue.comparison)
      .filter((k) => hasFollowerDataRef(metrics) || (k.label !== 'Followers' && k.label !== 'Net Growth')),
    [metrics, split, engagementSplit, dateValue]
  );
  const audienceWidget = useMemo(() => buildAudienceWidget(split), [split]);
  const engagementsWidget = useMemo(
    () => buildEngagementsWidget(engagementSplit, dateValue.comparison !== null),
    [engagementSplit, dateValue.comparison]
  );

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
              subtitle="Likes plus comments earned during the selected period, summed from each post's daily change."
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
                {/* With no account pinned this ranking pools posts from every
                    platform, and each platform counts a view its own way. */}
                {!activeAccount && ' Each platform counts a view its own way, so a ranking that pools them is a rough guide, not a like-for-like one.'}
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
// Followers are a stock (a level read off the newest snapshot); engagements
// are a flow (summed per day from engagement_daily). The pure rules live in
// src/lib/analyticsMath.ts so they are unit-tested.

interface SplitMetrics {
  current: PlatformMetricRow[];
  previous: PlatformMetricRow[];
  byPlatformCurrent: Map<string, PlatformMetricRow[]>;
  byPlatformPrevious: Map<string, PlatformMetricRow[]>;
}

interface EngagementSplit {
  current: EngagementDay[];
  previous: EngagementDay[];
}

function splitByRange(
  rows: PlatformMetricRow[],
  range: DateRange,
  comparison: DateRange | null
): SplitMetrics {
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

/** Net follower change summed across platforms. Not clamped: a losing week
 *  used to read as flat. */
function netFollowerGrowth(byPlatform: Map<string, PlatformMetricRow[]>): number {
  let total = 0;
  for (const list of byPlatform.values()) total += followerDelta(list);
  return total;
}

/** True once any platform reports a non-zero follower count. Gates every
 *  follower-derived surface so a broken sync reads as absent, not as zero. */
function hasFollowerDataRef(metrics: PlatformMetricRow[]): boolean {
  return metrics.some((m) => (m.followers_count ?? 0) > 0);
}

function buildKpis(
  metrics: PlatformMetricRow[],
  split: SplitMetrics,
  engagement: EngagementSplit,
  range: DateRange,
  comparison: DateRange | null
) {
  const cur = sumEngagement(engagement.current);
  const prev = sumEngagement(engagement.previous);
  const hasComparison = comparison !== null;

  // Followers: newest real count per platform on or before the range end.
  // Rows born at 0 by the midnight sync do not count, and the comparison
  // period reads the same way against its own end date.
  const curFollowers = sumFollowers(metrics, isoDate(range.end));
  const prevFollowers = comparison ? sumFollowers(metrics, isoDate(comparison.end)) : 0;

  const curNetGrowth = netFollowerGrowth(split.byPlatformCurrent);
  const prevNetGrowth = netFollowerGrowth(split.byPlatformPrevious);

  // Interactions over reach (views earned in the period), never over
  // followers: a follower-based rate printed 0.00% as fact wherever the
  // follower sync had not run. N/A when there is nothing to divide by.
  const curRate = engagementRate(cur.engagements, cur.views);
  const prevRate = engagementRate(prev.engagements, prev.views);

  return [
    {
      label: 'Engagements',
      value: formatCompact(cur.engagements),
      delta: computeDelta(cur.engagements, hasComparison ? prev.engagements : null),
      hero: true,
    },
    {
      label: 'Followers',
      value: formatCompact(curFollowers),
      delta: computeDelta(curFollowers, hasComparison && prevFollowers > 0 ? prevFollowers : null),
    },
    {
      label: 'Net Growth',
      value: formatCount(curNetGrowth),
      delta: computeDelta(curNetGrowth, split.previous.length > 0 ? prevNetGrowth : null),
    },
    {
      label: 'Engagement Rate',
      value: formatPercent(curRate, 2),
      delta: computeDelta(curRate, hasComparison ? prevRate : null),
    },
  ];
}

function buildAudienceWidget(split: SplitMetrics) {
  const series: ChartSeries[] = Array.from(split.byPlatformCurrent.entries()).map(
    ([platform, rows], idx) => ({
      name: PLATFORM_LABELS[platform] ?? platform,
      variant: 'line',
      color: idx === 0 ? 'var(--chart-1)' : idx === 1 ? 'var(--chart-3)' : 'var(--chart-2)',
      // Skip the zeros: a row the sync opened before the follower count
      // landed is a gap in the line, not a drop to nothing.
      data: rows
        .filter((r) => (r.followers_count ?? 0) > 0)
        .map((r) => ({ x: format(parseISO(r.date), 'MMM d'), y: r.followers_count })),
    })
  );

  const totalCur = netFollowerGrowth(split.byPlatformCurrent);
  const totalPrev = netFollowerGrowth(split.byPlatformPrevious);
  const rows: BreakdownRow[] = [
    {
      label: 'Net Audience Growth',
      values: [formatCount(totalCur)],
      delta: computeDelta(totalCur, split.previous.length > 0 ? totalPrev : null),
      isTotal: true,
    },
    ...Array.from(split.byPlatformCurrent.keys()).map((platform): BreakdownRow => {
      const cur = followerDelta(split.byPlatformCurrent.get(platform) ?? []);
      const prev = followerDelta(split.byPlatformPrevious.get(platform) ?? []);
      return {
        label: `${PLATFORM_LABELS[platform] ?? platform} Net Follower Growth`,
        values: [formatCount(cur)],
        delta: computeDelta(cur, split.previous.length > 0 ? prev : null),
      };
    }),
  ];

  return { series, rows };
}

function buildEngagementsWidget(engagement: EngagementSplit, hasComparison: boolean) {
  const series: ChartSeries[] = [
    {
      name: 'Engagements',
      variant: 'area',
      color: 'var(--chart-1)',
      data: engagementByDay(engagement.current).map((d) => ({
        x: format(parseISO(d.date), 'MMM d'),
        y: d.engagements,
      })),
    },
  ];

  const totalCur = sumEngagement(engagement.current).engagements;
  const totalPrev = sumEngagement(engagement.previous).engagements;
  const platforms = Array.from(new Set(engagement.current.map((r) => r.platform)));

  const rows: BreakdownRow[] = [
    {
      label: 'Engagements',
      values: [formatCount(totalCur)],
      delta: computeDelta(totalCur, hasComparison ? totalPrev : null),
      isTotal: true,
    },
    ...platforms.map((platform): BreakdownRow => {
      const cur = sumEngagement(engagement.current.filter((r) => r.platform === platform)).engagements;
      const prev = sumEngagement(engagement.previous.filter((r) => r.platform === platform)).engagements;
      return {
        label: `${PLATFORM_LABELS[platform] ?? platform} Engagements`,
        values: [formatCount(cur)],
        delta: computeDelta(cur, hasComparison ? prev : null),
      };
    }),
  ];

  return { series, rows };
}
