import { useState, useEffect } from 'react';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import { generateInsights, getStoredInsights, saveInsights, type Insight } from '../lib/analyticsInsights';
import { PaywallModal } from './PaywallModal';
import {
  TrendingUp,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Instagram,
  Youtube,
  Video,
  RefreshCw,
  Lock,
  Crown,
} from 'lucide-react';
import { ThreadsIcon } from './icons/ThreadsIcon';

interface ActionDashboardProps {
  onNavigate: (path: string) => void;
  embedded?: boolean;
}

export default function ActionDashboard({ onNavigate, embedded = false }: ActionDashboardProps) {
  const { tier } = useSubscription();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [connectedPlatforms, setConnectedPlatforms] = useState<Set<string>>(new Set());
  const isPremium = tier === 'paid';

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('instagram_access_token, instagram_business_account_id, tiktok_access_token, youtube_access_token, threads_access_token')
        .eq('id', user.id)
        .maybeSingle();

      const { data: credentials } = await supabase
        .from('platform_credentials')
        .select('platform')
        .eq('user_id', user.id)
        .eq('is_active', true);

      const connected = new Set<string>([
        ...(credentials || []).map((c: { platform: string }) => c.platform),
        ...(profile?.instagram_access_token || profile?.instagram_business_account_id ? ['instagram'] : []),
        ...(profile?.tiktok_access_token ? ['tiktok'] : []),
        ...(profile?.youtube_access_token ? ['youtube'] : []),
        ...(profile?.threads_access_token ? ['threads'] : []),
      ]);
      setConnectedPlatforms(connected);

      const storedInsights = await getStoredInsights(user.id);
      if (storedInsights.length === 0) {
        const newInsights = await generateInsights(user.id);
        await saveInsights(user.id, newInsights);
        setInsights(newInsights);
      } else {
        setInsights(storedInsights);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
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
      const syncPromises: Promise<Response>[] = [];
      if (profile?.instagram_access_token) {
        syncPromises.push(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ userId: user.id, accessToken: profile.instagram_access_token }),
          })
        );
      }
      if (profile?.tiktok_access_token) {
        syncPromises.push(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tiktok-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
            body: JSON.stringify({ userId: user.id, accessToken: profile.tiktok_access_token }),
          })
        );
      }
      if (profile?.youtube_access_token) {
        syncPromises.push(
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
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
      case 'instagram': return Instagram;
      case 'youtube': return Youtube;
      case 'tiktok': return Video;
      case 'threads': return ThreadsIcon;
      default: return TrendingUp;
    }
  };

  const getPriorityColors = (priority: string) => {
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
  const platforms = [
    { id: 'instagram', name: 'Instagram', icon: Instagram, iconBg: 'bg-gradient-to-br from-pink-500/20 to-purple-600/20', iconColor: 'text-pink-600' },
    { id: 'tiktok', name: 'TikTok', icon: Video, iconBg: 'bg-gradient-to-br from-slate-800/20 to-teal-500/20', iconColor: 'text-slate-800' },
    { id: 'youtube', name: 'YouTube', icon: Youtube, iconBg: 'bg-gradient-to-br from-red-600/20 to-red-700/20', iconColor: 'text-red-600' },
    { id: 'threads', name: 'Threads', icon: ThreadsIcon, iconBg: 'bg-gray-100', iconColor: 'text-gray-800' },
  ];

  const getPlatformInsights = (platformId: string) => insights.filter(i => i.platform === platformId);

  return (
    <div className="space-y-8 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {!embedded && (
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Command Center</h1>
            <p className="text-sm text-muted-foreground">Real-time insights and action items across your content and deals</p>
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isPremium && (
            <button onClick={() => setShowPaywall(true)} className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg transition-all text-sm whitespace-nowrap">
              <Crown className="w-4 h-4" />
              <span className="hidden sm:inline">Upgrade</span>
            </button>
          )}
          <button
            onClick={syncAllPlatforms}
            disabled={syncing}
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl font-semibold transition-all text-sm whitespace-nowrap ${isPremium ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'bg-card border border-border text-muted-foreground hover:bg-accent'} ${syncing ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {!isPremium && <Lock className="w-4 h-4" />}
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{syncing ? 'Syncing...' : isPremium ? 'Sync All' : 'Sync (Premium)'}</span>
            <span className="sm:hidden">{syncing ? 'Sync...' : 'Sync'}</span>
          </button>
        </div>
      </div>

      <div id="platform-priorities">
        <h2 className="text-2xl font-bold text-foreground mb-4">Platform Priorities</h2>
        <p className="text-muted-foreground mb-6">Select a platform to view AI-powered content suggestions and priorities</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {platforms.map((platform) => {
            const Icon = platform.icon;
            const platformInsights = getPlatformInsights(platform.id);
            const isSelected = selectedPlatform === platform.id;
            return (
              <button
                key={platform.id}
                onClick={() => setSelectedPlatform(isSelected ? null : platform.id)}
                className={`relative p-4 rounded-xl border-2 transition-all text-left overflow-hidden group ${isSelected ? 'border-primary bg-gradient-to-br from-primary/10 to-primary/5 shadow-lg' : 'border-border bg-card hover:border-primary/50 hover:shadow-md'}`}
              >
                <div className="relative z-10">
                  <div className={`${platform.iconBg} w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110`}>
                    <Icon className={`w-6 h-6 ${platform.iconColor}`} />
                  </div>
                  <h3 className="text-lg font-bold text-foreground mb-2">{platform.name}</h3>
                  <div className="flex flex-col gap-1 text-xs">
                    <div>
                      <span className="text-muted-foreground">Priorities: </span>
                      <span className="font-bold text-foreground">{platformInsights.length}</span>
                    </div>
                    {platformInsights.filter(i => i.priority === 'high').length > 0 && (
                      <div className="flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 text-destructive" />
                        <span className="font-semibold text-destructive">{platformInsights.filter(i => i.priority === 'high').length} High</span>
                      </div>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4" />
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
                    <h2 className="text-xl font-bold text-foreground">{platform?.name} Priorities</h2>
                    <p className="text-sm text-muted-foreground">AI-powered suggestions for your content strategy</p>
                  </div>
                </>
              );
            })()}
          </div>
          {getPlatformInsights(selectedPlatform).length === 0 ? (
            <div className="text-center py-12">
              <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              {connectedPlatforms.has(selectedPlatform) ? (
                <>
                  <p className="text-muted-foreground mb-2">No priorities yet for this platform</p>
                  <p className="text-sm text-muted-foreground mb-4">Post more content or sync to generate AI-powered insights</p>
                  <button onClick={syncAllPlatforms} disabled={syncing} className="px-4 py-2 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {syncing ? 'Syncing...' : 'Sync & Generate Insights'}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground mb-2">Platform not connected</p>
                  <p className="text-sm text-muted-foreground mb-4">Connect your account and post content to receive AI-powered insights</p>
                  <button onClick={() => onNavigate('/settings')} className="px-4 py-2 rounded-lg font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
                    Connect Platform
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {getPlatformInsights(selectedPlatform).map((insight) => {
                const Icon = getPlatformIcon(insight.platform);
                return (
                  <button key={insight.id} onClick={() => handleInsightClick(insight)} className="w-full text-left p-5 rounded-xl border border-border bg-card hover:bg-accent transition-all">
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-lg flex-shrink-0 bg-secondary">
                        <Icon className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-lg font-bold text-foreground">{insight.title}</h3>
                          <span className={`text-xs px-2.5 py-1.5 rounded-full font-semibold uppercase tracking-wide border ${getPriorityColors(insight.priority)}`}>{insight.priority}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>
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

      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} feature="Platform Sync & Full Insights" />
    </div>
  );
}
