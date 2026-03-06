import { useState } from 'react';
import { supabase, type Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CPM_TIERS } from '../lib/pricing';
import { TrendingUp, DollarSign, CheckCircle, ChevronRight, ChevronLeft } from 'lucide-react';

type OnboardingProps = {
  onComplete: () => void;
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [step1Acknowledged, setStep1Acknowledged] = useState(false);

  const [formData, setFormData] = useState<Partial<Profile>>({
    youtube_avg_views: 0,
    tiktok_avg_views: 0,
    instagram_avg_views: 0,
    youtube_shorts_avg_views: 0,
    cpm_tier: 'conservative',
    cpm_custom: null,
  });

  const handleComplete = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await supabase
        .from('profiles')
        .update({
          ...formData,
          onboarding_completed: true,
          role: 'creator',
        })
        .eq('id', user.id);

      onComplete();
    } catch (error) {
      console.error('Error completing onboarding:', error);
    } finally {
      setLoading(false);
    }
  };

  const canProceedStep2 =
    formData.youtube_avg_views! > 0 ||
    formData.tiktok_avg_views! > 0 ||
    formData.instagram_avg_views! > 0 ||
    formData.youtube_shorts_avg_views! > 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-foreground mb-2">Welcome to Content Creator OS</h1>
          <p className="text-muted-foreground">Let's set up your pricing system in 4 quick steps</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                  s === step
                    ? 'bg-foreground text-background scale-110'
                    : s < step
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {s < step ? <CheckCircle className="w-5 h-5" /> : s}
              </div>
              {s < 4 && (
                <div
                  className={`w-12 h-1 rounded ${
                    s < step ? 'bg-foreground' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-accent rounded-lg">
                  <TrendingUp className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Before We Start</h2>
                  <p className="text-muted-foreground text-sm">Quick prep to get accurate pricing</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-accent border border-border rounded-lg">
                  <p className="text-foreground leading-relaxed">
                    To calculate accurate pricing, please <span className="font-semibold">find the number of views for the last 10 videos</span> from:
                  </p>
                  <ul className="mt-3 space-y-2 text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-foreground rounded-full"></div>
                      Instagram Reels
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-foreground rounded-full"></div>
                      YouTube Shorts
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-foreground rounded-full"></div>
                      YouTube Long-Form
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-foreground rounded-full"></div>
                      TikTok
                    </li>
                  </ul>
                  <p className="mt-4 text-foreground">
                    Once you have those numbers, come back here and enter the details so we can help you get your deal started!
                  </p>
                </div>

                <div className="flex items-start gap-3 p-4 bg-accent border border-border rounded-lg">
                  <input
                    type="checkbox"
                    id="step1_ready"
                    checked={step1Acknowledged}
                    onChange={(e) => setStep1Acknowledged(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded bg-background border-border text-foreground focus:ring-2 focus:ring-primary"
                  />
                  <label htmlFor="step1_ready" className="text-foreground cursor-pointer">
                    I have gathered my view counts and I'm ready to continue
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-accent rounded-lg">
                  <TrendingUp className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Your Performance Averages</h2>
                  <p className="text-muted-foreground text-sm">Enter at least one platform to get started</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    YouTube Long-Form Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.youtube_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, youtube_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Average from last 16 videos"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Used for pricing long-form content</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    YouTube Shorts Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.youtube_shorts_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, youtube_shorts_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Average from last 10 shorts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    TikTok Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.tiktok_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, tiktok_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Average from last 10 posts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Instagram Reels Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.instagram_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, instagram_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Average from last 10 reels"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-accent rounded-lg">
                  <DollarSign className="w-6 h-6 text-foreground" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">Choose Your Tier</h2>
                  <p className="text-muted-foreground text-sm">Start with Conservative and move up as you grow</p>
                </div>
              </div>

              <div className="space-y-3">
                {(['conservative', 'standard', 'premium', 'specialized'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setFormData({ ...formData, cpm_tier: tier, cpm_custom: null })}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      formData.cpm_tier === tier
                        ? 'border-foreground bg-accent'
                        : 'border-border bg-background hover:border-foreground/50'
                    }`}
                  >
                    <div className="mb-2">
                      <span className="font-semibold text-foreground capitalize text-lg">{tier}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {tier === 'conservative' && 'Best for new creators building their first rate card'}
                      {tier === 'standard' && 'For established creators with consistent engagement'}
                      {tier === 'premium' && 'For creators with highly engaged, loyal audiences'}
                      {tier === 'specialized' && 'For niche experts with premium, targeted audiences'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center py-12">
              <div className="flex justify-center mb-6">
                <div className="flex items-center justify-center w-20 h-20 bg-accent rounded-full">
                  <CheckCircle className="w-10 h-10 text-foreground" />
                </div>
              </div>
              <h2 className="text-4xl font-bold text-foreground mb-4">You're All Set!</h2>
              <p className="text-muted-foreground text-lg">Ready to start managing your content business</p>
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="px-6 py-3 bg-secondary hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed text-foreground font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>

            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && !step1Acknowledged) ||
                  (step === 2 && !canProceedStep2)
                }
                className="px-6 py-3 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="px-6 py-3 bg-foreground hover:bg-foreground/90 disabled:bg-muted text-background font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {loading ? 'Completing...' : 'Enter my Content Creator OS'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
