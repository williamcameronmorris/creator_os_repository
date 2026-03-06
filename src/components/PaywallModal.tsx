import { supabase } from '../lib/supabase';
import { X, Check, Crown, TrendingUp, Sparkles, Users, BarChart3, ExternalLink } from 'lucide-react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
  /** Called after upgrade intent is recorded (e.g. to refresh subscription state) */
  onUpgradeIntent?: () => void;
}

export function PaywallModal({ isOpen, onClose, feature, onUpgradeIntent }: PaywallModalProps) {

  if (!isOpen) return null;

  const handleUpgrade = async () => {
    // Get user email for Stripe prefill
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email || '';

    const stripeLink = import.meta.env.VITE_STRIPE_PAYMENT_LINK;

    if (stripeLink) {
      // Stripe Payment Link — append prefilled_email so checkout is frictionless
      const url = email
        ? `${stripeLink}?prefilled_email=${encodeURIComponent(email)}`
        : stripeLink;
      window.open(url, '_blank', 'noopener,noreferrer');
    } else {
      // Fallback: mailto until payment link is configured
      const subject = encodeURIComponent('Creator Command — Upgrade to Premium');
      const body = encodeURIComponent(`Hi, I'd like to upgrade my Creator Command account to Premium.\n\nEmail: ${email}`);
      window.open(`mailto:hello@theamplifiedcreator.com?subject=${subject}&body=${body}`, '_blank');
    }

    onUpgradeIntent?.();
  };

  const earningTiers = [
    { label: '$50K-$150K', color: 'bg-emerald-500/20 text-emerald-700 border-emerald-500/30' },
    { label: '$100K-$500K', color: 'bg-blue-500/20 text-blue-700 border-blue-500/30' },
    { label: '$250K-$1M+', color: 'bg-amber-500/20 text-amber-700 border-amber-500/30' },
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
      <div className={`max-w-2xl w-full rounded-2xl my-8 bg-white border border-slate-200`}>
        <div className="p-6 sm:p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg">
                  <Crown className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h2 className={`text-2xl sm:text-3xl font-bold text-slate-900`}>
                    Unlock Your Full Earning Potential
                  </h2>
                </div>
              </div>
              <p className={`text-sm sm:text-base text-slate-600`}>
                {feature} is a premium feature. Join thousands of creators maximizing their income.
              </p>
            </div>
            <button
              onClick={onClose}
              className={`ml-4 p-2 rounded-xl hover:bg-slate-100 text-slate-600`}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-6">
            <p className={`text-sm font-semibold mb-3 text-slate-700`}>
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

          <div className={`p-5 rounded-xl mb-6 bg-slate-50 border border-slate-200`}>
            <h3 className={`text-lg font-bold mb-3 flex items-center gap-2 text-slate-900`}>
              <Sparkles className="w-5 h-5 text-orange-500" />
              Brand Portfolio Feature
            </h3>
            <p className={`text-sm text-slate-700`}>
              Build a professional portfolio that showcases your best work and metrics. Become a highly sought-after Content Creator with comprehensive analytics, automated reporting, and tools that help you close bigger deals with premium brands.
            </p>
          </div>

          <div className="mb-6">
            <h3 className={`text-lg font-bold mb-4 text-slate-900`}>
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
                    <p className={`text-sm text-slate-700`}>
                      {item.text}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`p-4 rounded-xl mb-6 border-2 bg-orange-50 border-orange-200`}>
            <p className={`text-center font-bold text-sm sm:text-base text-orange-700`}>
              Average ROI: 10-50x your investment
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={handleUpgrade}
              className="w-full py-4 px-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold rounded-xl hover:shadow-xl hover:scale-[1.02] transition-all text-lg flex items-center justify-center gap-2"
            >
              Upgrade to Premium — $29/mo
              <ExternalLink className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className={`w-full py-3 px-4 rounded-xl font-semibold bg-slate-100 text-slate-900 hover:bg-slate-200 transition-colors`}
            >
              Maybe Later
            </button>
          </div>

          <p className={`text-center text-xs mt-4 text-slate-500`}>
            Cancel anytime. No long-term commitment.
          </p>
        </div>
      </div>
    </div>
  );
}
