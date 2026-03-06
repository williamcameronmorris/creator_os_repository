import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, Calendar, TrendingUp, Search, Filter, Grid3x3, Grid2x2 } from 'lucide-react';

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
}

interface Stage {
  id: string;
  name: string;
  color: string;
  position: number;
}

interface GalleryViewProps {
  onDealClick?: (dealId: string) => void;
  onCreateDeal?: () => void;
}

export default function GalleryView({ onDealClick, onCreateDeal }: GalleryViewProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [gridSize, setGridSize] = useState<'large' | 'small'>('large');

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

      const uniqueStages = [...new Set(dealsData?.map((d: any) => d.stage) || [])];
      const stageColors: Record<string, string> = {
        'Intake': '#3B82F6',
        'Quoted': '#0EA5E9',
        'Negotiating': '#F59E0B',
        'Contracted': '#10B981',
        'In Production': '#F97316',
        'Delivered': '#14B8A6',
        'Closed': '#6B7280',
      };
      setStages(uniqueStages.map((stage, idx) => ({
        id: stage,
        name: stage,
        color: stageColors[stage] || '#9CA3AF',
        position: idx,
      })));
    } catch (error) {
      console.error('Error loading gallery data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredDeals = () => {
    return deals.filter(deal => {
      const matchesSearch = searchQuery === '' ||
        deal.brand?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.product?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStage = filterStage === 'all' || deal.stage === filterStage;

      return matchesSearch && matchesStage;
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStageInfo = (stageName: string) => {
    return stages.find(s => s.name === stageName);
  };

  const getProgressPercentage = (stageName: string) => {
    const stageOrder = ['Intake', 'Quoted', 'Negotiating', 'Contracted', 'In Production', 'Delivered', 'Closed'];
    const stageIndex = stageOrder.indexOf(stageName);
    if (stageIndex === -1) return 0;
    return Math.round((stageIndex / (stageOrder.length - 1)) * 100);
  };

  const getBrandInitials = (brandName: string) => {
    if (!brandName) return '??';
    return brandName
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getGradientColor = (brandName: string) => {
    if (!brandName) return 'from-slate-500 to-slate-600';
    const colors = [
      'from-blue-500 to-blue-600',
      'from-green-500 to-green-600',
      'from-red-500 to-red-600',
      'from-amber-500 to-amber-600',
      'from-cyan-500 to-cyan-600',
      'from-pink-500 to-pink-600',
      'from-sky-500 to-sky-600',
      'from-orange-500 to-orange-600',
    ];

    const index = brandName.length % colors.length;
    return colors[index];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const filteredDeals = getFilteredDeals();
  const totalValue = filteredDeals.reduce((sum, deal) => sum + (deal.final_amount > 0 ? deal.final_amount : deal.quote_standard), 0);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search deals by brand or type..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setGridSize(gridSize === 'large' ? 'small' : 'large')}
              className="px-4 py-3 rounded-xl bg-card border border-border text-foreground hover:bg-muted flex items-center gap-2 font-semibold transition-colors"
            >
              {gridSize === 'large' ? <Grid3x3 className="w-5 h-5" /> : <Grid2x2 className="w-5 h-5" />}
              {gridSize === 'large' ? 'Compact' : 'Large'}
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-3 rounded-xl bg-card border border-border text-foreground hover:bg-muted flex items-center gap-2 font-semibold transition-colors"
            >
              <Filter className="w-5 h-5" />
              Filters
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="p-5 rounded-xl bg-card border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <span className="text-sm font-semibold text-foreground">Stage:</span>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setFilterStage('all')}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                    filterStage === 'all'
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted text-muted-foreground hover:bg-muted/80'
                  }`}
                >
                  All
                </button>
                {stages.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => setFilterStage(stage.id)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex items-center gap-2 ${
                      filterStage === stage.id
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: stage.color }}
                    />
                    {stage.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className={`grid gap-6 ${
          gridSize === 'large'
            ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
            : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'
        }`}>
          {filteredDeals.map(deal => {
            const stage = getStageInfo(deal.stage);
            const progress = getProgressPercentage(deal.stage);
            const dealAmount = deal.final_amount > 0 ? deal.final_amount : deal.quote_standard;

            return (
              <button
                key={deal.id}
                onClick={() => onDealClick?.(deal.id)}
                className="rounded-2xl bg-card border border-border overflow-hidden hover:border-primary/50 transition-all shadow-sm text-left"
              >
                <div className={`h-32 bg-gradient-to-br ${getGradientColor(deal.brand || 'Unknown')} flex items-center justify-center`}>
                  <div className="text-white font-bold text-4xl">
                    {getBrandInitials(deal.brand || 'Unknown')}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="font-bold text-foreground text-lg mb-1">
                      {deal.brand || 'Unknown Brand'}
                    </h3>
                    <p className="text-sm text-muted-foreground font-medium">
                      {deal.product || 'No product specified'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-foreground font-bold text-lg">
                      <DollarSign className="w-5 h-5" />
                      {formatCurrency(dealAmount)}
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-semibold ${
                      deal.payment_status === 'Fully Paid' ? 'bg-chart-2/20 text-chart-2' :
                      deal.payment_status === 'Deposit Paid' ? 'bg-chart-5/20 text-chart-5' :
                      deal.payment_status === 'Overdue' ? 'bg-chart-4/20 text-chart-4' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {deal.payment_status}
                    </span>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: stage?.color }}
                        />
                        <span className="text-xs text-foreground font-semibold">{stage?.name}</span>
                      </div>
                      <span className="text-xs text-foreground font-bold">{progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: stage?.color || '#0EA5E9',
                        }}
                      />
                    </div>
                  </div>

                  {deal.next_followup && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      Follow-up: {new Date(deal.next_followup).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {filteredDeals.length === 0 && (
          <div className="text-center py-16">
            <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-4 bg-primary/10 border border-primary/20">
              <TrendingUp className="w-10 h-10 text-primary" />
            </div>
            <p className="text-xl font-bold text-foreground mb-2">No deals found</p>
            <p className="text-sm text-muted-foreground font-medium">Try adjusting your filters or create a new deal</p>
          </div>
        )}
      </div>
    </div>
  );
}
