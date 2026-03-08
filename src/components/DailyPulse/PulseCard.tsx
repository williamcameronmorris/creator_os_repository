import { ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export type CardCategory = 'content' | 'engagement' | 'schedule' | 'tips' | 'deals';

interface PulseCardProps {
  category: CardCategory;
  categoryLabel: string;
  title: string;
  metric: string | number;
  metricLabel: string;
  badges?: { label: string; variant: 'default' | 'success' | 'warning' | 'danger' }[];
  children: ReactNode;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

const categoryStyles: Record<CardCategory, { dot: string; label: string }> = {
  content: {
    dot: 'bg-sky-500',
    label: 'WEEKLY REVIEW',
  },
  engagement: {
    dot: 'bg-teal-500',
    label: 'ENGAGEMENT',
  },
  schedule: {
    dot: 'bg-rose-500',
    label: 'SCHEDULE',
  },
  tips: {
    dot: 'bg-emerald-500',
    label: 'AI INSIGHTS',
  },
  deals: {
    dot: 'bg-amber-500',
    label: 'PARTNERSHIPS',
  },
};

const badgeVariants = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
};

export function PulseCard({
  category,
  categoryLabel,
  title,
  metric,
  metricLabel,
  badges = [],
  children,
  isExpanded,
  onToggleExpand,
}: PulseCardProps) {
  const styles = categoryStyles[category];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden transition-all duration-300">
      <div className="bg-gray-50 px-5 pt-4 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${styles.dot}`} />
          <p className="text-xs font-semibold tracking-wider text-gray-500">
            {categoryLabel || styles.label}
          </p>
        </div>
        <h3 className="text-xl font-bold text-gray-900">{title}</h3>
      </div>

      <div className="p-5">
        <div className="mb-4">
          <p className="text-3xl font-bold text-gray-900">{metric}</p>
          <p className="text-sm text-gray-500">{metricLabel}</p>
        </div>

        {badges.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {badges.map((badge, index) => (
              <span
                key={index}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${badgeVariants[badge.variant]}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={onToggleExpand}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gray-100 text-sm font-medium text-gray-600 hover:bg-gray-200 transition-colors"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${
            isExpanded ? 'max-h-[2000px] opacity-100 mt-4' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="border-t border-gray-200 pt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
