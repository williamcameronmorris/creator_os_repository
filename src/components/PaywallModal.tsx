import { useTheme } from '../contexts/ThemeContext';
import { X, Check, Crown } from 'lucide-react';

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature: string;
}

export function PaywallModal({ isOpen, onClose, feature }: PaywallModalProps) {
  const { darkMode } = useTheme();

  if (!isOpen) return null;

  const paidFeatures = [
    'Unlimited scheduled posts',
    'Advanced analytics',
    'Instagram publishing',
    'Revenue tracking',
    'Priority support',
    'Custom branding',
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className={`max-w-lg w-full rounded-2xl p-8 ${darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600">
              <Crown className="w-6 h-6 text-white" />
            </div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Upgrade to Pro
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          {feature} is a premium feature. Upgrade to unlock all features and take your content to the next level.
        </p>

        <div className="space-y-3 mb-8">
          {paidFeatures.map((item) => (
            <div key={item} className="flex items-center gap-3">
              <div className="flex items-center justify-center w-6 h-6 rounded-full bg-sky-500/10">
                <Check className="w-4 h-4 text-sky-500" />
              </div>
              <p className={darkMode ? 'text-slate-300' : 'text-slate-700'}>{item}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <button className="w-full py-3 px-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-semibold rounded-xl hover:shadow-lg transition-all">
            Upgrade to Pro - $29/mo
          </button>
          <button
            onClick={onClose}
            className={`w-full py-3 px-4 rounded-xl font-semibold ${darkMode ? 'bg-slate-700 text-white hover:bg-slate-600' : 'bg-slate-100 text-slate-900 hover:bg-slate-200'}`}
          >
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
}
