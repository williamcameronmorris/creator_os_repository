import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import KanbanBoard from '../components/KanbanBoard';
import TimelineView from '../components/TimelineView';
import GalleryView from '../components/GalleryView';
import { DealIntake } from '../components/DealIntake';
import DealDetailDrawer from '../components/DealDetailDrawer';
import { GrowSectionCards } from '../components/GrowSectionCards';
import { LayoutGrid, Calendar, Grid3x3, Plus, Lock, Crown } from 'lucide-react';
import { PaywallModal } from '../components/PaywallModal';

type PipelineView = 'kanban' | 'timeline' | 'gallery';

export function Pipeline() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const { darkMode } = useTheme();
  const [pipelineView, setPipelineView] = useState<PipelineView>('kanban');
  const [showNewDeal, setShowNewDeal] = useState(false);
  const [editingDealId, setEditingDealId] = useState<string | undefined>();
  const [selectedDealId, setSelectedDealId] = useState<string | undefined>();
  const [showDetailDrawer, setShowDetailDrawer] = useState(false);
  const [dealsCount, setDealsCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);

  const isPremium = tier === 'paid';
  const dealLimit = isPremium ? 999 : 10;

  useEffect(() => {
    if (user) {
      loadDealsCount();
    }
  }, [user]);

  const loadDealsCount = async () => {
    if (!user) return;
    const { count } = await supabase
      .from('deals')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    setDealsCount(count || 0);
  };

  const handleDealClick = (dealId: string) => {
    setSelectedDealId(dealId);
    setShowDetailDrawer(true);
  };

  const handleCreateDeal = () => {
    if (!isPremium && dealsCount >= dealLimit) {
      setShowPaywall(true);
      return;
    }
    setEditingDealId(undefined);
    setShowNewDeal(true);
  };

  const handleDealSaved = () => {
    setShowNewDeal(false);
    setEditingDealId(undefined);
    loadDealsCount();
  };

  const handleCloseDrawer = () => {
    setShowDetailDrawer(false);
    setSelectedDealId(undefined);
  };

  const handleBackToPipeline = () => {
    setShowNewDeal(false);
    setEditingDealId(undefined);
  };

  if (showNewDeal) {
    return <DealIntake dealId={editingDealId} onSave={handleDealSaved} onBack={handleBackToPipeline} />;
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1 sm:mb-2">
            Deal Pipeline
          </h1>
          <div className="flex items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Track and manage all your brand deals
            </p>
            {!isPremium && (
              <span className="text-xs px-2 py-1 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                {dealsCount}/{dealLimit} deals
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isPremium && dealsCount >= dealLimit ? (
            <button
              onClick={() => setShowPaywall(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg transition-all"
            >
              <Crown className="w-4 h-4" />
              Upgrade for More Deals
            </button>
          ) : (
            <button
              onClick={handleCreateDeal}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-semibold whitespace-nowrap"
            >
              <Plus className="w-5 h-5" />
              <span className="hidden sm:inline">New Deal</span>
              <span className="sm:hidden">New</span>
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center sm:justify-end gap-1 sm:gap-2 p-2 rounded-xl mb-6 bg-card border border-border">
        <button
          onClick={() => setPipelineView('kanban')}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-xl transition-all font-semibold text-sm ${
            pipelineView === 'kanban'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span className="hidden sm:inline">Board</span>
        </button>
        <button
          onClick={() => setPipelineView('timeline')}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-xl transition-all font-semibold text-sm ${
            pipelineView === 'timeline'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="hidden sm:inline">Timeline</span>
        </button>
        <button
          onClick={() => setPipelineView('gallery')}
          className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-xl transition-all font-semibold text-sm ${
            pipelineView === 'gallery'
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          <Grid3x3 className="w-4 h-4" />
          <span className="hidden sm:inline">Gallery</span>
        </button>
      </div>

      {pipelineView === 'kanban' && <KanbanBoard onDealClick={handleDealClick} onCreateDeal={handleCreateDeal} />}
      {pipelineView === 'timeline' && <TimelineView onDealClick={handleDealClick} onCreateDeal={handleCreateDeal} />}
      {pipelineView === 'gallery' && <GalleryView onDealClick={handleDealClick} onCreateDeal={handleCreateDeal} />}

      <GrowSectionCards />

      <DealDetailDrawer
        isOpen={showDetailDrawer}
        onClose={handleCloseDrawer}
        deal={{ id: selectedDealId }}
      />

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="Unlimited Deal Tracking"
      />
    </div>
  );
}
