import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Save, TrendingUp, DollarSign, AlertCircle, CheckCircle, Link2, Palette, Sun, Moon, User, ArrowRight } from 'lucide-react';
import { PostForMeConnections } from './PostForMeConnections';

export function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-8">
      <div>
        <h2 className="text-3xl font-black uppercase tracking-tight text-foreground mb-2">Settings</h2>
        <p className="text-muted-foreground text-xs font-mono uppercase tracking-[0.08em]">Configure your pricing defaults and performance averages</p>
      </div>

      {/* Profile link card */}
      <button
        onClick={() => navigate('/profile')}
        className="w-full p-6 bg-card border border-border text-left hover:border-foreground/40 transition-colors group flex items-center gap-4"
      >
        <div className="w-10 h-10 border border-border flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-mono uppercase tracking-[0.08em] text-foreground mb-1">Profile</div>
          <div className="text-muted-foreground text-sm">Name, email, niche, and account preferences</div>
        </div>
        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0" />
      </button>

      {error && (
        <div className="p-3 border border-destructive text-sm flex items-start gap-2 bg-destructive/10 text-destructive">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 border border-emerald-600 text-sm flex items-start gap-2 bg-emerald-50/50 text-emerald-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {success}
        </div>
      )}

      <div className="p-6 bg-card border border-border">
        <h3 className="text-lg font-black uppercase tracking-tight text-foreground mb-2 flex items-center gap-2">
          <Palette className="w-5 h-5" />
          <span className="text-xs font-mono tracking-[0.08em]">Appearance</span>
        </h3>

        <p className="text-muted-foreground text-sm mb-6">
          Choose your preferred theme for the application
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Light Mode */}
          <button
            onClick={() => setTheme('light')}
            className={`p-6 border-2 text-left transition-all ${
              theme === 'light'
                ? 'border-foreground bg-foreground/5'
                : 'border-border bg-card hover:border-foreground/40'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-500/20">
                <Sun className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Light Mode</div>
                <div className="text-xs text-muted-foreground">Clean and bright</div>
              </div>
            </div>
            {theme === 'light' && (
              <div className="text-xs font-semibold text-foreground flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Currently active
              </div>
            )}
          </button>

          {/* Dark Mode */}
          <button
            onClick={() => setTheme('dark')}
            className={`p-6 border-2 text-left transition-all ${
              theme === 'dark'
                ? 'border-foreground bg-foreground/5'
                : 'border-border bg-card hover:border-foreground/40'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-500/20">
                <Moon className="w-6 h-6 text-indigo-500" />
              </div>
              <div>
                <div className="font-semibold text-foreground">Dark Mode</div>
                <div className="text-xs text-muted-foreground">Deep and premium</div>
              </div>
            </div>
            {theme === 'dark' && (
              <div className="text-xs font-semibold text-foreground flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Currently active
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 bg-card border border-border">
        <h3 className="text-lg font-black uppercase tracking-tight text-foreground mb-2 flex items-center gap-2">
          <Link2 className="w-5 h-5" />
          <span className="text-xs font-mono tracking-[0.08em]">Connected Platforms</span>
        </h3>

        <p className="text-muted-foreground text-sm mb-6">
          Connect your social accounts via Post for Me to schedule and publish from one place.
        </p>

        <PostForMeConnections />
      </div>

      {/* ARCHIVED: CPM Tier â part of Brand Deals feature, re-enable when Brand Deals is active
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

      {/* ARCHIVED: Performance Averages â part of Brand Deals feature, re-enable when Brand Deals is active
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

      {/* ARCHIVED: Default Terms â part of Brand Deals feature, re-enable when Brand Deals is active
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
      END ARCHIVED: Default Terms */}

      {/* ARCHIVED: Save Settings button â re-enable with Default Terms when Brand Deals is active
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
          {loading ? 'Saving...' : 'Save Settings' }
        </button>
      </div>
      END ARCHIVED: Save Settings button */}
    </div>
  );
}
