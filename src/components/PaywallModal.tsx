import { useTheme } from '../contexts/ThemeContext';
import { X, Check, Crown, TrendingUp, Sparkles, Users, BarChart3 } from 'lucide-react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
}

export function PaywallModal({ isOpen, onClose, feature }: PaywallModalProps) {
  const { darkMode } = useTheme();

  if (!isOpen) return null;

  const earningTiers = [
    { label: '$50K-$150K', color: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' },
    { label: '$100K-$500K', color: 'bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30' },
    { label: '$250K-$1M+', color: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border-amber-500/30' },
  ];

  const premiumFeatures = [
    { text: 'Unlimited social accounts', icon: Users },
    { text: '150 AI requests per day (vs 15)', icon: Sparkles },
    { text: 'Revenue tracking & monetization', icon: TrendingUp },
    { text: 'Full creator course library', icon: Crown },
    { text: 'Advanced analytics & insights', icon: BarChart3 },
    { text: 'AI-trained community management', icon: Sparkles },
    { text: 'Unlimited scheduled posts', icon: Check },
    { text: 'Priority support', icon: Check },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <div className={`max-w-2xl w-full rounded-2xl my-8 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
                  <Crown className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className={`text-2xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Unlock Your Full Earning Potential
                  </h2>
                </div>
              </div>
              <p className={`text-sm sm:text-base ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {feature} is a premium feature. Join thousands of creators maximizing their income.
              </p>
            </div>
            <button
              onClick={onClose}
              className={`ml-4 p-2 rounded-xl ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <p className={`text-sm font-semibold mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Earning Potential:
            </p>
            <div className="flex flex-wrap gap-2">
              {earningTiers.map((tier) => (
                <div
                  key={tier.label}
                  className={`px-4 py-2 rounded-lg border font-bold text-sm ${tier.color}`}
                >
                  {tier.label}
                </div>
              ))}
            </div>
          </div>

          <div className={`p-5 rounded-xl mb-6 ${darkMode ? 'bg-slate-900/50 border border-slate-700' : 'bg-slate-50 border border-slate-200'}`}>
            <h3 className={`text-lg font-bold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              <Sparkles className="w-5 h-5 text-orange-500" />
              Brand Portfolio Feature
            </h3>
            <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Build a professional portfolio that showcases your best work and metrics. Become a highly sought-after Content Creator with comprehensive analytics, automated reporting, and tools that help you close bigger deals with premium brands.
            </p>
          </div>

          <div className="mb-6">
            <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Everything in Premium:
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {premiumFeatures.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.text} className="flex items-start gap-3">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10 mt-0.5 flex-shrink-0">
                      <Icon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`p-4 rounded-xl mb-6 border-2 ${darkMode ? 'bg-orange-500/5 border-orange-500/20' : 'bg-orange-50 border-orange-200'}`}>
            <p className={`text-center font-bold text-sm sm:text-base ${darkMode ? 'text-orange-300' : 'text-orange-700'}`}>
              Average ROI: 10-50x your investment
            </p>
          </div>

          <div className="space-y-3">
            <button className="w-full py-4 px-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold rounded-xl hover:shadow-xl hover:scale-[1.02] transition-all text-lg">
              Upgrade to Premium - $29/mo
            </button>
            <button
              onClick={onClose}
              className={`w-full py-3 px-4 rounded-xl font-semibold ${darkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'} transition-colors`}
            >
              Maybe Later
            </button>
          </div>

          <p className={`text-center text-xs mt-4 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            Cancel anytime. No long-term commitment.
          </p>
        </div>
      </div>
    </div>
  );
}
