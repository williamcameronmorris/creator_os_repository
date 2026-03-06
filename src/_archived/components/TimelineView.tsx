import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Calendar, DollarSign, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';

interface Deal {
  id: string;
  brand: string;
  product: string;
  quote_standard: number;
  final_amount: number;
  stage: string;
  payment_status: string;
  created_at: string;
  next_followup: string | null;
  publish_date: string | null;
}

interface Stage {
  id: string;
  name: string;
  color: string;
}

interface TimelineViewProps {
  onDealClick?: (dealId: string) => void;
  onCreateDeal?: () => void;
}

export default function TimelineView({ onDealClick, onCreateDeal }: TimelineViewProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: dealsData } = await supabase
        .from('deals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (dealsData) setDeals(dealsData);

      const stageColors: Record<string, string> = {
        'Intake': '#3B82F6',
        'Quoted': '#0EA5E9',
        'Negotiating': '#F59E0B',
        'Contracted': '#10B981',
        'In Production': '#F97316',
        'Delivered': '#14B8A6',
        'Closed': '#6B7280',
      };
      const uniqueStages = [...new Set(dealsData?.map((d: any) => d.stage) || [])];
      setStages(uniqueStages.map(stage => ({
        id: stage,
        name: stage,
        color: stageColors[stage] || '#9CA3AF',
      })));
    } catch (error) {
      console.error('Error loading timeline data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getWeeksInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const currentDate = new Date(year, month, day);
      currentWeek.push(currentDate);

      if (currentDate.getDay() === 6 || day === lastDay.getDate()) {
        weeks.push([...currentWeek]);
        currentWeek = [];
      }
    }

    return weeks;
  };

  const getDealsForWeek = (weekStart: Date, weekEnd: Date) => {
    return deals.filter(deal => {
      const dealDate = deal.expected_close_date
        ? new Date(deal.expected_close_date)
        : new Date(deal.created_at);

      return dealDate >= weekStart && dealDate <= weekEnd;
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStageColor = (stageName: string) => {
    const stage = stages.find(s => s.name === stageName);
    return stage?.color || '#9CA3AF';
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const weeks = getWeeksInMonth(currentMonth);
  const monthName = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8 space-y-4">
        <div className="flex items-center justify-between p-5 rounded-xl bg-card border border-border">
          <button
            onClick={goToPreviousMonth}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-4">
            <h3 className="text-2xl font-bold text-foreground">{monthName}</h3>
            <button
              onClick={goToToday}
              className="px-4 py-2 text-sm rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-colors"
            >
              Today
            </button>
          </div>

          <button
            onClick={goToNextMonth}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {deals.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 bg-primary/10 border border-primary/20">
                <Calendar className="w-10 h-10 text-primary" />
              </div>
              <p className="text-xl font-bold text-foreground mb-2">No deals to display</p>
              <p className="text-sm text-muted-foreground font-medium">Create your first deal to see it on the timeline</p>
            </div>
          ) : (
            deals.map(deal => {
              const dealDate = deal.publish_date
                ? new Date(deal.publish_date)
                : deal.next_followup
                ? new Date(deal.next_followup)
                : new Date(deal.created_at);
              const dealAmount = deal.final_amount > 0 ? deal.final_amount : deal.quote_standard;

              return (
                <button
                  key={deal.id}
                  onClick={() => onDealClick?.(deal.id)}
                  className="w-full p-6 sm:p-8 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all text-left"
                  style={{ borderLeftColor: getStageColor(deal.stage), borderLeftWidth: '6px', borderLeftStyle: 'solid' }}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-foreground mb-2">{deal.brand || 'Unknown Brand'}</h3>
                      <p className="text-sm text-muted-foreground font-medium">{deal.product || 'No product specified'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${
                        deal.payment_status === 'Fully Paid' ? 'bg-chart-2/20 text-chart-2' :
                        deal.payment_status === 'Deposit Paid' ? 'bg-chart-5/20 text-chart-5' :
                        deal.payment_status === 'Overdue' ? 'bg-chart-4/20 text-chart-4' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {deal.payment_status}
                      </span>
                      <div className="flex items-center gap-2 text-foreground font-bold text-lg">
                        <DollarSign className="w-5 h-5" />
                        {formatCurrency(dealAmount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-sm">
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-xl">
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: getStageColor(deal.stage) }}
                      />
                      <span className="text-foreground font-semibold">{deal.stage}</span>
                    </div>
                    {deal.publish_date && (
                      <div className="flex items-center gap-2 text-muted-foreground font-medium">
                        <Calendar className="w-4 h-4" />
                        <span>Publish: {new Date(deal.publish_date).toLocaleDateString()}</span>
                      </div>
                    )}
                    {deal.next_followup && (
                      <div className="flex items-center gap-2 text-muted-foreground font-medium">
                        <TrendingUp className="w-4 h-4" />
                        <span>Follow-up: {new Date(deal.next_followup).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}