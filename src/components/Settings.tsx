import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { supabase, type Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Save, TrendingUp, DollarSign, AlertCircle, CheckCircle, Instagram, Youtube, Video, Link2, RefreshCw, X, Palette, Sun, Moon } from 'lucide-react';
import { getPlatformStatus, getInstagramAuthUrl, getTikTokAuthUrl, getYouTubeAuthUrl, disconnectPlatform, syncPlatform, getMetaAuthUrl, getThreadsAuthUrl, type PlatformStatus } from '../lib/platforms';

export function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);

  const [profile, setProfile] = useState<Partial<Profile>>({
    cpm_tier: 'conservative',
    cpm_custom: null,
    youtube_avg_views: 0,
    tiktok_avg_views: 0,
    instagram_avg_views: 0,
    youtube_shorts_avg_views: 0,
    include_youtube_longform: true,
    revision_rounds_included: 1,
    extra_revision_fee: 150,
    payment_terms: '50% upfront, 50% on delivery, Net 15',
  });

  useEffect(() => {
    if (user) {
      loadProfile();
      loadPlatforms();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setProfile(data);
  };

  const loadPlatforms = async () => {
    if (!user) return;
    const status = await getPlatformStatus(user.id);
    setPlatforms(status);
  };

  const handleConnectPlatform = (platform: PlatformStatus['platform']) => {
    let authUrl = '';
    switch (platform) {
      case 'facebook':
        authUrl = getMetaAuthUrl();
        break;
      case 'threads':
        authUrl = getThreadsAuthUrl();
        break;
      case 'instagram':
        authUrl = getInstagramAuthUrl();
        break;
      case 'tiktok':
        authUrl = getTikTokAuthUrl();
        break;
      case 'youtube':
        authUrl = getYouTubeAuthUrl();
        break;
    }
    if (authUrl) {
      window.location.href = authUrl;
    }
  };

  const handleDisconnectPlatform = async (platform: PlatformStatus['platform']) => {
    if (!user) return;
    try {
      await disconnectPlatform(user.id, platform);
      await loadPlatforms();
      const label = platform === 'facebook' ? 'Facebook & Instagram Business' : platform;
      setSuccess(`${label} disconnected successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSyncPlatform = async (platform: PlatformStatus['platform']) => {
    if (!user) return;
    setSyncing(platform);
    try{
      await syncPlatform(user.id, platform);
      await loadPlatforms();
      setSuccess(`${platform} synced successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(null);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(profile)
        .eq('id', user.id);

      if (updateError) throw updateError;

      setSuccess('Settings saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-foreground mb-2">Settings</h2>
        <p className="text-muted-foreground">Configure your pricing defaults and performance averages</p>
      </div>

      {error && (
        <div className="p-3 border rounded-xl text-sm flex items-start gap-2 bg-destructive/10 border-destructive/50 text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 border rounded-xl text-sm flex items-start gap-2 bg-emerald-50 border-emerald-200 text-emerald-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {success}
        </div>
      )}

      <div className="p-6 rounded-xl bg-card border border-border">
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          Appearance
        </h3>

        <p className="text-muted-foreground text-sm mb-6">
          Choose your preferred theme for the application
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-6 rounded-xl border-2 border-primary bg-secondary text-left">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-100">
                <Sun className="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Light Mode</div>
                <div className="text-xs text-muted-foreground">Clean and bright</div>
              </div>
            </div>
            <div className="text-xs font-semibold text-violet-600">Currently active</div>
          </div>

          <div className="p-6 rounded-xl border-2 border-border bg-card text-left opacity-50 cursor-not-allowed">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-secondary">
                <Moon className="w-6 h-6 text-muted-foreground" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Dark Mode</div>
                <div className="text-xs text-muted-foreground">Coming soon</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-6 rounded-xl bg-card border border-border">
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          Connected Platforms
        </h3>

        <p className="text-muted-foreground text-sm mb-6">
          Connect your social media accounts to enable real-time analytics and insights
        </p>

        <div className="space-y-4">
          {platforms.map((platform) => {
            // ── Platform display config ──────────────────────────────────────
            type PlatformKey = typeof platform.platform;

            const platformConfig: Record<PlatformKey, {
              label: string;
              subtitle: string;
              iconBg: string;
              icon: ReactNode;
              badge?: string;
            }> = {
              facebook: {
                label: 'Facebook + Instagram Business',
                subtitle: 'Pages, publishing, analytics & messaging',
                iconBg: 'bg-blue-600',
                icon: (
                  <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                  </svg>
                ),
                badge: 'Connects Instagram Business too',
              },
              instagram: {
                label: 'Instagram',
                subtitle: 'Business account via Meta connection above',
                iconBg: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
                icon: <Instagram className="w-6 h-6 text-white" />,
              },
              threads: {
                label: 'Threads',
                subtitle: 'Posts, replies, insights & publishing',
                iconBg: 'bg-black',
                icon: (
                  <svg viewBox="0 0 192 192" fill="white" className="w-6 h-6">
                    <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0282C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.972C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z" />
                  </svg>
                ),
              },
              tiktok: {
                label: 'TikTok',
                subtitle: 'Videos, analytics & uploads',
                iconBg: 'bg-violet-600',
                icon: <Video className="w-6 h-6 text-white" />,
              },
              youtube: {
                label: 'YouTube',
                subtitle: 'Videos, Shorts & analytics',
                iconBg: 'bg-red-600',
                icon: <Youtube className="w-6 h-6 text-white" />,
              },
            };

            const config = platformConfig[platform.platform];

            // Instagram row is informational when connected via Facebook — hide separate connect button
            const isInstagramViaMeta = platform.platform === 'instagram' && platform.connected;

            return (
              <div
                key={platform.platform}
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className={`flex items-center justify-center w-12 h-12 rounded-xl flex-shrink-0 ${config.iconBg}`}>
              {config.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-semibold text-foreground">{config.label}</h4>
                      {config.badge && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          {config.badge}
                        </span>
                      )}
                    </div>
                    {platform.connected ? (
                      <div className="text-sm text-muted-foreground truncate">
                        {platform.username && (
                          <span className="font-medium">
                            {platform.platform === 'facebook' || platform.platform === 'threads'
                              ? platform.username
                              : `@${platform.username}`}
                          </span>
                        )}
                        {platform.followers != null && platform.followers > 0 && (
                          <span> · {platform.followers.toLocaleString()} followers</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{config.subtitle}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  {platform.connected ? (
                    isInstagramViaMeta ? (
                      // Instagram connected via Meta — just show connected badge
                      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-600 bg-emerald-50 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Connected via Meta
                      </span>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-emerald-600 bg-emerald-50 font-medium">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Connected
                        </span>
                        {/* No sync for facebook/threads (done via dedicated pages) */}
                        {!['facebook', 'threads'].includes(platform.platform) && (
                          <button
                            onClick={() => handleSyncPlatform(platform.platform)}
                            disabled={syncing === platform.platform}
                            className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 text-muted-foreground hover:text-foreground hover:bg-accent"
                          >
<RefreshCw className={`w-4 h-4 ${syncing === platform.platform ? 'animate-spin' : ''}`} />
                            Sync
                          </button>
                        )}
                        <button
                          onClick={() => handleDisconnectPlatform(platform.platform)}
                          className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-destructive hover:bg-destructive/10"
                        >
                          <X className="w-4 h-4" />
                          Disconnect
                        </button>
                      </>
                    )
                  ) : (
                    // Don't show a connect button for Instagram if Facebook isn't connected yet
                    platform.platform === 'instagram' ? (
                      <span className="text-xs text-muted-foreground italic px-2">
                        Connect Facebook first
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConnectPlatform(platform.platform)}
                        className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Connect
                      </button>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ARCHIVED: CPM Tier — part of Brand Deals feature, re-enable when Brand Deals is active
      <div className="p-6 rounded-xl bg-card border border-border">
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          CPM Tier
        </h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-3">Select Your Tier</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(['conservative', 'standard', 'premium', 'specialized'] as const).map((tier) => (
                <button
                  key={tier}
                  onClick={() => setProfile({ ...profile, cpm_tier: tier, cpm_custom: null })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    profile.cpm_tier === tier
                      ? 'border-primary bg-accent'
                      : 'border-border bg-card hover:border-muted-foreground'
                  }`}
                >
                  <div className="mb-2">
                    <span className="font-semibold text-foreground capitalize">{tier}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {tier === 'conservative' && 'Default starting tier, safe for newer creators'}
                    {tier === 'standard' && 'For established creators with consistent views'}
                    {tier === 'premium' && 'For creators with highly engaged audiences'}
                    {tier === 'specialized' && 'For niche experts with premium audiences'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <button
              onClick={() => setProfile({ ...profile, cpm_tier: 'custom' })}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                profile.cpm_tier === 'custom'
                  ? 'border-primary bg-accent'
                  : 'border-border bg-card hover:border-muted-foreground'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">Custom CPM</span>
                {profile.cpm_tier === 'custom' && (
                  <input
                    type="number"
                    value={profile.cpm_custom || ''}
                    onChange={(e) => setProfile({ ...profile, cpm_custom: parseFloat(e.target.value) || null })}
                    placeholder="Enter CPM"
                    className="w-32 px-3 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-2">Set your own CPM rate</div>
            </button>
          </div>
        </div>
      </div>
      END ARCHIVED: CPM Tier */}

      {/* ARCHIVED: Performance Averages — part of Brand Deals feature, re-enable when Brand Deals is active
      <div className="p-6 rounded-xl bg-card border border-border">
        <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" />
          Performance Averages
        </h3>

        <p className="text-muted-foreground text-sm mb-6">
          Update these monthly from your last 16 long-form videos and last 10 short posts per platform
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-semibold text-foreground">
                YouTube Long-Form Avg Views
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={profile.include_youtube_longform ?? true}
                  onChange={(e) => setProfile({ ...profile, include_youtube_longform: e.target.checked })}
                  className="w-4 h-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
                />
                <span className="text-xs text-muted-foreground">Include</span>
              </label>
            </div>
            <input
              type="number"
              value={profile.youtube_avg_views}
              onChange={(e) => setProfile({ ...profile, youtube_avg_views: parseInt(e.target.value) || 0 })}
              disabled={!profile.include_youtube_longform}
              className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground mt-1">Last 16 videos</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              YouTube Shorts Avg Views
            </label>
            <input
              type="number"
              value={profile.youtube_shorts_avg_views}
              onChange={(e) => setProfile({ ...profile, youtube_shorts_avg_views: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Last 10 shorts</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              TikTok Avg Views
            </label>
            <input
              type="number"
              value={profile.tiktok_avg_views}
              onChange={(e) => setProfile({ ...profile, tiktok_avg_views: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Last 10 posts</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Instagram Reels Avg Views
            </label>
            <input
              type="number"
              value={profile.instagram_avg_views}
              onChange={(e) => setProfile({ ...profile, instagram_avg_views: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">Last 10 reels</p>
          </div>
        </div>
      </div>
      END ARCHIVED: Performance Averages */}

      <div className="p-6 rounded-xl bg-card border border-border">
        <h3 className="text-xl font-bold text-foreground mb-6">Default Terms</h3>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Revision Rounds Included
              </label>
              <input
                type="number"
                value={profile.revision_rounds_included}
                onChange={(e) => setProfile({ ...profile, revision_rounds_included: parseInt(e.target.value) || 1 })}
                min="1"
                max="5"
                className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">
                Extra Revision Fee
              </label>
              <input
                type="number"
                value={profile.extra_revision_fee}
                onChange={(e) => setProfile({ ...profile, extra_revision_fee: parseFloat(e.target.value) || 0 })}
                className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Payment Terms
            </label>
            <input
              type="text"
              value={profile.payment_terms}
              onChange={(e) => setProfile({ ...profile, payment_terms: e.target.value })}
              className="w-full px-4 py-2 rounded-xl border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className={`px-6 py-3 font-semibold rounded-xl transition-colors flex items-center gap-2 ${
            loading
              ? 'opacity-50 cursor-not-allowed bg-primary text-primary-foreground'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          }`}
        >
          <Save className="w-5 h-5" />
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
