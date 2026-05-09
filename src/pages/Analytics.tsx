import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, Heart, MessageCircle, Instagram, Youtube,
  ExternalLink, Film, Image as ImageIcon, Layers,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTimezone } from '../hooks/useTimezone';
import { getLocalDayAndHour, formatInTz } from '../lib/timezone';
import { ThreadsIcon } from '../components/icons/ThreadsIcon';
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

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
  '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];

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
  scheduled_date: string | null;
  instagram_post_id: string | null;
  youtube_video_id: string | null;
  tiktok_post_id: string | null;
  ab_pair_id?: string | null;
  ab_test_group?: 'A' | 'B' | null;
}

interface AbPair {
  A?: ContentPostRow;
  B?: ContentPostRow;
}

export function Analytics() {
  const { user } = useAuth();
  const { timezone } = useTimezone();

  const [dateValue, setDateValue] = useState<DateComparisonValue>(() => defaultDateComparison());
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<PlatformMetricRow[]>([]);
  const [posts, setPosts] = useState<ContentPostRow[]>([]);
  const [abPairs, setAbPairs] = useState<AbPair[]>([]);

  useEffect(() => {
    if (user) loadAnalytics();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, dateValue.range.start.getTime(), dateValue.range.end.getTime(), dateValue.comparison?.start.getTime(), dateValue.comparison?.end.getTime()]);

  const loadAnalytics = async () => {
    if (!user) return;
    setLoading(true);
    const safetyTimer = setTimeout(() => setLoading(false), 5000);
    try {
      // Fetch the FULL window covering both comparison and current ranges in one query.
      const queryStart = dateValue.comparison?.start ?? dateValue.range.start;
      const queryStartIso = isoDate(queryStart);
      const queryEndIso = isoDate(dateValue.range.end);

      const [metricsRes, postsRes, abRes] = await Promise.all([
        supabase
          .from('platform_metrics')
          .select('date, platform, followers_count, total_likes, total_comments, total_views, total_shares, avg_engagement_rate')
          .eq('user_id', user.id)
          .gte('date', queryStartIso)
          .lte('date', queryEndIso)
          .order('date', { ascending: true }),
        supabase
          .from('content_posts')
          .select('id, platform, caption, published_date, likes, comments, views, saves, shares, media_type, thumbnail_url, instagram_post_id, youtube_video_id, tiktok_post_id')
          .eq('user_id', user.id)
          .eq('status', 'published')
          .gte('published_date', isoDate(dateValue.range.start))
          .lte('published_date', isoDate(dateValue.range.end))
          .order('likes', { ascending: false })
          .limit(20),
        supabase
          .from('content_posts')
          .select('id, ab_pair_id, ab_test_group, platform, caption, published_date, likes, comments, views, scheduled_date')
          .eq('user_id', user.id)
          .eq('status', 'published')
          .not('ab_pair_id', 'is', null),
      ]);

      setMetrics((metricsRes.data ?? []) as PlatformMetricRow[]);
      setPosts((postsRes.data ?? []) as ContentPostRow[]);

      const pairMap = new Map<string, AbPair>();
      for (const p of (abRes.data ?? []) as ContentPostRow[]) {
        const key = p.ab_pair_id as string;
        if (!pairMap.has(key)) pairMap.set(key, {});
        if (p.ab_test_group === 'A' || p.ab_test_group === 'B') {
          pairMap.get(key)![p.ab_test_group] = p;
        }
      }
      setAbPairs(Array.from(pairMap.values()).filter((pair) => pair.A && pair.B));
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

  const kpis = useMemo(() => buildKpis(split), [split]);
  const audienceWidget = useMemo(() => buildAudienceWidget(split), [split]);
  const engagementsWidget = useMemo(() => buildEngagementsWidget(split), [split]);
  const engagementRateWidget = useMemo(() => buildEngagementRateWidget(split), [split]);

  const heatmap = useMemo(() => buildHeatmap(posts, timezone), [posts, timezone]);
  const heatmapMax = Math.max(1, ...heatmap.flat());

  const topPosts = useMemo(() => buildTopPosts(posts, 10), [posts]);

  const hasData = metrics.length > 0 || posts.length > 0;

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
          <p className="t-micro text-muted-foreground mb-2">Analytics</p>
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
            Profile Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Cross-platform performance for the selected window.
          </p>
        </div>
        <DateComparisonPill value={dateValue} onChange={setDateValue} />
      </div>

      {!hasData ? (
        <div className="p-16 text-center bg-card border border-border">
          <TrendingUp className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-xl font-semibold mb-2 text-foreground">No analytics data yet</h3>
          <p className="text-muted-foreground">
            Connect your accounts in Settings and sync to start tracking performance.
          </p>
        </div>
      ) : (
        <>
          <KpiRow cards={kpis} />

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

          <MetricWidget
            title="Engagement Rate"
            subtitle="Engagements divided by followers, averaged across the selected period."
            series={engagementRateWidget.series}
          >
            <BreakdownTable
              rowHeader="Engagement Rate Metrics"
              columns={[{ label: 'Rate' }]}
              rows={engagementRateWidget.rows}
            />
          </MetricWidget>

          {/* Best time to post heatmap (kept from prior Analytics.tsx) */}
          {topPosts.length > 2 && (
            <section className="border border-border bg-card">
              <header className="px-5 pt-5 pb-3">
                <h2 className="text-base font-semibold">Best Time to Post</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Engagement intensity by day and hour. Darker means higher engagement.
                </p>
              </header>
              <div className="px-5 pb-5 overflow-x-auto">
                <div className="min-w-[640px]">
                  <div className="flex mb-1 ml-10">
                    {HOUR_LABELS.map((h, i) => (
                      <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
                        {i % 3 === 0 ? h : ''}
                      </div>
                    ))}
                  </div>
                  {heatmap.map((dayRow, dayIdx) => (
                    <div key={dayIdx} className="flex items-center gap-0 mb-0.5">
                      <span className="w-10 text-xs text-muted-foreground text-right pr-2 flex-shrink-0">
                        {DAY_LABELS[dayIdx]}
                      </span>
                      {dayRow.map((val, hourIdx) => {
                        const intensity = val / heatmapMax;
                        return (
                          <div
                            key={hourIdx}
                            className="flex-1 h-6 mx-px"
                            style={{
                              backgroundColor:
                                intensity > 0
                                  ? `rgba(26, 24, 22, ${0.08 + intensity * 0.85})`
                                  : 'var(--muted)',
                            }}
                            title={`${DAY_LABELS[dayIdx]} ${HOUR_LABELS[hourIdx]}: ${val} engagement`}
                          />
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Top posts */}
          <section className="border border-border bg-card">
            <header className="px-5 pt-5 pb-3 border-b border-border">
              <h2 className="text-base font-semibold">Top Posts</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Ranked by engagement during the selected period.
              </p>
            </header>
            {topPosts.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">
                No published posts found in this period.
              </p>
            ) : (
              <ul>
                {topPosts.map((post, idx) => (
                  <li key={post.id} className="flex items-start gap-4 px-5 py-4 border-b border-border last:border-b-0">
                    <div className="w-7 h-7 border border-border bg-muted flex items-center justify-center text-xs font-semibold tabular-nums shrink-0">
                      {idx + 1}
                    </div>
                    {post.thumbnail_url ? (
                      <img
                        src={post.thumbnail_url}
                        alt=""
                        className="w-16 h-16 object-cover shrink-0"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-16 h-16 bg-muted border border-border flex items-center justify-center shrink-0">
                        <FormatIcon mediaType={post.media_type} className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <PlatformIcon platform={post.platform} className="w-4 h-4 shrink-0 text-muted-foreground" />
                        <FormatIcon mediaType={post.media_type} className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {post.published_at && (
                          <span className="t-micro text-muted-foreground">
                            {format(parseISO(post.published_at), 'MMM d')}
                          </span>
                        )}
                        {post.permalink && (
                          <a
                            href={post.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                            title="View post"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                      <p className="text-sm text-foreground line-clamp-2 mb-2">
                        {post.caption || 'No caption'}
                      </p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
                        <span className="inline-flex items-center gap-1"><Heart className="w-3 h-3" />{formatCount(post.likes)}</span>
                        <span className="inline-flex items-center gap-1"><MessageCircle className="w-3 h-3" />{formatCount(post.comments)}</span>
                        <span className="font-semibold text-foreground">{formatCount(post.engagement)} total</span>
                        {post.engagement_rate > 0 && (
                          <span className="text-foreground font-semibold">{formatPercent(post.engagement_rate)}</span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* A/B test results — kept from prior Analytics.tsx, restyled to the new shell */}
          {abPairs.length > 0 && (
            <section className="border border-border bg-card">
              <header className="px-5 pt-5 pb-3 border-b border-border">
                <h2 className="text-base font-semibold">A/B Time Test Results</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Compare engagement between your two scheduled time slots.
                </p>
              </header>
              <div className="p-5 space-y-4">
                {abPairs.map((pair, idx) => {
                  const a = pair.A!;
                  const b = pair.B!;
                  const engA = (a.likes ?? 0) + (a.comments ?? 0);
                  const engB = (b.likes ?? 0) + (b.comments ?? 0);
                  const winner = engA > engB ? 'A' : engB > engA ? 'B' : null;
                  return (
                    <div key={idx} className="border border-border">
                      <div className="px-4 py-2 bg-muted t-micro text-muted-foreground">
                        Test #{idx + 1} · {PLATFORM_LABELS[a.platform] ?? a.platform}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-border">
                        {[a, b].map((post, vi) => {
                          const label = vi === 0 ? 'A' : 'B';
                          const eng = (post.likes ?? 0) + (post.comments ?? 0);
                          const isWinner = winner === label;
                          return (
                            <div key={label} className="p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className={`t-micro px-2 py-0.5 border ${
                                    isWinner
                                      ? 'border-foreground bg-foreground text-primary-foreground'
                                      : 'border-border text-foreground'
                                  }`}
                                >
                                  Version {label}{isWinner ? ' · winner' : ''}
                                </span>
                              </div>
                              <p className="t-micro text-muted-foreground mb-1">
                                {post.scheduled_date ? formatInTz(post.scheduled_date, timezone) : 'Unknown time'}
                              </p>
                              <p className="text-sm text-foreground line-clamp-2 mb-2">
                                {post.caption || 'No caption'}
                              </p>
                              <div className="flex gap-3 text-xs tabular-nums">
                                <span className="text-muted-foreground">{formatCount(post.likes)} likes</span>
                                <span className="text-muted-foreground">{formatCount(post.comments)} comments</span>
                                <span className="font-semibold text-foreground">{formatCount(eng)} total</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
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

function buildEngagementRateWidget(split: SplitMetrics) {
  // Per-day rate uses the daily snapshot's avg_engagement_rate field already
  // computed by each sync job. Sum across platforms = simple average weighted
  // by platform presence (one number per platform per day, mean of those).
  const dailyMap = new Map<string, { sum: number; count: number }>();
  for (const r of split.current) {
    const key = format(parseISO(r.date), 'MMM d');
    const cell = dailyMap.get(key) ?? { sum: 0, count: 0 };
    cell.sum += r.avg_engagement_rate ?? 0;
    cell.count += 1;
    dailyMap.set(key, cell);
  }
  const series: ChartSeries[] = [
    {
      name: 'Engagement Rate',
      variant: 'line',
      color: 'var(--chart-1)',
      data: Array.from(dailyMap.entries()).map(([x, v]) => ({
        x,
        y: v.count > 0 ? v.sum / v.count : 0,
      })),
    },
  ];

  const meanRate = (rows: PlatformMetricRow[]) => {
    if (rows.length === 0) return 0;
    return rows.reduce((s, r) => s + (r.avg_engagement_rate ?? 0), 0) / rows.length;
  };

  const curRate = meanRate(split.current);
  const prevRate = meanRate(split.previous);

  const rows: BreakdownRow[] = [
    {
      label: 'Engagement Rate',
      values: [formatPercent(curRate, 2)],
      delta: computeDelta(curRate, split.previous.length > 0 ? prevRate : null),
      isTotal: true,
    },
    ...Array.from(split.byPlatformCurrent.keys()).map((platform): BreakdownRow => {
      const cur = meanRate(split.byPlatformCurrent.get(platform) ?? []);
      const prev = meanRate(split.byPlatformPrevious.get(platform) ?? []);
      return {
        label: `${PLATFORM_LABELS[platform] ?? platform} Engagement Rate`,
        values: [formatPercent(cur, 2)],
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

// ── Heatmap + Top Posts builders ────────────────────────────────────────────

function buildHeatmap(posts: ContentPostRow[], timezone: string): number[][] {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const p of posts) {
    if (!p.published_date) continue;
    try {
      const { day, hour } = getLocalDayAndHour(p.published_date, timezone);
      const eng = (p.likes ?? 0) + (p.comments ?? 0);
      grid[day][hour] += eng;
    } catch (_) {
      /* skip invalid dates */
    }
  }
  return grid;
}

interface TopPost {
  id: string;
  platform: string;
  caption: string;
  thumbnail_url: string | null;
  permalink: string | null;
  media_type: string | null;
  likes: number;
  comments: number;
  engagement: number;
  engagement_rate: number;
  published_at: string;
}

function buildTopPosts(posts: ContentPostRow[], limit: number): TopPost[] {
  const buildPermalink = (p: ContentPostRow): string | null => {
    if (p.instagram_post_id) return `https://www.instagram.com/p/${p.instagram_post_id}/`;
    if (p.youtube_video_id) return `https://www.youtube.com/watch?v=${p.youtube_video_id}`;
    if (p.tiktok_post_id) return `https://www.tiktok.com/@user/video/${p.tiktok_post_id}`;
    return null;
  };
  return posts.slice(0, limit).map((p) => ({
    id: p.id,
    platform: p.platform,
    caption: p.caption ?? '',
    thumbnail_url: p.thumbnail_url ?? null,
    permalink: buildPermalink(p),
    media_type: p.media_type ?? 'image',
    likes: p.likes ?? 0,
    comments: p.comments ?? 0,
    engagement: (p.likes ?? 0) + (p.comments ?? 0),
    engagement_rate:
      (p.views ?? 0) > 0 ? (((p.likes ?? 0) + (p.comments ?? 0)) / (p.views ?? 1)) * 100 : 0,
    published_at: p.published_date ?? '',
  }));
}

// ── Small helpers ───────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === 'instagram') return <Instagram className={className} />;
  if (platform === 'youtube') return <Youtube className={className} />;
  if (platform === 'threads') return <ThreadsIcon className={className} />;
  return <TrendingUp className={className} />;
}

function FormatIcon({ mediaType, className }: { mediaType: string | null; className?: string }) {
  const t = (mediaType ?? '').toLowerCase();
  if (t.includes('video') || t === 'reel' || t === 'short') return <Film className={className} />;
  if (t === 'carousel') return <Layers className={className} />;
  return <ImageIcon className={className} />;
}
