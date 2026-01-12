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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Welcome to Brand Deal OS</h1>
          <p className="text-slate-400">Let's set up your pricing system in 4 quick steps</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                  s === step
                    ? 'bg-blue-500 text-white scale-110'
                    : s < step
                    ? 'bg-green-500 text-white'
                    : 'bg-slate-700 text-slate-400'
                }`}
              >
                {s < step ? <CheckCircle className="w-5 h-5" /> : s}
              </div>
              {s < 4 && (
                <div
                  className={`w-12 h-1 rounded ${
                    s < step ? 'bg-green-500' : 'bg-slate-700'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-2xl p-8">
          {step === 1 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Before We Start</h2>
                  <p className="text-slate-400 text-sm">Quick prep to get accurate pricing</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <p className="text-slate-200 leading-relaxed">
                    To calculate accurate pricing, please <span className="font-semibold text-white">find the number of views for the last 10 videos</span> from:
                  </p>
                  <ul className="mt-3 space-y-2 text-slate-300">
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      Instagram Reels
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      YouTube Shorts
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      YouTube Long-Form
                    </li>
                    <li className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full"></div>
                      TikTok
                    </li>
                  </ul>
                  <p className="mt-4 text-slate-200">
                    Once you have those numbers, come back here and enter the details so we can help you get your deal started!
                  </p>
                </div>

                <div className="flex items-start gap-3 p-4 bg-slate-900/50 border border-slate-600 rounded-lg">
                  <input
                    type="checkbox"
                    id="step1_ready"
                    checked={step1Acknowledged}
                    onChange={(e) => setStep1Acknowledged(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded bg-slate-900/50 border-slate-600 text-blue-500 focus:ring-2 focus:ring-blue-500"
                  />
                  <label htmlFor="step1_ready" className="text-slate-300 cursor-pointer">
                    I have gathered my view counts and I'm ready to continue
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Your Performance Averages</h2>
                  <p className="text-slate-400 text-sm">Enter at least one platform to get started</p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    YouTube Long-Form Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.youtube_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, youtube_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Average from last 16 videos"
                  />
                  <p className="text-xs text-slate-500 mt-1">Used for pricing long-form content</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    YouTube Shorts Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.youtube_shorts_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, youtube_shorts_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Average from last 10 shorts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    TikTok Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.tiktok_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, tiktok_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Average from last 10 posts"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-200 mb-2">
                    Instagram Reels Average Views
                  </label>
                  <input
                    type="number"
                    value={formData.instagram_avg_views}
                    onChange={(e) =>
                      setFormData({ ...formData, instagram_avg_views: parseInt(e.target.value) || 0 })
                    }
                    className="w-full px-4 py-3 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Average from last 10 reels"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-blue-500/20 rounded-lg">
                  <DollarSign className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">Choose Your CPM Tier</h2>
                  <p className="text-slate-400 text-sm">Start with Conservative and move up as you grow</p>
                </div>
              </div>

              <div className="space-y-3">
                {(['conservative', 'standard', 'premium', 'specialized'] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => setFormData({ ...formData, cpm_tier: tier, cpm_custom: null })}
                    className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                      formData.cpm_tier === tier
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-600 bg-slate-900/50 hover:border-slate-500'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-white capitalize text-lg">{tier}</span>
                      <span className="text-blue-400 font-bold text-xl">${CPM_TIERS[tier]} CPM</span>
                    </div>
                    <div className="text-sm text-slate-400">
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
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="flex items-center justify-center w-12 h-12 bg-green-500/20 rounded-lg">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white">You're All Set!</h2>
                  <p className="text-slate-400 text-sm">Here's how to use Brand Deal OS</p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg font-bold flex-shrink-0">
                      1
                    </div>
                    <div>
                      <h3 className="text-white font-semibold mb-1">Create a Deal Intake</h3>
                      <p className="text-slate-400 text-sm">
                        Capture brand details, objectives, deliverables, and rights before quoting
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg font-bold flex-shrink-0">
                      2
                    </div>
                    <div>
                      <h3 className="text-white font-semibold mb-1">Calculate Your Quote</h3>
                      <p className="text-slate-400 text-sm">
                        Enter deliverables and the system calculates Low, Standard, and Stretch pricing automatically
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg font-bold flex-shrink-0">
                      3
                    </div>
                    <div>
                      <h3 className="text-white font-semibold mb-1">Use the Copy Bank</h3>
                      <p className="text-slate-400 text-sm">
                        Pre-written scripts for budget asks, quotes, boundaries, and follow-ups
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-600">
                  <div className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-8 h-8 bg-blue-500/20 text-blue-400 rounded-lg font-bold flex-shrink-0">
                      4
                    </div>
                    <div>
                      <h3 className="text-white font-semibold mb-1">Track Your Pipeline</h3>
                      <p className="text-slate-400 text-sm">
                        Monitor deals from Intake through Closed with payment tracking and follow-up reminders
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="p-4 bg-blue-500/10 border border-blue-500/50 rounded-lg">
                  <p className="text-blue-300 text-sm">
                    <strong>Pro tip:</strong> Update your averages monthly in Settings to keep your pricing accurate as your channel grows.
                  </p>
                </div>

                <div className="p-4 bg-slate-900/50 border border-slate-600 rounded-lg">
                  <p className="text-slate-300 text-sm">
                    <strong>Coming soon:</strong> Connect your Instagram, TikTok, and YouTube accounts directly through API integrations to automatically sync your view counts.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between mt-8 pt-6 border-t border-slate-700">
            <button
              onClick={() => setStep(step - 1)}
              disabled={step === 1}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
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
                className="px-6 py-3 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                Next
                <ChevronRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={loading}
                className="px-6 py-3 bg-green-500 hover:bg-green-600 disabled:bg-slate-600 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {loading ? 'Completing...' : 'Start Using Brand Deal OS'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
