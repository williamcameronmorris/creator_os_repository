import { Sparkles, ArrowRight, Lightbulb, AlertTriangle, PartyPopper, TrendingUp } from 'lucide-react';
import { PulseCard } from './PulseCard';

type TipType = 'optimization' | 'warning' | 'opportunity';

interface SmartTip {
  id: string;
  type: TipType;
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
  highlightText?: string;
}

interface SmartTipsData {
  tipsCount: number;
  trendingCount: number;
  tips: SmartTip[];
  allCaughtUp: boolean;
}

interface SmartTipsCardProps {
  data: SmartTipsData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTipAction: (tip: SmartTip) => void;
  hideCollapseButton?: boolean;
}

const tipIcons: Record<TipType, typeof Sparkles> = {
  optimization: Sparkles,
  warning: AlertTriangle,
  opportunity: Lightbulb,
};

const tipStyles: Record<TipType, { iconBg: string; iconColor: string }> = {
  optimization: { iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  warning: { iconBg: 'bg-amber-100', iconColor: 'text-amber-600' },
  opportunity: { iconBg: 'bg-blue-100', iconColor: 'text-blue-600' },
};

export function SmartTipsCard({
  data,
  isExpanded,
  onToggleExpand,
  onTipAction,
  hideCollapseButton,
}: SmartTipsCardProps) {
  const badges = [];
  badges.push({ label: 'AI powered', variant: 'success' as const });
  if (data.trendingCount > 0) {
    badges.push({ label: `${data.trendingCount} trend${data.trendingCount > 1 ? 's' : ''}`, variant: 'default' as const });
  }

  const renderHighlightedText = (text: string, highlight?: string) => {
    if (!highlight) return text;

    const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === highlight.toLowerCase() ? (
        <span key={index} className="font-bold text-gray-900">{part}</span>
      ) : (
        part
      )
    );
  };

  return (
    <PulseCard
      category="tips"
      categoryLabel="AI INSIGHTS"
      title="Smart Tips"
      metric={data.tipsCount}
      metricLabel="new ideas"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      hideCollapseButton={hideCollapseButton}
    >
      <div className="space-y-4">
        {data.allCaughtUp ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <PartyPopper className="w-8 h-8 text-emerald-600" />
            </div>
            <p className="text-lg font-semibold text-gray-900 mb-1">All caught up!</p>
            <p className="text-sm text-gray-500">You've reviewed all your insights for today</p>
          </div>
        ) : data.tips.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6 text-emerald-600" />
            </div>
            <p className="text-gray-500 text-sm">No new insights yet</p>
            <p className="text-gray-400 text-xs mt-1">Post more content to get AI-powered tips</p>
          </div>
        ) : (
          data.tips.map((tip) => {
            const TipIcon = tipIcons[tip.type];
            const style = tipStyles[tip.type];

            return (
              <div key={tip.id} className="p-4 bg-gray-100 rounded-xl">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg ${style.iconBg} flex items-center justify-center flex-shrink-0`}
                  >
                    <TipIcon className={`w-5 h-5 ${style.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700 mb-3">
                      {renderHighlightedText(tip.description, tip.highlightText)}
                    </p>
                    {tip.actionLabel && (
                      <button
                        onClick={() => onTipAction(tip)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 transition-colors"
                      >
                        {tip.actionLabel}
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}

        {data.tips.length > 0 && !data.allCaughtUp && (
          <div className="pt-2 border-t border-gray-200">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <TrendingUp className="w-4 h-4" />
              <span>Tips update daily based on your content performance</span>
            </div>
          </div>
        )}
      </div>
    </PulseCard>
  );
}
