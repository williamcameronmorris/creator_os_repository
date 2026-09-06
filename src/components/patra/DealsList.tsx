import { useState, useEffect, useCallback } from 'react';
import { supabase, type Deal, type DealStage } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { DealForm } from './DealForm';
import { Plus, Pencil } from 'lucide-react';

const ERROR_COLOR = '#B07050';

const selectCls =
  'px-2 py-1 bg-background border border-border text-foreground focus:outline-none focus:border-accent transition-colors font-mono text-[10px] uppercase tracking-[0.08em]';

const CATEGORY_LABELS: Record<string, string> = {
  opportunity: 'Opportunity',
  delivery: 'Delivery',
  payment_renewal: 'Payment & renewal',
};

export function DealsList() {
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const [stages, setStages] = useState<DealStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  const load = useCallback(async () => {
    if (!user || !activeBrand) return;
    const [stagesRes, dealsRes] = await Promise.all([
      supabase.from('deal_stages').select('*').eq('user_id', user.id).eq('brand_id', activeBrand.id).order('position', { ascending: true }),
      supabase.from('deals').select('*').eq('user_id', user.id).eq('brand_id', activeBrand.id).order('created_at', { ascending: false }),
    ]);
    if (stagesRes.error || dealsRes.error) {
      setError('Could not load your deals. Pull to refresh or try again.');
    } else {
      setStages(stagesRes.data ?? []);
      setDeals(dealsRes.data ?? []);
      setError('');
    }
    setLoading(false);
  }, [user, activeBrand]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStageChange = async (deal: Deal, newStageId: string) => {
    if (!user || !activeBrand || newStageId === deal.stage_id) return;
    // Optimistic update; reconcile on error.
    setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage_id: newStageId } : d)));
    const { error: updateError } = await supabase.from('deals').update({ stage_id: newStageId }).eq('id', deal.id);
    if (updateError) {
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? { ...d, stage_id: deal.stage_id } : d)));
      setError('Stage change did not save — try again.');
      return;
    }
    const stageName = stages.find((s) => s.id === newStageId)?.name ?? 'a new stage';
    await supabase.from('deal_activities').insert({
      deal_id: deal.id,
      user_id: user.id,
      brand_id: activeBrand.id,
      activity_type: 'stage_changed',
      description: `Moved to ${stageName}`,
    });
  };

  const dealValue = (d: Deal) => (d.final_amount > 0 ? d.final_amount : d.quote_standard || 0);
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const closedStageIds = new Set(stages.filter((s) => /closed|lost/i.test(s.name)).map((s) => s.id));
  const activeDeals = deals.filter((d) => !d.stage_id || !closedStageIds.has(d.stage_id));
  const pipelineValue = activeDeals.reduce((sum, d) => sum + dealValue(d), 0);
  const paidValue = deals.filter((d) => d.payment_status === 'Fully Paid').reduce((sum, d) => sum + dealValue(d), 0);

  const unstaged = deals.filter((d) => !d.stage_id || !stages.some((s) => s.id === d.stage_id));

  const openEdit = (deal: Deal) => {
    setEditingDeal(deal);
    setShowForm(true);
  };
  const openNew = () => {
    setEditingDeal(null);
    setShowForm(true);
  };
  const handleSaved = () => {
    setShowForm(false);
    setEditingDeal(null);
    load();
  };

  const paymentChip = (status: Deal['payment_status']) => {
    if (status === 'Fully Paid') return <span className="t-micro" style={{ color: 'var(--accent)' }}>PAID</span>;
    if (status === 'Overdue') return <span className="t-micro" style={{ color: ERROR_COLOR }}>OVERDUE</span>;
    if (status === 'Deposit Paid') return <span className="t-micro text-foreground">DEPOSIT</span>;
    return null;
  };

  const renderDealRow = (deal: Deal) => (
    <div key={deal.id} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-foreground font-medium text-sm truncate">{deal.brand || 'Untitled'}</span>
          {paymentChip(deal.payment_status)}
        </div>
        <div className="t-micro mt-0.5 truncate">
          {[deal.requested_deliverables, deal.recommended_package].filter(Boolean).join(' · ') || deal.product || '—'}
        </div>
      </div>
      <span className="t-mono text-foreground flex-shrink-0">{dealValue(deal) > 0 ? fmt(dealValue(deal)) : '—'}</span>
      <select
        value={deal.stage_id ?? ''}
        onChange={(e) => handleStageChange(deal, e.target.value)}
        className={`${selectCls} flex-shrink-0 max-w-[130px]`}
        aria-label={`Stage for ${deal.brand || 'untitled deal'}`}
      >
        {!deal.stage_id && <option value="">Unstaged</option>}
        {stages.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => openEdit(deal)}
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        aria-label={`Edit ${deal.brand || 'untitled deal'}`}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  if (loading) {
    return <div className="py-16 text-center t-micro">LOADING&hellip;</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 border text-sm" style={{ borderColor: ERROR_COLOR, color: ERROR_COLOR }}>
          {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border p-4">
          <div className="t-micro mb-1">Active</div>
          <div className="font-mono text-xl text-foreground">{String(activeDeals.length).padStart(2, '0')}</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="t-micro mb-1">Pipeline</div>
          <div className="font-mono text-xl text-foreground">{fmt(pipelineValue)}</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="t-micro mb-1" style={{ color: 'var(--accent)' }}>Collected</div>
          <div className="font-mono text-xl text-foreground">{fmt(paidValue)}</div>
        </div>
      </div>

      {showForm ? (
        <DealForm deal={editingDeal} stages={stages} onSaved={handleSaved} onClose={() => setShowForm(false)} />
      ) : (
        <button onClick={openNew} className="btn-ie w-full py-3">
          <span className="btn-ie-text flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> New deal
          </span>
        </button>
      )}

      {deals.length === 0 && !showForm ? (
        <div className="bg-card border border-border py-16 text-center">
          <p className="t-micro mb-2">NO DEALS YET</p>
          <p className="t-body">Run a quote and save it as a deal — or add one above.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {unstaged.length > 0 && (
            <div className="bg-card border border-border p-5">
              <div className="flex items-center justify-between pb-2 border-b border-border mb-1">
                <span className="t-micro text-foreground">Unstaged</span>
                <span className="t-micro">{String(unstaged.length).padStart(2, '0')}</span>
              </div>
              {unstaged.map(renderDealRow)}
            </div>
          )}

          {stages.map((stage, i) => {
            const stageDeals = deals.filter((d) => d.stage_id === stage.id);
            if (stageDeals.length === 0) return null;
            const prev = stages[i - 1];
            const showCategory =
              !!stage.stage_category && (!prev || prev.stage_category !== stage.stage_category);
            return (
              <div key={stage.id}>
                {showCategory && (
                  <div className="t-micro mb-2" style={{ color: 'var(--accent)' }}>
                    {CATEGORY_LABELS[stage.stage_category!] ?? stage.stage_category}
                  </div>
                )}
                <div className="bg-card border border-border p-5">
                  <div className="flex items-center justify-between pb-2 border-b border-border mb-1">
                    <span className="t-micro text-foreground">{stage.name}</span>
                    <span className="t-micro">
                      {String(stageDeals.length).padStart(2, '0')} · {fmt(stageDeals.reduce((s, d) => s + dealValue(d), 0))}
                    </span>
                  </div>
                  {stageDeals.map(renderDealRow)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
