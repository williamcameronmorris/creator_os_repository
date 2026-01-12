import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { DollarSign, Calendar, MessageSquare, MoreVertical, X, Search, Filter, LayoutGrid, List } from 'lucide-react';

interface Deal {
  id: string;
  brand_name: string;
  deliverable_type: string;
  rate: number;
  status: string;
  stage_id: string;
  priority: string;
  expected_close_date: string | null;
  last_activity_at: string;
  created_at: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
  color: string;
}

interface KanbanBoardProps {
  onDealClick?: (dealId: string) => void;
  onCreateDeal?: () => void;
}

export default function KanbanBoard({ onDealClick, onCreateDeal }: KanbanBoardProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [compactView, setCompactView] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const stagesResult = await supabase
        .from('deal_stages')
        .select('*')
        .eq('user_id', user.id)
        .order('position');

      if (stagesResult.data && stagesResult.data.length === 0) {
        const defaultStages = [
          { user_id: user.id, name: 'Lead', position: 0, color: '#9CA3AF', is_default: true },
          { user_id: user.id, name: 'Contacted', position: 1, color: '#60A5FA', is_default: true },
          { user_id: user.id, name: 'Negotiating', position: 2, color: '#FBBF24', is_default: true },
          { user_id: user.id, name: 'Proposal Sent', position: 3, color: '#A78BFA', is_default: true },
          { user_id: user.id, name: 'Won', position: 4, color: '#34D399', is_default: true },
          { user_id: user.id, name: 'Lost', position: 5, color: '#F87171', is_default: true },
        ];

        const { data: newStages } = await supabase
          .from('deal_stages')
          .insert(defaultStages)
          .select();

        if (newStages) setStages(newStages);
      } else if (stagesResult.data) {
        setStages(stagesResult.data);
      }

      const dealsResult = await supabase
        .from('deals')
        .select('*')
        .eq('user_id', user.id)
        .order('last_activity_at', { ascending: false });

      if (dealsResult.data) setDeals(dealsResult.data);
    } catch (error) {
      console.error('Error loading kanban data:', error);
      setError('Failed to load pipeline data. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const handleDragStart = (dealId: string) => {
    setDraggedDeal(dealId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (stageId: string) => {
    if (!draggedDeal) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('deals')
        .update({ stage_id: stageId })
        .eq('id', draggedDeal);

      const stage = stages.find(s => s.id === stageId);
      await supabase
        .from('deal_activities')
        .insert({
          deal_id: draggedDeal,
          user_id: user.id,
          activity_type: 'stage_changed',
          description: `Moved to ${stage?.name}`,
          metadata: { stage_name: stage?.name, stage_id: stageId },
        });

      setDeals(deals.map(deal =>
        deal.id === draggedDeal ? { ...deal, stage_id: stageId } : deal
      ));
    } catch (error) {
      console.error('Error updating deal stage:', error);
    } finally {
      setDraggedDeal(null);
    }
  };

  const getDealsForStage = (stageId: string) => {
    return deals.filter(deal => {
      const matchesStage = deal.stage_id === stageId;
      const matchesSearch = searchQuery === '' ||
        deal.brand_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        deal.deliverable_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = filterPriority === 'all' || deal.priority === filterPriority;

      return matchesStage && matchesSearch && matchesPriority;
    });
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-chart-4/20 text-chart-4';
      case 'medium': return 'bg-chart-5/20 text-chart-5';
      case 'low': return 'bg-chart-2/20 text-chart-2';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getProgressPercentage = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    if (!stage) return 0;

    const progressStages = stages.filter(s => !s.name.toLowerCase().includes('lost'));
    const stageIndex = progressStages.findIndex(s => s.id === stageId);
    if (stageIndex === -1) return 0;

    return Math.round((stageIndex / (progressStages.length - 1)) * 100);
  };

  const getPipelineStats = () => {
    const totalDeals = deals.length;
    const totalValue = deals.reduce((sum, deal) => sum + deal.rate, 0);
    const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;
    const highPriorityDeals = deals.filter(d => d.priority === 'high').length;

    const closingSoon = deals.filter(d => {
      if (!d.expected_close_date) return false;
      const daysUntilClose = Math.ceil((new Date(d.expected_close_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      return daysUntilClose > 0 && daysUntilClose <= 7;
    }).length;

    return { totalDeals, totalValue, avgDealSize, highPriorityDeals, closingSoon };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-center">
          <p className="text-lg font-semibold mb-2 text-foreground">Error Loading Pipeline</p>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            loadData();
          }}
          className="px-6 py-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-semibold transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const stats = getPipelineStats();

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
              onClick={() => setCompactView(!compactView)}
              className="px-4 py-3 rounded-xl bg-card border border-border text-foreground hover:bg-muted flex items-center gap-2 font-semibold transition-colors"
            >
              {compactView ? <LayoutGrid className="w-5 h-5" /> : <List className="w-5 h-5" />}
              {compactView ? 'Detailed' : 'Compact'}
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
          <div className="p-5 rounded-xl bg-card border border-border">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <span className="text-sm font-semibold text-foreground">Priority:</span>
              <div className="flex flex-wrap gap-2">
                {['all', 'high', 'medium', 'low'].map((priority) => (
                  <button
                    key={priority}
                    onClick={() => setFilterPriority(priority)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      filterPriority === priority
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-x-auto">
        <div className="flex gap-4 pb-4" style={{ minWidth: 'max-content' }}>
          {stages.map((stage) => {
            const stageDeals = getDealsForStage(stage.id);
            const totalValue = stageDeals.reduce((sum, deal) => sum + deal.rate, 0);

            return (
              <div
                key={stage.id}
                className="flex-shrink-0 w-80 flex flex-col rounded-xl bg-card border border-border"
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(stage.id)}
              >
                <div className="p-5 border-b border-border">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-foreground flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full shadow-sm"
                        style={{ backgroundColor: stage.color }}
                      />
                      {stage.name}
                    </h3>
                    <span className="bg-muted text-foreground text-sm font-bold px-3 py-1 rounded-full">
                      {stageDeals.length}
                    </span>
                  </div>
                  {totalValue > 0 && (
                    <p className="text-sm text-muted-foreground font-medium ml-7">
                      {formatCurrency(totalValue)} total
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
                  {stageDeals.map((deal) => {
                    const progress = getProgressPercentage(deal.stage_id);

                    return compactView ? (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => handleDragStart(deal.id)}
                        onClick={() => onDealClick?.(deal.id)}
                        className="bg-card border border-border rounded-2xl p-4 cursor-move hover:border-primary/50 transition-all shadow-sm"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-bold text-foreground text-sm flex-1 truncate">
                            {deal.brand_name}
                          </h4>
                          <span className="text-sm font-bold text-foreground ml-2">
                            {formatCurrency(deal.rate)}
                          </span>
                        </div>

                        <div className="w-full bg-muted rounded-full h-2 mb-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground truncate flex-1 font-medium">
                            {deal.deliverable_type}
                          </span>
                          <span className={`text-xs px-2 py-1 rounded-full ml-2 font-semibold ${getPriorityColor(deal.priority)}`}>
                            {deal.priority}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => handleDragStart(deal.id)}
                        onClick={() => onDealClick?.(deal.id)}
                        className="bg-card border border-border rounded-2xl p-5 cursor-move hover:border-primary/50 transition-all shadow-sm"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h4 className="font-bold text-foreground flex-1">
                            {deal.brand_name}
                          </h4>
                          <button className="text-muted-foreground hover:text-foreground transition-colors">
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>

                        <p className="text-sm text-muted-foreground mb-3 font-medium">
                          {deal.deliverable_type}
                        </p>

                        <div className="mb-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-muted-foreground font-medium">Progress</span>
                            <span className="text-xs text-foreground font-bold">{progress}%</span>
                          </div>
                          <div className="w-full bg-muted rounded-full h-2">
                            <div
                              className="bg-primary h-2 rounded-full transition-all duration-300"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-1 text-foreground font-bold">
                            <DollarSign className="w-4 h-4" />
                            {formatCurrency(deal.rate)}
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-semibold ${getPriorityColor(deal.priority)}`}>
                            {deal.priority}
                          </span>
                        </div>

                        {deal.expected_close_date && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                            <Calendar className="w-3 h-3" />
                            {new Date(deal.expected_close_date).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {stageDeals.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-sm font-medium">
                      No deals in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 lg:hidden">
        <h3 className="text-xl font-bold text-foreground mb-4">Pipeline Summary</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-5 rounded-xl bg-chart-1/10 border border-chart-1/20">
            <p className="text-chart-1 text-xs mb-2 font-semibold">Total Deals</p>
            <p className="text-3xl font-bold text-foreground">{stats.totalDeals}</p>
          </div>
          <div className="p-5 rounded-xl bg-chart-2/10 border border-chart-2/20">
            <p className="text-chart-2 text-xs mb-2 font-semibold">Total Value</p>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(stats.totalValue)}</p>
          </div>
          <div className="p-5 rounded-xl bg-chart-3/10 border border-chart-3/20">
            <p className="text-chart-3 text-xs mb-2 font-semibold">Avg Deal Size</p>
            <p className="text-3xl font-bold text-foreground">{formatCurrency(stats.avgDealSize)}</p>
          </div>
          <div className="p-5 rounded-xl bg-chart-4/10 border border-chart-4/20">
            <p className="text-chart-4 text-xs mb-2 font-semibold">High Priority</p>
            <p className="text-3xl font-bold text-foreground">{stats.highPriorityDeals}</p>
          </div>
          {stats.closingSoon > 0 && (
            <div className="p-5 rounded-xl bg-chart-5/10 border border-chart-5/20 col-span-2">
              <p className="text-chart-5 text-xs mb-2 font-semibold">Closing This Week</p>
              <p className="text-3xl font-bold text-foreground">{stats.closingSoon} deal{stats.closingSoon !== 1 ? 's' : ''}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}