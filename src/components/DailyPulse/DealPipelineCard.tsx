import { ArrowRight, Send, FileText, Calculator, Clock, AlertCircle } from 'lucide-react';
import { PulseCard } from './PulseCard';

type DealStatus = 'stalled' | 'on_track' | 'new' | 'urgent';

interface Deal {
  id: string;
  brand: string;
  status: DealStatus;
  statusMessage: string;
  amount: number;
  actionType: 'follow_up' | 'contract' | 'quote';
  daysInStatus?: number;
}

interface DealPipelineData {
  activeDeals: number;
  stalledCount: number;
  totalValue: number;
  deals: Deal[];
}

interface DealPipelineCardProps {
  data: DealPipelineData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onSendFollowUp: (dealId: string) => void;
  onReviewContract: (dealId: string) => void;
  onQuickQuote: (dealId: string) => void;
  onViewDeal: (dealId: string) => void;
}

const statusStyles: Record<DealStatus, { bg: string; text: string; label: string }> = {
  stalled: { bg: 'bg-red-100', text: 'text-red-700', label: 'STALLED' },
  on_track: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'ON TRACK' },
  new: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'NEW' },
  urgent: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'URGENT' },
};

export function DealPipelineCard({
  data,
  isExpanded,
  onToggleExpand,
  onSendFollowUp,
  onReviewContract,
  onQuickQuote,
  onViewDeal,
}: DealPipelineCardProps) {
  const formatCurrency = (amount: number) => {
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount}`;
  };

  const getInitial = (brand: string) => brand.charAt(0).toUpperCase();

  const getInitialColor = (brand: string) => {
    const colors = [
      'bg-blue-500',
      'bg-emerald-500',
      'bg-purple-500',
      'bg-amber-500',
      'bg-pink-500',
      'bg-cyan-500',
    ];
    const index = brand.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const badges = [];
  if (data.stalledCount > 0) {
    badges.push({ label: `${data.stalledCount} stalled`, variant: 'danger' as const });
  }
  badges.push({ label: formatCurrency(data.totalValue), variant: 'success' as const });

  const renderActionButton = (deal: Deal) => {
    switch (deal.actionType) {
      case 'follow_up':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSendFollowUp(deal.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition-colors"
          >
            Send Follow-up
            <ArrowRight className="w-3 h-3" />
          </button>
        );
      case 'contract':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onReviewContract(deal.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors"
          >
            Review Contract
            <ArrowRight className="w-3 h-3" />
          </button>
        );
      case 'quote':
        return (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickQuote(deal.id);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition-colors"
          >
            Quick Quote
            <ArrowRight className="w-3 h-3" />
          </button>
        );
    }
  };

  return (
    <PulseCard
      category="deals"
      categoryLabel="PARTNERSHIPS"
      title="Deal Pipeline"
      metric={data.activeDeals}
      metricLabel="active deals"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
    >
      <div className="space-y-3">
        {data.deals.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <p className="text-gray-500 text-sm">No active deals to review</p>
          </div>
        ) : (
          data.deals.map((deal) => {
            const statusStyle = statusStyles[deal.status];
            return (
              <button
                key={deal.id}
                onClick={() => onViewDeal(deal.id)}
                className="w-full text-left p-4 rounded-xl bg-amber-50/50 hover:bg-amber-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-full ${getInitialColor(
                      deal.brand
                    )} flex items-center justify-center flex-shrink-0`}
                  >
                    <span className="text-white font-bold text-sm">
                      {getInitial(deal.brand)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-semibold text-gray-900">{deal.brand}</h4>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${statusStyle.bg} ${statusStyle.text}`}
                      >
                        {statusStyle.label}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mb-3">{deal.statusMessage}</p>
                    {renderActionButton(deal)}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </PulseCard>
  );
}
