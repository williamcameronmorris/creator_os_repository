import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import {
  TrendingUp, Eye, Heart, MessageCircle, Users, Instagram, Youtube,
  ArrowUp, ArrowDown, Lock, Crown, ExternalLink, Film, Image as ImageIcon, Layers,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { format, subDays, parseISO } from 'date-fns';
import { PaywallModal } from '../components/PaywallModal';
import { useTimezone } from '../hooks/useTimezone';
import { getLocalDayAndHour } from '../lib/timezone';
import { ThreadsIcon } from '../components/icons/ThreadsIcon';

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  tiktok: '#010101',
  youtube: '#FF0000',
  threads: '#000000',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = ['12a','1a','2a','3a','4a','5a','6a','7a','8a','9a','10a','11a',
  '12p','1p','2p','3p','4p','5p','6p','7p','8p','9p','10p','11p'];

interface PostPerformance {
  id: string;
  platform: string;
  caption: string;
  thumbnail_url: string | null;
  permalink: string | null;
  media_type: string;
  views: number;
  likes: number;
  comments: number;
  engagement: number;
  engagement_rate: number;
  published_at: string;
}

export function Analytics() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState('');

  // Stats
  const [summaryStats, setSummaryStats] = useState({
    totalEngagement: 0, engagementChange: 0,
    totalLikes: 0, likesChange: 0,
    totalComments: 0, commentsChange: 0,
    totalFollowers: 0, followersChange: 0,
  });

  // Chart data
  const [engagementTimeline, setEngagementTimeline] = useState<any[]>([]);
  const [followerGrowth, setFollowerGrowth] = useState<any[]>([]);
  const [platformComparison, setPlatformComparison] = useState<any[]>([]);
  const [formatBreakdown, setFormatBreakdown] = useState<any[]>([]);
  const [engagementDist, setEngagementDist] = useState<any[]>([]);
  const [bestTimeHeatmap, setBestTimeHeatmap] = useState<number[][]>([]);
  const [topPosts, setTopPosts] = useState<PostPerformance[]>([]);
  const [abResults, setAbResults] = useState<any[]>([]);

  const isPremium = tier === 'paid';
  const { timezone } = useTimezone();

  useEffect(() => {
    if (user) loadAnalytics();
    else setLoading(false);
  }, [user, timeRange]);

  const handleTimeRangeChange = (range: '7d' | '30d' | '90d') => {
    if (!isPremium && (range === '30d' || range === '90d')) {
      setPaywallFeature('Extended Analytics (30 and 90 day views)');
      setShowPaywall(true);
      return;
    }
    setTimeRange(range);
  };

  const loadAnalytics = async () => {
    if (!user) return;
    setLoading(true);

    const days = isPremium ? (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90) : 7;
    const startDate = subDays(new Date(), days).toISOString().split('T')[0];

    const [metricsRes, postsRes] = await Promise.all([
      supabase
        .from('platform_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .order('date', { ascending: true }),
      supabase
        .from('content_posts')
        .select('id, platform, caption, published_date, likes, comments, views, saves, shares, media_type, thumbnail_url, instagram_post_id, youtube_video_id, tiktok_post_id')
        .eq('user_id', user.id)
        .eq('status', 'published')
        .gte('published_date', startDate)
        .order('likes', { ascending: false })
        .limit(isPremium ? 20 : 5),
    ]);

    const metrics = metricsRes.data || [];
    const posts = postsRes.data || [];

    // ── Summary stats ──
    const totalLikes = metrics.reduce((s, m) => s + (m.total_likes || 0), 0);
    const totalComments = metrics.reduce((s, m) => s + (m.total_comments || 0), 0);
    const totalEngagement = totalLikes + totalComments;
    const latestFollowers = metrics[metrics.length - 1]?.followers_count || 0;

    const mid = Math.floor(metrics.length / 2);
    const first = metrics.slice(0, mid);
    const second = metrics.slice(mid);
    const calcChange = (a: number, b: number) => (a > 0 ? ((b - a) / a) * 100 : 0);

    const firstLikes = first.reduce((s, m) => s + (m.total_likes || 0), 0);
    const secondLikes = second.reduce((s, m) => s + (m.total_likes || 0), 0);
    const firstComments = first.reduce((s, m) => s + (m.total_comments || 0), 0);
    const secondComments = second.reduce((s, m) => s + (m.total_comments || 0), 0);
    const firstFollowers = first[0]?.followers_count || 0;

    setSummaryStats({
      totalEngagement,
      engagementChange: calcChange(firstLikes + firstComments, secondLikes + secondComments),
      totalLikes,
      likesChange: calcChange(firstLikes, secondLikes),
      totalComments,
      commentsChange: calcChange(firstComments, secondComments),
      totalFollowers: latestFollowers,
      followersChange: calcChange(firstFollowers, latestFollowers),
    });

    // ── Engagement timeline (daily, all platforms combined) ──
    const dailyMap: Record<string, { date: string; likes: number; comments: number; engagement: number; followers: number }> = {};
    for (const m of metrics) {
      const d = format(parseISO(m.date), 'MMM dd');
      if (!dailyMap[d]) dailyMap[d] = { date: d, likes: 0, comments: 0, engagement: 0, followers: 0 };
      dailyMap[d].likes += m.total_likes || 0;
      dailyMap[d].comments += m.total_comments || 0;
      dailyMap[d].engagement += (m.total_likes || 0) + (m.total_comments || 0);
      dailyMap[d].followers = Math.max(dailyMap[d].followers, m.followers_count || 0);
    }
    setEngagementTimeline(Object.values(dailyMap));

    // ── Follower growth over time by platform ──
    const followerMap: Record<string, Record<string, number>> = {};
    for (const m of metrics) {
      const d = format(parseISO(m.date), 'MMM dd');
      if (!followerMap[d]) followerMap[d] = { date: d } as any;
      followerMap[d][m.platform] = m.followers_count || 0;
    }
    setFollowerGrowth(Object.values(followerMap));

    // ── Platform comparison ──
    const platMap: Record<string, any> = {};
    for (const m of metrics) {
      if (!platMap[m.platform]) platMap[m.platform] = { platform: m.platform, likes: 0, comments: 0, followers: 0 };
      platMap[m.platform].likes += m.total_likes || 0;
      platMap[m.platform].comments += m.total_comments || 0;
      platMap[m.platform].followers = Math.max(platMap[m.platform].followers, m.followers_count || 0);
    }
    setPlatformComparison(Object.values(platMap));

    // ── Format breakdown from posts ──
    const formatMap: Record<string, { name: string; engagement: number; count: number }> = {};
    for (const p of posts) {
      const type = p.media_type?.toLowerCase() || 'image';
      const label = type.includes('video') || type === 'reel' ? 'Video/Reel' : type === 'carousel' ? 'Carousel' : 'Photo';
      if (!formatMap[label]) formatMap[label] = { name: label, engagement: 0, count: 0 };
      formatMap[label].engagement += (p.likes || 0) + (p.comments || 0);
      formatMap[label].count += 1;
    }
    // Average engagement per format
    setFormatBreakdown(
      Object.values(formatMap).map((f) => ({
        name: f.name,
        avgEngagement: f.count > 0 ? Math.round(f.engagement / f.count) : 0,
        posts: f.count,
      }))
    );

    // ── Engagement distribution ──
    const totalL = posts.reduce((s, p) => s + (p.likes || 0), 0);
    const totalC = posts.reduce((s, p) => s + (p.comments || 0), 0);
    const totalS = posts.reduce((s, p) => s + (p.saves || 0), 0);
    const totalSh = posts.reduce((s, p) => s + (p.shares || 0), 0);
    const distData = [
      { name: 'Likes', value: totalL, color: '#E4405F' },
      { name: 'Comments', value: totalC, color: '#3b82f6' },
      { name: 'Saves', value: totalS, color: '#8b5cf6' },
      { name: 'Shares', value: totalSh, color: '#10b981' },
    ].filter((d) => d.value > 0);
    setEngagementDist(distData);

    // ── Best time to post heatmap (day × hour grid) ──
    // 7 days × 24 hours — uses user's timezone so hours reflect local time
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    for (const p of posts) {
      if (!p.published_date) continue;
      try {
        const { day, hour } = getLocalDayAndHour(p.published_date, timezone);
        const eng = (p.likes || 0) + (p.comments || 0);
        grid[day][hour] += eng;
      } catch (_) { /* skip invalid dates */ }
    }
    setBestTimeHeatmap(grid);

    // ── Top posts ──
    const buildPermalink = (p: any): string | null => {
      if (p.instagram_post_id) return `https://www.instagram.com/p/${p.instagram_post_id}/`;
      if (p.youtube_video_id) return `https://www.youtube.com/watch?v=${p.youtube_video_id}`;
      if (p.tiktok_post_id) return `https://www.tiktok.com/@user/video/${p.tiktok_post_id}`;
      return null;
    };

    setTopPosts(
      posts.slice(0, isPremium ? 10 : 3).map((p: any) => ({
        id: p.id,
        platform: p.platform,
        caption: p.caption || '',
        thumbnail_url: p.thumbnail_url || null,
        permalink: buildPermalink(p),
        media_type: p.media_type || 'image',
        views: p.views || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
        engagement: (p.likes || 0) + (p.comments || 0),
        engagement_rate: p.views > 0 ? (((p.likes || 0) + (p.comments || 0)) / p.views) * 100 : 0,
        published_at: p.published_date || '',
      }))
    );

    // ── A/B test results ──
    // Fetch published posts that have an ab_pair_id and group by pair
    const { data: abPosts } = await supabase
      .from('content_posts')
      .select('id, ab_pair_id, ab_test_group, platform, caption, published_date, likes, comments, views, scheduled_date')
      .eq('user_id', user.id)
      .eq('status', 'published')
      .not('ab_pair_id', 'is', null);

    if (abPosts && abPosts.length > 0) {
      const pairMap: Record<string, { A?: any; B?: any }> = {};
      for (const p of abPosts) {
        if (!pairMap[p.ab_pair_id]) pairMap[p.ab_pair_id] = {};
        pairMap[p.ab_pair_id][p.ab_test_group as 'A' | 'B'] = p;
      }
      const pairs = Object.values(pairMap).filter((pair) => pair.A && pair.B);
      setAbResults(pairs);
    } else {
      setAbResults([]);
    }

    setLoading(false);
  };

  const getPlatformIcon = (p: string) => {
    if (p === 'instagram') return Instagram;
    if (p === 'youtube') return Youtube;
    if (p === 'threads') return ThreadsIcon;
    return TrendingUp;
  };

  const getFormatIcon = (type: string) => {
    if (type.toLowerCase().includes('video') || type.toLowerCase() === 'reel') return Film;
    if (type.toLowerCase() === 'carousel') return Layers;
    return ImageIcon;
  };

  // Heatmap max for normalizing cell opacity
  const heatmapMax = Math.max(1, ...bestTimeHeatmap.flat());

  // ── Performance benchmarks ──
  // Engagement rate benchmarks (engagement / followers) per period
  const engagementRate = summaryStats.totalFollowers > 0
    ? (summaryStats.totalEngagement / summaryStats.totalFollowers) * 100
    : 0;

  const getBenchmark = (rate: number): { label: string; color: string; tip: string } => {
    if (rate >= 3) return { label: 'Excellent', color: 'text-emerald-600 bg-emerald-50', tip: 'Top 10% of creators. Keep doing what you\'re doing!' };
    if (rate >= 1) return { label: 'Good', color: 'text-blue-600 bg-blue-50', tip: 'Above average. Posting consistently and engaging with comments will push this higher.' };
    if (rate >= 0.5) return { label: 'Average', color: 'text-amber-600 bg-amber-50', tip: 'Industry average. Try posting at your best times and experimenting with content formats.' };
    if (rate > 0) return { label: 'Needs Work', color: 'text-red-600 bg-red-50', tip: 'Below average. Focus on posting when your audience is active and improving captions.' };
    return { label: 'No data', color: 'text-muted-foreground bg-muted', tip: 'Not enough data yet.' };
  };

  const benchmark = getBenchmark(engagementRate);

  const hasData = summaryStats.totalEngagement > 0 || summaryStats.totalFollowers > 0 || topPosts.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  // Safari safety valve: force loading=false after 5s if fetch hangs
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Audience Growth</h1>
          <p className="text-sm text-muted-foreground mt-1">Deep performance analytics across all connected platforms</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['7d', '30d', '90d'] as const).map((range) => {
            const locked = !isPremium && range !== '7d';
            return (
              <button
                key={range}
                onClick={() => handleTimeRangeChange(range)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                  timeRange === range
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card border border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                {locked && <Lock className="w-3 h-3" />}
              </button>
            );
          })}
          {!isPremium && (
            <button
              onClick={() => { setPaywallFeature('Full Analytics Access'); setShowPaywall(true); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg transition-all flex items-center gap-2"
            >
              <Crown className="w-4 h-4" />
              Upgrade
            </button>
          )}
        </div>
      </div>

      {!hasData ? (
        <div className="p-16 rounded-xl text-center bg-card border border-border">
          <TrendingUp className="w-16 h-16 mx-auto mb-4 text-muted-foreground/40" />
          <h3 className="text-xl font-bold mb-2 text-foreground">No analytics data yet</h3>
          <p className="text-muted-foreground">Connect your accounts in Settings and sync to start tracking performance.</p>
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Engagement', value: summaryStats.totalEngagement, change: summaryStats.engagementChange, icon: TrendingUp, color: 'text-primary', bg: 'bg-primary/10' },
              { label: 'Likes', value: summaryStats.totalLikes, change: summaryStats.likesChange, icon: Heart, color: 'text-pink-500', bg: 'bg-pink-500/10' },
              { label: 'Comments', value: summaryStats.totalComments, change: summaryStats.commentsChange, icon: MessageCircle, color: 'text-blue-500', bg: 'bg-blue-500/10' },
              { label: 'Followers', value: summaryStats.totalFollowers, change: summaryStats.followersChange, icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
            ].map(({ label, value, change, icon: Icon, color, bg }) => (
              <div key={label} className="p-5 rounded-xl bg-card border border-border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  {change !== 0 && (
                    <span className={`text-xs font-semibold flex items-center gap-0.5 ${change > 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                      {change > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                      {Math.abs(change).toFixed(1)}%
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Performance benchmark card */}
          {summaryStats.totalFollowers > 0 && (
            <div className={`px-5 py-4 rounded-xl border flex items-start gap-4 ${benchmark.color}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${benchmark.color}`}>
                    {benchmark.label}
                  </span>
                  <span className="text-sm font-semibold">
                    {engagementRate.toFixed(2)}% engagement rate
                  </span>
                </div>
                <p className="text-xs opacity-80">{benchmark.tip}</p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[10px] opacity-60 mb-0.5">vs. Industry</p>
                <div className="flex items-center gap-1 text-[11px] font-medium">
                  <span className="opacity-60">0.5%</span>
                  <span className="opacity-40">avg</span>
                  <span className="opacity-60 ml-1">3%</span>
                  <span className="opacity-40">top</span>
                </div>
              </div>
            </div>
          )}

          {/* Engagement over time */}
          <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
            <h3 className="text-lg font-bold text-foreground mb-5">Engagement Over Time</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={engagementTimeline} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }} />
                <Legend />
                <Line type="monotone" dataKey="engagement" name="Total Engagement" stroke="#7c3aed" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="likes" name="Likes" stroke="#E4405F" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="comments" name="Comments" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Follower Growth by Platform */}
          {followerGrowth.length > 1 && (
            <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
              <h3 className="text-lg font-bold text-foreground mb-5">Follower Growth by Platform</h3>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={followerGrowth} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }} />
                  <Legend />
                  {Object.keys(PLATFORM_COLORS).map((p) => (
                    followerGrowth.some((d) => d[p] > 0) && (
                      <Line key={p} type="monotone" dataKey={p} name={p.charAt(0).toUpperCase() + p.slice(1)}
                        stroke={PLATFORM_COLORS[p]} strokeWidth={2} dot={false} />
                    )
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Platform comparison + Engagement distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
              <h3 className="text-lg font-bold text-foreground mb-5">Platform Comparison</h3>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={platformComparison} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="platform" stroke="#94a3b8" tick={{ fontSize: 11 }}
                    tickFormatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }} />
                  <Legend />
                  <Bar dataKey="likes" name="Likes" fill="#E4405F" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="comments" name="Comments" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {engagementDist.length > 0 && (
              <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
                <h3 className="text-lg font-bold text-foreground mb-5">Engagement Breakdown</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={engagementDist} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                      {engagementDist.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }}
                      formatter={(v: any) => v.toLocaleString()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Content format performance */}
          {formatBreakdown.length > 0 && (
            <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
              <h3 className="text-lg font-bold text-foreground mb-2">Content Format Performance</h3>
              <p className="text-sm text-muted-foreground mb-5">Average engagement per post by format</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                {formatBreakdown.map((f) => {
                  const Icon = getFormatIcon(f.name);
                  return (
                    <div key={f.name} className="p-4 rounded-xl bg-muted text-center">
                      <Icon className="w-8 h-8 mx-auto mb-2 text-primary" />
                      <p className="text-xs text-muted-foreground mb-1">{f.name}</p>
                      <p className="text-2xl font-bold text-foreground">{f.avgEngagement.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">avg engagement · {f.posts} posts</p>
                    </div>
                  );
                })}
              </div>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={formatBreakdown} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '0.75rem' }} />
                  <Bar dataKey="avgEngagement" name="Avg Engagement" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Best time to post heatmap */}
          {topPosts.length > 2 && (
            <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
              <h3 className="text-lg font-bold text-foreground mb-1">Best Time to Post</h3>
              <p className="text-sm text-muted-foreground mb-5">Engagement intensity by day and hour (darker = higher engagement)</p>
              <div className="overflow-x-auto">
                <div className="min-w-[640px]">
                  {/* Hour labels */}
                  <div className="flex mb-1 ml-10">
                    {HOUR_LABELS.map((h, i) => (
                      <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">{i % 3 === 0 ? h : ''}</div>
                    ))}
                  </div>
                  {bestTimeHeatmap.map((dayRow, dayIdx) => (
                    <div key={dayIdx} className="flex items-center gap-0 mb-0.5">
                      <span className="w-10 text-xs text-muted-foreground text-right pr-2 flex-shrink-0">{DAY_LABELS[dayIdx]}</span>
                      {dayRow.map((val, hourIdx) => {
                        const intensity = val / heatmapMax;
                        return (
                          <div
                            key={hourIdx}
                            className="flex-1 h-6 rounded-sm mx-px"
                            style={{
                              backgroundColor: intensity > 0
                                ? `rgba(124, 58, 237, ${0.08 + intensity * 0.85})`
                                : 'hsl(var(--muted))',
                            }}
                            title={`${DAY_LABELS[dayIdx]} ${HOUR_LABELS[hourIdx]}: ${val} engagement`}
                          />
                        );
                      })}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-3 ml-10">
                    <span className="text-xs text-muted-foreground">Low</span>
                    {[0.1, 0.3, 0.5, 0.7, 0.9].map((i) => (
                      <div key={i} className="w-6 h-4 rounded-sm" style={{ backgroundColor: `rgba(124, 58, 237, ${i})` }} />
                    ))}
                    <span className="text-xs text-muted-foreground">High</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top posts */}
          <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-bold text-foreground">Top Performing Posts</h3>
                <p className="text-sm text-muted-foreground mt-0.5">Ranked by engagement in selected period</p>
              </div>
              {!isPremium && (
                <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Top 3 only
                </span>
              )}
            </div>
            {topPosts.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground text-sm">No published posts found in this period.</p>
            ) : (
              <div className="space-y-3">
                {topPosts.map((post, idx) => {
                  const PlatIcon = getPlatformIcon(post.platform);
                  const FmtIcon = getFormatIcon(post.media_type);
                  return (
                    <div key={post.id} className="flex items-start gap-4 p-4 rounded-xl bg-muted hover:bg-muted/80 transition-colors">
                      {/* Rank */}
                      <div className="w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                        {idx + 1}
                      </div>
                      {/* Thumbnail */}
                      {post.thumbnail_url ? (
                        <img
                          src={post.thumbnail_url}
                          alt="Post"
                          className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-card border border-border flex items-center justify-center flex-shrink-0">
                          <FmtIcon className="w-6 h-6 text-muted-foreground" />
                        </div>
                      )}
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <PlatIcon className={`w-4 h-4 flex-shrink-0`}
                            style={{ color: PLATFORM_COLORS[post.platform] || '#64748b' }} />
                          <FmtIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                          {post.published_at && (
                            <span className="text-xs text-muted-foreground">
                              {format(parseISO(post.published_at), 'MMM d')}
                            </span>
                          )}
                          {post.permalink && (
                            <a href={post.permalink} target="_blank" rel="noopener noreferrer"
                              className="ml-auto text-primary hover:text-primary/80 flex-shrink-0"
                              title="View post">
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2 mb-2">{post.caption || 'No caption'}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="w-3 h-3 text-pink-500" />{post.likes.toLocaleString()}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3 text-blue-500" />{post.comments.toLocaleString()}</span>
                          <span className="font-semibold text-emerald-600">{post.engagement.toLocaleString()} total</span>
                          {post.engagement_rate > 0 && (
                            <span className="text-violet-600 font-medium">{post.engagement_rate.toFixed(1)}% rate</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {!isPremium && (
                  <button
                    onClick={() => { setPaywallFeature('Full Top Posts Analytics'); setShowPaywall(true); }}
                    className="w-full py-3 rounded-xl border-2 border-dashed border-orange-500/30 bg-orange-500/5 text-orange-600 text-sm font-medium hover:bg-orange-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" /> View All Top Posts (Premium)
                  </button>
                )}
              </div>
            )}
          </div>
          {/* A/B test results */}
          {abResults.length > 0 && (
            <div className="p-6 rounded-xl bg-card border border-border shadow-sm">
              <h3 className="text-lg font-bold text-foreground mb-1">A/B Time Test Results</h3>
              <p className="text-sm text-muted-foreground mb-5">Compare engagement between your two scheduled time slots</p>
              <div className="space-y-4">
                {abResults.map((pair, idx) => {
                  const a = pair.A;
                  const b = pair.B;
                  const engA = (a.likes || 0) + (a.comments || 0);
                  const engB = (b.likes || 0) + (b.comments || 0);
                  const winner = engA > engB ? 'A' : engB > engA ? 'B' : null;
                  return (
                    <div key={idx} className="rounded-xl border border-border overflow-hidden">
                      <div className="px-4 py-2 bg-muted text-xs font-semibold text-muted-foreground uppercase">
                        Test #{idx + 1} — {a.platform}
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-border">
                        {[a, b].map((post, vi) => {
                          const label = vi === 0 ? 'A' : 'B';
                          const eng = (post.likes || 0) + (post.comments || 0);
                          const isWinner = winner === label;
                          return (
                            <div key={label} className={`p-4 ${isWinner ? 'bg-emerald-50' : ''}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isWinner ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground'}`}>
                                  Version {label} {isWinner ? '🏆' : ''}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-1">
                                {post.scheduled_date ? formatInTz(post.scheduled_date, timezone) : 'Unknown time'}
                              </p>
                              <p className="text-sm text-foreground line-clamp-2 mb-2">{post.caption || 'No caption'}</p>
                              <div className="flex gap-3 text-sm">
                                <span className="text-pink-500 font-semibold">{(post.likes || 0)} likes</span>
                                <span className="text-blue-500 font-semibold">{(post.comments || 0)} comments</span>
                                <span className="font-bold text-foreground">{eng} total</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} feature={paywallFeature} />
    </div>
  );
}
