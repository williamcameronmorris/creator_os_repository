import { useState, useEffect } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import { generateInsights, getStoredInsights, saveInsights, type Insight } from '../lib/analyticsInsights';
import { AnalyticsCTABanner } from './AnalyticsCTABanner';
import { PaywallModal } from './PaywallModal';
import {
  TrendingUp,
  AlertCircle,
  ArrowRight,
  DollarSign,
  CheckCircle,
  Calendar,
  Instagram,
  Youtube,
  Video,
  RefreshCw,
  ExternalLink,
  Bell,
  Briefcase,
  Eye,
  Heart,
  MessageCircle,
  Clock,
  Sparkles,
  Send,
  Lock,
  Crown,
} from 'lucide-react';

interface Deal {
  id: string;
  brand: string;
  requested_deliverables: string;
  final_amount: number;
  stage: string;
  payment_status: string;
  deal_stages?: { name: string };
}

interface ActionDashboardProps {
  onViewDeal: (dealId: string) => void;
  onNavigate: (path: string) => void;
  darkMode: boolean;
}

export default function ActionDashboard({ onViewDeal, onNavigate, darkMode }: ActionDashboardProps) {
  const { tier } = useSubscription();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [pipelineStats, setPipelineStats] = useState({
    totalValue: 0,
    activeDeals: 0,
    pendingPayment: 0,
  });
  const [socialStats, setSocialStats] = useState({
    totalViews: 0,
    totalEngagement: 0,
    scheduledPosts: 0,
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [aiQuery, setAiQuery] = useState('');
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);

  const isPremium = tier === 'paid';

  const placeholders = [
    "Ask your question here: Why did my engagements drop?",
    "Ask your question here: My last video performed great. Help me recreate it.",
    "Ask your question here: The brand isn't responding, what should I do now?"
  ];

  useEffect(() => {
    loadDashboardData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [placeholders.length]);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [storedInsights, dealsResult, metricsResult, postsResult] = await Promise.all([
        getStoredInsights(user.id),
        supabase
          .from('deals')
          .select('*, deal_stages(name)')
          .eq('user_id', user.id)
          .order('last_activity_at', { ascending: false }),
        supabase
          .from('platform_metrics')
          .select('views, likes, comments')
          .eq('user_id', user.id)
          .gte('date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from('content_posts')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'scheduled'),
      ]);

      if (storedInsights.length === 0) {
        const newInsights = await generateInsights(user.id);
        await saveInsights(user.id, newInsights);
        setInsights(newInsights);
      } else {
        setInsights(storedInsights);
      }

      if (dealsResult.data) {
        setDeals(dealsResult.data);
        calculatePipelineStats(dealsResult.data);
      }

      if (metricsResult.data) {
        const totalViews = metricsResult.data.reduce((sum, m) => sum + (m.views || 0), 0);
        const totalLikes = metricsResult.data.reduce((sum, m) => sum + (m.likes || 0), 0);
        const totalComments = metricsResult.data.reduce((sum, m) => sum + (m.comments || 0), 0);
        setSocialStats({
          totalViews,
          totalEngagement: totalLikes + totalComments,
          scheduledPosts: postsResult.data?.length || 0,
        });
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculatePipelineStats = (dealsData: Deal[]) => {
    const activeDeals = dealsData.filter(d => {
      const stageName = d.deal_stages?.name?.toLowerCase() || d.stage?.toLowerCase() || '';
      return stageName !== 'won' && stageName !== 'lost' && stageName !== 'closed';
    });

    const totalValue = activeDeals.reduce((sum, deal) => sum + (deal.final_amount || 0), 0);
    const pendingPayment = dealsData
      .filter(d => d.payment_status?.toLowerCase() === 'pending' || d.payment_status?.toLowerCase() === 'overdue')
      .reduce((sum, deal) => sum + (deal.final_amount || 0), 0);

    setPipelineStats({
      totalValue,
      activeDeals: activeDeals.length,
      pendingPayment,
    });
  };

  const syncAllPlatforms = async () => {
    if (!isPremium) {
      setShowPaywall(true);
      return;
    }
    setSyncing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('instagram_access_token, tiktok_access_token, youtube_access_token')
        .eq('id', user.id)
        .maybeSingle();

      const syncPromises = [];

      if (profile?.instagram_access_token) {
        syncPromises.push(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ userId: user.id, accessToken: profile.instagram_access_token }),
          })
        );
      }

      if (profile?.tiktok_access_token) {
        syncPromises.push(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tiktok-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ userId: user.id, accessToken: profile.tiktok_access_token }),
          })
        );
      }

      if (profile?.youtube_access_token) {
        syncPromises.push(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ userId: user.id, accessToken: profile.youtube_access_token }),
          })
        );
      }

      await Promise.all(syncPromises);

      const newInsights = await generateInsights(user.id);
      await saveInsights(user.id, newInsights);
      setInsights(newInsights);
    } catch (error) {
      console.error('Error syncing platforms:', error);
    } finally {
      setSyncing(false);
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return Instagram;
      case 'youtube':
        return Youtube;
      case 'tiktok':
        return Video;
      default:
        return TrendingUp;
    }
  };

  const getPriorityColors = (priority: string) => {
    if (darkMode) {
      return {
        high: 'bg-red-900/30 text-red-300 border-red-800',
        medium: 'bg-amber-900/30 text-amber-300 border-amber-800',
        low: 'bg-emerald-900/30 text-emerald-300 border-emerald-800',
      }[priority] || 'bg-card text-muted-foreground';
    }
    return {
      high: 'bg-red-50 text-red-700 border-red-200',
      medium: 'bg-amber-50 text-amber-700 border-amber-200',
      low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    }[priority] || 'bg-muted text-muted-foreground';
  };

  const handleInsightClick = (insight: Insight) => {
    if (insight.actionUrl) {
      onNavigate(insight.actionUrl);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const displayedInsights = isPremium ? insights : insights.slice(0, 3);
  const highPriorityInsights = displayedInsights.filter(i => i.priority === 'high');
  const mediumPriorityInsights = displayedInsights.filter(i => i.priority === 'medium');

  const platforms = [
    {
      id: 'instagram',
      name: 'Instagram',
      icon: Instagram,
      color: 'from-pink-500 to-purple-600',
      iconBg: 'bg-gradient-to-br from-pink-500/20 to-purple-600/20',
      iconColor: 'text-pink-600 dark:text-pink-400',
    },
    {
      id: 'tiktok',
      name: 'TikTok',
      icon: Video,
      color: 'from-slate-800 to-teal-500',
      iconBg: 'bg-gradient-to-br from-slate-800/20 to-teal-500/20',
      iconColor: 'text-slate-800 dark:text-teal-400',
    },
    {
      id: 'youtube',
      name: 'YouTube',
      icon: Youtube,
      color: 'from-red-600 to-red-700',
      iconBg: 'bg-gradient-to-br from-red-600/20 to-red-700/20',
      iconColor: 'text-red-600 dark:text-red-400',
    },
  ];

  const getPlatformInsights = (platformId: string) => {
    return insights.filter(i => i.platform === platformId);
  };

  const handleAiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Placeholder for future AI integration
    console.log('AI Query:', aiQuery);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Command Center
          </h1>
          <p className="text-muted-foreground">
            Real-time insights and action items across your content and deals
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isPremium && (
            <button
              onClick={() => setShowPaywall(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg transition-all"
            >
              <Crown className="w-4 h-4" />
              Upgrade
            </button>
          )}
          <button
            onClick={syncAllPlatforms}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all ${
              isPremium
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent'
            } ${syncing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {!isPremium && <Lock className="w-4 h-4" />}
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : isPremium ? 'Sync All' : 'Sync (Premium)'}
          </button>
        </div>
      </div>

      <div className="relative">
        <form onSubmit={handleAiSubmit} className="relative">
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-chart-1/10 to-chart-3/10 border-2 border-chart-1/30 shadow-lg backdrop-blur-sm">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-chart-1 to-chart-3 shadow-md">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <input
              type="text"
              value={aiQuery}
              onChange={(e) => setAiQuery(e.target.value)}
              placeholder={placeholders[placeholderIndex]}
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/70 focus:outline-none text-base"
            />
            <button
              type="submit"
              disabled
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/50 hover:bg-primary/70 transition-all cursor-not-allowed opacity-50"
              title="AI Assistant coming soon"
            >
              <Send className="w-5 h-5 text-primary-foreground" />
            </button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          AI Assistant coming soon - Your intelligent copilot for content and deals
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <button
          onClick={() => onNavigate('/revenue')}
          className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-chart-1/20 mb-3">
            <Briefcase className="w-5 h-5 text-chart-1" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">Pipeline Value</p>
          <p className="text-xl font-bold text-foreground">
            ${(pipelineStats.totalValue / 1000).toFixed(0)}k
          </p>
        </button>

        <button
          onClick={() => onNavigate('/pipeline')}
          className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-emerald-500/20 mb-3">
            <CheckCircle className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">Active Deals</p>
          <p className="text-xl font-bold text-foreground">
            {pipelineStats.activeDeals}
          </p>
        </button>

        <button
          onClick={() => onNavigate('/analytics')}
          className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-chart-3/20 mb-3">
            <Eye className="w-5 h-5 text-chart-3" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">Total Views</p>
          <p className="text-xl font-bold text-foreground">
            {(socialStats.totalViews / 1000).toFixed(1)}k
          </p>
        </button>

        <button
          onClick={() => onNavigate('/analytics')}
          className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-pink-500/20 mb-3">
            <Heart className="w-5 h-5 text-pink-500 dark:text-pink-400" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">Engagement</p>
          <p className="text-xl font-bold text-foreground">
            {(socialStats.totalEngagement / 1000).toFixed(1)}k
          </p>
        </button>

        <button
          onClick={() => onNavigate('/schedule')}
          className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-chart-2/20 mb-3">
            <Clock className="w-5 h-5 text-chart-2" />
          </div>
          <p className="text-xs text-muted-foreground mb-1">Scheduled</p>
          <p className="text-xl font-bold text-foreground">
            {socialStats.scheduledPosts}
          </p>
        </button>

        <button
          onClick={() => {
            const platformSection = document.getElementById('platform-priorities');
            platformSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
          className="p-4 rounded-xl bg-card border border-border hover:bg-accent transition-all cursor-pointer text-left shadow-md hover:shadow-lg"
        >
          <div className={`flex items-center justify-center w-10 h-10 rounded-lg mb-3 ${
            highPriorityInsights.length > 0 ? 'bg-amber-500/20' : 'bg-emerald-500/20'
          }`}>
            <Bell className={`w-5 h-5 ${
              highPriorityInsights.length > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'
            }`} />
          </div>
          <p className="text-xs text-muted-foreground mb-1">Action Items</p>
          <p className="text-xl font-bold text-foreground">
            {highPriorityInsights.length}
          </p>
        </button>
      </div>

      <div id="platform-priorities">
        <h2 className="text-2xl font-bold text-foreground mb-4">Platform Priorities</h2>
        <p className="text-muted-foreground mb-6">Select a platform to view AI-powered content suggestions and priorities</p>

        <div className="grid md:grid-cols-3 gap-6">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const platformInsights = getPlatformInsights(platform.id);
            const isSelected = selectedPlatform === platform.id;

            return (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(isSelected ? null : platform.id)}
                className={`relative p-8 rounded-2xl border-2 transition-all text-left overflow-hidden group ${
                  isSelected
                    ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg'
                    : 'border-border bg-card hover:border-primary/50 hover:shadow-md'
                }`}
              >
                <div className="relative z-10">
                  <div className={`${platform.iconBg} w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110`}>
                    <Icon className={`w-8 h-8 ${platform.iconColor}`} />
                  </div>

                  <h3 className="text-2xl font-bold text-foreground mb-2">{platform.name}</h3>

                  <div className="flex items-center gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Priorities: </span>
                      <span className="font-bold text-foreground">{platformInsights.length}</span>
                    </div>
                    {platformInsights.filter(i => i.priority === 'high').length > 0 && (
                      <div className="flex items-center gap-1">
                        <AlertCircle className="w-4 h-4 text-destructive" />
                        <span className="font-semibold text-destructive">
                          {platformInsights.filter(i => i.priority === 'high').length} High
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {isSelected && (
                  <div className="absolute top-4 right-4 bg-primary text-primary-foreground w-8 h-8 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedPlatform && (
        <div className="p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-3 mb-6">
            {(() => {
              const platform = platforms.find(p => p.id === selectedPlatform);
              const Icon = platform?.icon || TrendingUp;
              return (
                <>
                  <div className={`${platform?.iconBg} w-12 h-12 rounded-xl flex items-center justify-center`}>
                    <Icon className={`w-6 h-6 ${platform?.iconColor}`} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground">
                      {platform?.name} Priorities
                    </h2>
                    <p className="text-sm text-muted-foreground">AI-powered suggestions for your content strategy</p>
                  </div>
                </>
              );
            })()}
          </div>

          {getPlatformInsights(selectedPlatform).length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground mb-2">No priorities yet for this platform</p>
              <p className="text-sm text-muted-foreground mb-4">
                Connect your account and post content to receive AI-powered insights
              </p>
              <button
                onClick={() => onNavigate('/settings')}
                className="px-4 py-2 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Connect Platform
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {getPlatformInsights(selectedPlatform).map((insight) => {
                const Icon = getPlatformIcon(insight.platform);
                return (
                  <button
                    key={insight.id}
                    onClick={() => handleInsightClick(insight)}
                    className="w-full text-left p-5 rounded-xl border border-border bg-card hover:bg-accent transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 bg-secondary">
                        <Icon className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-lg font-bold text-foreground">
                            {insight.title}
                          </h3>
                          <span className={`text-xs px-2.5 py-1.5 rounded-full font-semibold uppercase tracking-wide border ${getPriorityColors(insight.priority)}`}>
                            {insight.priority}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">
                          {insight.description}
                        </p>
                        <div className="flex items-center gap-2 text-sm font-semibold text-chart-2">
                          {insight.action}
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="mt-12">
        <AnalyticsCTABanner />
      </div>

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="Platform Sync & Full Insights"
      />
    </div>
  );
}
