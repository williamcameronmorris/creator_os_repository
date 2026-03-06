import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { TrendingUp, Eye, Heart, MessageCircle, Users, Instagram, Youtube, Sparkles, ArrowUp, ArrowDown, Calendar, Lock, Crown } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format, subDays } from 'date-fns';
import { PaywallModal } from '../components/PaywallModal';

interface Metrics {
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  totalFollowers: number;
  engagementRate: number;
  viewsChange: number;
  likesChange: number;
  commentsChange: number;
  followersChange: number;
}

interface PlatformMetric {
  platform: string;
  date: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  followers: number;
}

interface PostPerformance {
  id: string;
  platform: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  engagement_rate: number;
  published_at: string;
}

const PLATFORM_COLORS = {
  instagram: '#E4405F',
  tiktok: '#000000',
  youtube: '#FF0000',
};

export function Analytics() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const { darkMode } = useTheme();
  const [metrics, setMetrics] = useState<Metrics>({
    totalViews: 0,
    totalLikes: 0,
    totalComments: 0,
    totalFollowers: 0,
    engagementRate: 0,
    viewsChange: 0,
    likesChange: 0,
    commentsChange: 0,
    followersChange: 0,
  });
  const [timelineData, setTimelineData] = useState<any[]>([]);
  const [platformData, setPlatformData] = useState<any[]>([]);
  const [topPosts, setTopPosts] = useState<PostPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallFeature, setPaywallFeature] = useState('');

  const isPremium = tier === 'paid';

  useEffect(() => {
    if (user) {
      loadAnalytics();
    }
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

    const days = isPremium ? (timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90) : 7;
    const startDate = subDays(new Date(), days).toISOString();

    const [metricsRes, postsRes, platformMetricsRes] = await Promise.all([
      supabase
        .from('platform_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
        .order('date', { ascending: true }),

      supabase
        .from('post_analytics')
        .select('*, content_posts!inner(platform, caption, published_at)')
        .eq('content_posts.user_id', user.id)
        .order('engagement_rate', { ascending: false })
        .limit(isPremium ? 10 : 3),

      supabase
        .from('platform_metrics')
        .select('*')
        .eq('user_id', user.id)
        .gte('date', startDate)
    ]);

    if (metricsRes.data) {
      const totalViews = metricsRes.data.reduce((sum, m) => sum + (m.views || 0), 0);
      const totalLikes = metricsRes.data.reduce((sum, m) => sum + (m.likes || 0), 0);
      const totalComments = metricsRes.data.reduce((sum, m) => sum + (m.comments || 0), 0);
      const latestFollowers = metricsRes.data[metricsRes.data.length - 1]?.followers || 0;
      const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews) * 100 : 0;

      const midpoint = Math.floor(metricsRes.data.length / 2);
      const firstHalf = metricsRes.data.slice(0, midpoint);
      const secondHalf = metricsRes.data.slice(midpoint);

      const firstViews = firstHalf.reduce((sum, m) => sum + (m.views || 0), 0);
      const secondViews = secondHalf.reduce((sum, m) => sum + (m.views || 0), 0);
      const viewsChange = firstViews > 0 ? ((secondViews - firstViews) / firstViews) * 100 : 0;

      const firstLikes = firstHalf.reduce((sum, m) => sum + (m.likes || 0), 0);
      const secondLikes = secondHalf.reduce((sum, m) => sum + (m.likes || 0), 0);
      const likesChange = firstLikes > 0 ? ((secondLikes - firstLikes) / firstLikes) * 100 : 0;

      const firstComments = firstHalf.reduce((sum, m) => sum + (m.comments || 0), 0);
      const secondComments = secondHalf.reduce((sum, m) => sum + (m.comments || 0), 0);
      const commentsChange = firstComments > 0 ? ((secondComments - firstComments) / firstComments) * 100 : 0;

      const firstFollowers = firstHalf[0]?.followers || 0;
      const followersChange = firstFollowers > 0 ? ((latestFollowers - firstFollowers) / firstFollowers) * 100 : 0;

      setMetrics({
        totalViews,
        totalLikes,
        totalComments,
        totalFollowers: latestFollowers,
        engagementRate,
        viewsChange,
        likesChange,
        commentsChange,
        followersChange,
      });

      const dailyData = metricsRes.data.reduce((acc: any, curr) => {
        const date = format(new Date(curr.date), 'MMM dd');
        const existing = acc.find((d: any) => d.date === date);
        if (existing) {
          existing.views += curr.views || 0;
          existing.likes += curr.likes || 0;
          existing.comments += curr.comments || 0;
        } else {
          acc.push({
            date,
            views: curr.views || 0,
            likes: curr.likes || 0,
            comments: curr.comments || 0,
          });
        }
        return acc;
      }, []);
      setTimelineData(dailyData);
    }

    if (platformMetricsRes.data) {
      const platformTotals = platformMetricsRes.data.reduce((acc: any, curr) => {
        const platform = curr.platform;
        if (!acc[platform]) {
          acc[platform] = { platform, views: 0, likes: 0, comments: 0 };
        }
        acc[platform].views += curr.views || 0;
        acc[platform].likes += curr.likes || 0;
        acc[platform].comments += curr.comments || 0;
        return acc;
      }, {});
      setPlatformData(Object.values(platformTotals));
    }

    if (postsRes.data) {
      setTopPosts(postsRes.data.map((p: any) => ({
        id: p.post_id,
        platform: p.content_posts.platform,
        caption: p.content_posts.caption,
        views: p.views || 0,
        likes: p.likes || 0,
        comments: p.comments || 0,
        engagement_rate: p.engagement_rate || 0,
        published_at: p.content_posts.published_at,
      })));
    }

    setLoading(false);
  };

  const metricCards = [
    { label: 'Total Views', value: metrics.totalViews, change: metrics.viewsChange, icon: Eye, color: 'sky' },
    { label: 'Total Likes', value: metrics.totalLikes, change: metrics.likesChange, icon: Heart, color: 'red' },
    { label: 'Comments', value: metrics.totalComments, change: metrics.commentsChange, icon: MessageCircle, color: 'blue' },
    { label: 'Followers', value: metrics.totalFollowers, change: metrics.followersChange, icon: Users, color: 'green' },
  ];

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram': return Instagram;
      case 'youtube': return Youtube;
      case 'tiktok': return Sparkles;
      default: return TrendingUp;
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="p-8 rounded-xl text-center bg-card border border-border">
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  const hasData = metrics.totalViews > 0 || metrics.totalLikes > 0 || metrics.totalComments > 0;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Audience Growth
            </h1>
            <p className="text-muted-foreground">
              Track your content performance across all platforms
            </p>
          </div>
          <div className="flex items-center gap-2">
            {['7d', '30d', '90d'].map((range) => {
              const isLocked = !isPremium && (range === '30d' || range === '90d');
              return (
                <button
                  key={range}
                  onClick={() => handleTimeRangeChange(range as any)}
                  className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm relative ${
                    timeRange === range
                      ? 'bg-primary text-primary-foreground'
                      : isLocked
                      ? 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                      : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                    {isLocked && <Lock className="w-3.5 h-3.5" />}
                  </span>
                </button>
              );
            })}
            {!isPremium && (
              <button
                onClick={() => {
                  setPaywallFeature('Full Analytics Access');
                  setShowPaywall(true);
                }}
                className="ml-2 px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg transition-all flex items-center gap-2"
              >
                <Crown className="w-4 h-4" />
                Upgrade
              </button>
            )}
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="p-12 rounded-xl text-center bg-card border border-border shadow-md">
          <TrendingUp className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-bold mb-2 text-foreground">
            No analytics data yet
          </h3>
          <p className="text-muted-foreground">
            Connect your social media accounts in Settings to start tracking performance
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              const isPositive = metric.change >= 0;
              return (
                <div
                  key={metric.label}
                  className="p-6 rounded-xl bg-card border border-border shadow-md hover:shadow-lg transition-shadow"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                      metric.color === 'sky' ? 'bg-chart-1/20' :
                      metric.color === 'red' ? 'bg-chart-2/20' :
                      metric.color === 'blue' ? 'bg-chart-3/20' :
                      'bg-emerald-500/20'
                    }`}>
                      <Icon className={`w-6 h-6 ${
                        metric.color === 'sky' ? 'text-chart-1' :
                        metric.color === 'red' ? 'text-chart-2' :
                        metric.color === 'blue' ? 'text-chart-3' :
                        'text-emerald-500 dark:text-emerald-400'
                      }`} />
                    </div>
                    {metric.change !== 0 && (
                      <div className={`flex items-center gap-1 text-sm font-medium ${
                        isPositive ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                      }`}>
                        {isPositive ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
                        {Math.abs(metric.change).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">
                    {metric.label}
                  </p>
                  <p className="text-2xl font-bold text-foreground">
                    {metric.value.toLocaleString()}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="p-6 rounded-xl bg-card border border-border shadow-md">
            <h3 className="text-lg font-bold mb-6 text-foreground">
              Performance Over Time
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="date" stroke={darkMode ? '#94a3b8' : '#64748b'} />
                <YAxis stroke={darkMode ? '#94a3b8' : '#64748b'} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                    border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                    borderRadius: '0.75rem',
                    color: darkMode ? '#ffffff' : '#0f172a',
                  }}
                />
                <Line type="monotone" dataKey="views" stroke="#0ea5e9" strokeWidth={2} />
                <Line type="monotone" dataKey="likes" stroke="#ef4444" strokeWidth={2} />
                <Line type="monotone" dataKey="comments" stroke="#3b82f6" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-card border border-border shadow-md">
              <h3 className="text-lg font-bold mb-6 text-foreground">
                Platform Performance
              </h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={platformData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} />
                  <XAxis dataKey="platform" stroke={darkMode ? '#94a3b8' : '#64748b'} />
                  <YAxis stroke={darkMode ? '#94a3b8' : '#64748b'} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: darkMode ? '#1e293b' : '#ffffff',
                      border: `1px solid ${darkMode ? '#334155' : '#e2e8f0'}`,
                      borderRadius: '0.75rem',
                      color: darkMode ? '#ffffff' : '#0f172a',
                    }}
                  />
                  <Bar dataKey="views" fill="#0ea5e9" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-6 rounded-xl bg-card border border-border shadow-md relative">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-foreground">
                  Top Performing Posts
                </h3>
                {!isPremium && topPosts.length > 0 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Limited
                  </span>
                )}
              </div>
              <div className="space-y-4">
                {topPosts.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    No published posts yet
                  </p>
                ) : (
                  topPosts.map((post) => {
                    const Icon = getPlatformIcon(post.platform);
                    return (
                      <div key={post.id} className="p-4 rounded-lg bg-muted hover:bg-muted/80 transition-colors">
                        <div className="flex items-start gap-3">
                          <Icon className="w-5 h-5 text-chart-1 flex-shrink-0 mt-1" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm line-clamp-2 mb-2 text-foreground">
                              {post.caption}
                            </p>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-muted-foreground">
                                {post.views.toLocaleString()} views
                              </span>
                              <span className="text-muted-foreground">
                                {post.likes.toLocaleString()} likes
                              </span>
                              <span className="text-emerald-500 dark:text-emerald-400 font-medium">
                                {post.engagement_rate.toFixed(1)}% engagement
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                {!isPremium && topPosts.length > 0 && (
                  <button
                    onClick={() => {
                      setPaywallFeature('Full Top Posts Analytics (10 posts vs 3)');
                      setShowPaywall(true);
                    }}
                    className="w-full py-3 px-4 rounded-lg border-2 border-dashed border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400 font-medium hover:bg-orange-500/10 transition-colors flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    View All Top Posts (Premium)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature={paywallFeature}
      />
    </div>
  );
}
