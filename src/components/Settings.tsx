import { useState, useEffect } from 'react';
import { supabase, type Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Save, TrendingUp, DollarSign, AlertCircle, CheckCircle, Instagram, Youtube, Video, Link2, RefreshCw, X, Palette, Sun, Moon } from 'lucide-react';
import { getPlatformStatus, getInstagramAuthUrl, getTikTokAuthUrl, getYouTubeAuthUrl, disconnectPlatform, syncPlatform, type PlatformStatus } from '../lib/platforms';

export function Settings() {
  const { user } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
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

  const handleConnectPlatform = (platform: 'instagram' | 'tiktok' | 'youtube') => {
    let authUrl = '';
    switch (platform) {
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

  const handleDisconnectPlatform = async (platform: 'instagram' | 'tiktok' | 'youtube') => {
    if (!user) return;
    try {
      await disconnectPlatform(user.id, platform);
      await loadPlatforms();
      setSuccess(`${platform} disconnected successfully`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSyncPlatform = async (platform: 'instagram' | 'tiktok' | 'youtube') => {
    if (!user) return;
    setSyncing(platform);
    try {
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
        <div className="p-3 border rounded-xl text-sm flex items-start gap-2 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
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
          <button
            onClick={() => darkMode && toggleDarkMode()}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              !darkMode
                ? 'border-primary bg-secondary'
                : 'border-border bg-card hover:border-muted-foreground'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                !darkMode ? 'bg-primary' : 'bg-secondary'
              }`}>
                <Sun className={`w-6 h-6 ${!darkMode ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="font-semibold text-foreground">Light Mode</div>
                <div className="text-xs text-muted-foreground">
                  Clean and bright
                </div>
              </div>
            </div>
            {!darkMode && (
              <div className="text-xs font-semibold text-foreground">Currently active</div>
            )}
          </button>

          <button
            onClick={() => !darkMode && toggleDarkMode()}
            className={`p-6 rounded-xl border-2 text-left transition-all ${
              darkMode
                ? 'border-primary bg-secondary'
                : 'border-border bg-card hover:border-muted-foreground'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`flex items-center justify-center w-12 h-12 rounded-xl ${
                darkMode ? 'bg-primary' : 'bg-secondary'
              }`}>
                <Moon className={`w-6 h-6 ${darkMode ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
              </div>
              <div>
                <div className="font-semibold text-foreground">Dark Mode</div>
                <div className="text-xs text-muted-foreground">
                  Easy on the eyes
                </div>
              </div>
            </div>
            {darkMode && (
              <div className="text-xs font-semibold text-foreground">Currently active</div>
            )}
          </button>
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
            const icons = {
              instagram: Instagram,
              tiktok: Video,
              youtube: Youtube,
            };
            const Icon = icons[platform.platform];
            const colors = {
              instagram: 'text-pink-600',
              tiktok: 'text-slate-900',
              youtube: 'text-red-600',
            };

            return (
              <div
                key={platform.platform}
                className="flex items-center justify-between p-4 rounded-xl border border-border bg-card"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-secondary">
                    <Icon className={`w-6 h-6 ${colors[platform.platform]}`} />
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground capitalize">{platform.platform}</h4>
                    {platform.connected ? (
                      <div className="text-sm text-muted-foreground">
                        <span className="font-medium">{platform.username}</span>
                        {platform.followers && (
                          <span> • {platform.followers.toLocaleString()} followers</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Not connected</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {platform.connected ? (
                    <>
                      <button
                        onClick={() => handleSyncPlatform(platform.platform)}
                        disabled={syncing === platform.platform}
                        className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 disabled:opacity-50 text-muted-foreground hover:text-foreground hover:bg-accent"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing === platform.platform ? 'animate-spin' : ''}`} />
                        Sync
                      </button>
                      <button
                        onClick={() => handleDisconnectPlatform(platform.platform)}
                        className="px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center gap-2 text-destructive hover:bg-destructive/10"
                      >
                        <X className="w-4 h-4" />
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleConnectPlatform(platform.platform)}
                      className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Connect
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

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
