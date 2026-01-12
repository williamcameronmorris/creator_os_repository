import { useState, useEffect } from 'react';
import { supabase, type Deal } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit, Trash2, Calendar, DollarSign, Calculator, Copy, CreditCard, CheckCircle, Clock, XCircle, ArrowRight, Files, TrendingUp, Target, Package } from 'lucide-react';
import { useToast, ToastContainer } from './Toast';

type DealTrackerProps = {
  onNewDeal: () => void;
  onEditDeal: (dealId: string) => void;
};

export function DealTracker({ onNewDeal, onEditDeal }: DealTrackerProps) {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStage, setFilterStage] = useState<string>('all');
  const { toasts, showToast, removeToast } = useToast();

  useEffect(() => {
    if (user) {
      loadDeals();
    }
  }, [user]);

  const loadDeals = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user?.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setDeals(data);
    }
    setLoading(false);
  };

  const deleteDeal = async (id: string) => {
    if (!confirm('Are you sure you want to delete this deal?')) return;

    const { error } = await supabase.from('deals').delete().eq('id', id);
    if (!error) {
      showToast('Deal deleted successfully', 'success');
      loadDeals();
    } else {
      showToast('Failed to delete deal', 'error');
    }
  };

  const duplicateDeal = async (deal: Deal) => {
    const { id, created_at, ...dealData } = deal;
    const newDeal = {
      ...dealData,
      brand: `${deal.brand} (Copy)`,
      stage: 'Intake' as Deal['stage'],
      payment_status: 'Not Started' as Deal['payment_status'],
      follow_up_count: 0,
      next_followup: null,
    };

    const { error } = await supabase.from('deals').insert([newDeal]);
    if (!error) {
      showToast('Deal duplicated successfully', 'success');
      loadDeals();
    } else {
      showToast('Failed to duplicate deal', 'error');
    }
  };

  const handleFollowUp = async (deal: Deal) => {
    const newCount = deal.follow_up_count + 1;
    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + 3);

    const { error } = await supabase
      .from('deals')
      .update({
        follow_up_count: newCount,
        next_followup: nextFollowUp.toISOString().split('T')[0],
      })
      .eq('id', deal.id);

    if (!error) {
      showToast('Follow-up tracked, reminder set for 3 days', 'success');
      loadDeals();
    }
  };

  const handleNoResponse = async (deal: Deal) => {
    const { error } = await supabase
      .from('deals')
      .update({
        stage: 'Closed',
        next_followup: null,
        notes: deal.notes + `\n\n[${new Date().toLocaleDateString()}] Closed due to no response after ${deal.follow_up_count + 1} follow-ups.`,
      })
      .eq('id', deal.id);

    if (!error) {
      showToast('Deal closed due to no response', 'info');
      loadDeals();
    }
  };

  const handleMoveForward = async (deal: Deal) => {
    const newStage = deal.stage === 'Quoted' ? 'Negotiating' : 'Contracted';
    const { error } = await supabase
      .from('deals')
      .update({
        stage: newStage,
        follow_up_count: deal.follow_up_count + 1,
        next_followup: null,
      })
      .eq('id', deal.id);

    if (!error) {
      showToast(`Deal moved to ${newStage}`, 'success');
      loadDeals();
    }
  };

  const getFollowUpGuidance = (deal: Deal) => {
    if (deal.follow_up_count === 0) {
      return {
        title: 'First Follow-Up',
        message: 'Send a friendly check-in asking if they had a chance to review your proposal.',
        color: 'blue',
      };
    } else if (deal.follow_up_count === 1) {
      return {
        title: 'Second Follow-Up',
        message: 'Offer additional value or ask if they need any clarification on your proposal.',
        color: 'yellow',
      };
    } else {
      return {
        title: 'Decision Point',
        message: 'Time to decide: archive this deal or move it forward if you\'ve heard back.',
        color: 'red',
      };
    }
  };

  const updatePaymentStatus = async (id: string, status: Deal['payment_status']) => {
    const { error } = await supabase
      .from('deals')
      .update({ payment_status: status })
      .eq('id', id);
    if (!error) {
      showToast(`Payment status updated to ${status}`, 'success');
      loadDeals();
    }
  };

  const updateDealStage = async (id: string, stage: Deal['stage']) => {
    const { error } = await supabase
      .from('deals')
      .update({ stage })
      .eq('id', id);
    if (!error) {
      showToast(`Deal stage updated to ${stage}`, 'success');
      loadDeals();
    }
  };

  const copyQuoteEmail = (deal: Deal) => {
    const emailText = `Hi ${deal.contact_name || 'there'},

Based on expected views from my recent performance, here are three package options for ${deal.brand}:

📊 Low: $${deal.quote_low.toLocaleString()}
📊 Standard: $${deal.quote_standard.toLocaleString()}
📊 Stretch: $${deal.quote_stretch.toLocaleString()}

Same deliverables, different rights and production tiers. If you share your budget range, I can recommend the best fit and lock in a timeline.

Looking forward to working together!`;

    navigator.clipboard.writeText(emailText);
    showToast('Quote email copied to clipboard!', 'success');
  };

  const filteredDeals = filterStage === 'all' ? deals : deals.filter(d => d.stage === filterStage);

  const getStageColor = (stage: Deal['stage']) => {
    const colors = {
      Intake: 'bg-slate-500/20 text-slate-200 border-slate-500/30',
      Quoted: 'bg-sky-500/20 text-sky-200 border-sky-500/30',
      Negotiating: 'bg-amber-500/20 text-amber-200 border-amber-500/30',
      Contracted: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
      'In Production': 'bg-orange-500/20 text-orange-200 border-orange-500/30',
      Delivered: 'bg-sky-500/20 text-sky-200 border-sky-500/30',
      Closed: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
    };
    return colors[stage] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  const getStageProgressColor = (stage: Deal['stage']) => {
    const colors = {
      Intake: 'bg-slate-500',
      Quoted: 'bg-sky-500',
      Negotiating: 'bg-amber-500',
      Contracted: 'bg-emerald-500',
      'In Production': 'bg-orange-500',
      Delivered: 'bg-sky-500',
      Closed: 'bg-gray-500',
    };
    return colors[stage] || 'bg-slate-500';
  };

  const getPaymentStatusColor = (status: Deal['payment_status']) => {
    const colors = {
      'Not Started': 'bg-slate-500/20 text-slate-200 border-slate-500/30',
      'Deposit Paid': 'bg-amber-500/20 text-amber-200 border-amber-500/30',
      'Fully Paid': 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30',
      Overdue: 'bg-red-500/20 text-red-200 border-red-500/30',
    };
    return colors[status] || 'bg-slate-500/20 text-slate-300 border-slate-500/30';
  };

  const stages = ['all', 'Intake', 'Quoted', 'Negotiating', 'Contracted', 'In Production', 'Delivered', 'Closed'];

  const totalValue = deals
    .filter(d => d.final_amount > 0)
    .reduce((sum, d) => sum + d.final_amount, 0);

  const paidDeals = deals.filter(d => d.payment_status === 'Fully Paid').length;
  const avgDealSize = totalValue > 0 ? Math.round(totalValue / deals.filter(d => d.final_amount > 0).length) : 0;
  const pipelineValue = deals
    .filter(d => ['Intake', 'Quoted', 'Negotiating', 'Contracted', 'In Production'].includes(d.stage))
    .reduce((sum, d) => sum + (d.final_amount > 0 ? d.final_amount : d.quote_standard), 0);

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <div className="max-w-7xl mx-auto animate-fade-in">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2">Deal Pipeline</h2>
              <p className="text-slate-400 text-sm">Track and manage your brand partnerships</p>
            </div>
            <button
              onClick={onNewDeal}
              className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-lg transition-all-smooth shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 flex items-center justify-center gap-2 touch-manipulation focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
            >
              <Plus className="w-5 h-5" />
              <span>New Deal</span>
            </button>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 hover:border-sky-500/30 transition-all-smooth shadow-lg hover:shadow-sky-500/10 group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-sky-500/10 rounded-lg group-hover:bg-sky-500/20 transition-colors">
                  <Target className="w-4 h-4 text-sky-400" />
                </div>
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Pipeline Value</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">${pipelineValue.toLocaleString()}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                <TrendingUp className="w-3 h-3" />
                <span>Active deals</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 hover:border-emerald-500/30 transition-all-smooth shadow-lg hover:shadow-emerald-500/10 group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-emerald-500/10 rounded-lg group-hover:bg-emerald-500/20 transition-colors">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                </div>
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Total Revenue</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">${totalValue.toLocaleString()}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                <TrendingUp className="w-3 h-3" />
                <span>Closed deals</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 hover:border-amber-500/30 transition-all-smooth shadow-lg hover:shadow-amber-500/10 group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-amber-500/10 rounded-lg group-hover:bg-amber-500/20 transition-colors">
                  <Package className="w-4 h-4 text-amber-400" />
                </div>
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Avg Deal Size</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">${avgDealSize.toLocaleString()}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                <TrendingUp className="w-3 h-3" />
                <span>Per partnership</span>
              </div>
            </div>

            <div className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl p-5 hover:border-sky-500/30 transition-all-smooth shadow-lg hover:shadow-sky-500/10 group">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-sky-500/10 rounded-lg group-hover:bg-sky-500/20 transition-colors">
                  <CheckCircle className="w-4 h-4 text-sky-400" />
                </div>
                <span className="text-xs sm:text-sm text-slate-400 font-medium">Paid Deals</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-white">{paidDeals}</div>
              <div className="flex items-center gap-1 mt-2 text-xs text-slate-500">
                <TrendingUp className="w-3 h-3" />
                <span>Fully completed</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {stages.map(stage => {
            const count = stage === 'all' ? deals.length : deals.filter(d => d.stage === stage).length;
            const isActive = filterStage === stage;

            return (
              <button
                key={stage}
                onClick={() => setFilterStage(stage)}
                className={`px-4 py-2.5 rounded-lg font-medium text-sm whitespace-nowrap transition-all-smooth touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                  isActive
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105'
                    : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/70 hover:text-white border border-slate-700/50 hover:border-slate-600 focus:ring-slate-500'
                }`}
              >
                {stage === 'all' ? 'All Deals' : stage}
                <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${
                  isActive ? 'bg-white/20' : 'bg-slate-700'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 animate-fade-in">
            <div className="inline-block p-4 bg-slate-800/50 rounded-xl border border-slate-700 shadow-lg">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <p className="text-slate-300 font-medium">Loading deals...</p>
              </div>
            </div>
          </div>
        ) : filteredDeals.length === 0 ? (
          <div className="text-center py-20 animate-scale-in">
            <div className="max-w-md mx-auto bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-10 shadow-xl">
              <div className="mb-6 inline-block p-4 bg-blue-500/10 rounded-full">
                <Plus className="w-12 h-12 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">
                {filterStage === 'all' ? 'No deals yet' : `No ${filterStage} deals`}
              </h3>
              <p className="text-slate-400 mb-6">
                {filterStage === 'all'
                  ? 'Start tracking your brand partnerships and manage your pipeline'
                  : `You don't have any deals in ${filterStage} stage`}
              </p>
              {filterStage === 'all' ? (
                <button
                  onClick={onNewDeal}
                  className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold rounded-lg transition-all-smooth shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  Create Your First Deal
                </button>
              ) : (
                <button
                  onClick={() => setFilterStage('all')}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded-lg transition-all-smooth focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  View All Deals
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {filteredDeals.map((deal) => (
              <div
                key={deal.id}
                className="bg-gradient-to-br from-slate-800/80 to-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 sm:p-8 hover:border-slate-600 hover:shadow-2xl hover:shadow-slate-900/50 transition-all-smooth group animate-scale-in"
              >
                <div className="flex items-start justify-between mb-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-xl sm:text-2xl font-bold text-white truncate">
                        {deal.brand || 'Untitled Deal'}
                      </h3>
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${getStageColor(deal.stage)}`}>
                        {deal.stage}
                      </span>
                    </div>
                    {deal.product && (
                      <p className="text-slate-400 text-sm truncate">{deal.product}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                    <button
                      onClick={() => duplicateDeal(deal)}
                      className="p-2.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all-smooth hover:scale-110 touch-manipulation focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      title="Duplicate deal"
                    >
                      <Files className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => onEditDeal(deal.id)}
                      className="p-2.5 hover:bg-blue-500/20 rounded-lg text-slate-400 hover:text-blue-400 transition-all-smooth hover:scale-110 touch-manipulation focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      title="Edit deal"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteDeal(deal.id)}
                      className="p-2.5 hover:bg-red-500/20 rounded-lg text-slate-400 hover:text-red-400 transition-all-smooth hover:scale-110 touch-manipulation focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      title="Delete deal"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="text-xs font-medium text-slate-400 mb-3 flex items-center justify-between">
                    <span>Deal Progress</span>
                    <span className="text-slate-500">Click to change stage</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {['Intake', 'Quoted', 'Negotiating', 'Contracted', 'In Production', 'Delivered', 'Closed'].map((stage, index) => {
                      const isActive = deal.stage === stage;
                      const stageIndex = ['Intake', 'Quoted', 'Negotiating', 'Contracted', 'In Production', 'Delivered', 'Closed'].indexOf(deal.stage);
                      const isPast = stageIndex > index;
                      const stageColor = getStageProgressColor(stage as Deal['stage']);

                      return (
                        <div key={stage} className="flex items-center flex-1 group/stage relative">
                          <button
                            onClick={() => updateDealStage(deal.id, stage as Deal['stage'])}
                            className={`h-3 w-full rounded-full transition-all-smooth hover:scale-105 hover:shadow-lg touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 ${
                              isActive
                                ? `${stageColor} shadow-lg ring-2 ring-white/20`
                                : isPast
                                ? 'bg-emerald-500 opacity-60'
                                : 'bg-slate-700 hover:bg-slate-600'
                            }`}
                            title={`Set stage to ${stage}`}
                          />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 bg-slate-900 text-white text-xs rounded shadow-lg opacity-0 group-hover/stage:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
                            {stage}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2">
                    <span className="text-xs text-slate-500">Start</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      deal.stage === 'Closed' ? 'bg-gray-500/20 text-gray-300' : `${getStageProgressColor(deal.stage)} text-white bg-opacity-20`
                    }`}>{deal.stage}</span>
                    <span className="text-xs text-slate-500">Complete</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-2">Payment Status</div>
                    <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold border ${getPaymentStatusColor(deal.payment_status)}`}>
                      {deal.payment_status}
                    </span>
                  </div>

                  {deal.recommended_package && (
                    <div>
                      <div className="text-xs font-medium text-slate-500 mb-2">Package</div>
                      <div className="text-white font-semibold text-sm truncate">{deal.recommended_package}</div>
                    </div>
                  )}

                  {deal.objective && (
                    <div className="col-span-2">
                      <div className="text-xs font-medium text-slate-500 mb-2">Objective</div>
                      <div className="text-white font-semibold text-sm truncate">{deal.objective}</div>
                    </div>
                  )}
                </div>

                {(deal.quote_low > 0 || deal.final_amount > 0) && (
                  <div className="border-t border-slate-700/50 pt-6 mb-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {deal.quote_low > 0 && (
                        <>
                          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
                            <div className="text-xs font-medium text-slate-400 mb-2">Low Package</div>
                            <div className="text-white font-bold text-lg">${deal.quote_low.toLocaleString()}</div>
                          </div>
                          <div className="bg-slate-700/30 rounded-lg p-4 border border-sky-500/30">
                            <div className="text-xs font-medium text-slate-400 mb-2">Standard Package</div>
                            <div className="text-sky-300 font-bold text-lg">${deal.quote_standard.toLocaleString()}</div>
                          </div>
                          <div className="bg-slate-700/30 rounded-lg p-4 border border-slate-600/30">
                            <div className="text-xs font-medium text-slate-400 mb-2">Stretch Package</div>
                            <div className="text-white font-bold text-lg">${deal.quote_stretch.toLocaleString()}</div>
                          </div>
                        </>
                      )}
                      {deal.final_amount > 0 && (
                        <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/30">
                          <div className="text-xs font-medium text-emerald-400 mb-2">Final Amount</div>
                          <div className="text-emerald-300 font-bold text-xl">${deal.final_amount.toLocaleString()}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-700/50 pt-6 mb-6">
                  <div className="flex flex-wrap gap-3">
                    {deal.stage === 'Intake' && deal.quote_low === 0 && (
                      <button
                        onClick={() => onEditDeal(deal.id)}
                        className="px-5 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/50 text-sky-200 rounded-lg transition-all-smooth hover:scale-105 hover:shadow-lg hover:shadow-sky-500/20 flex items-center gap-2 text-sm font-semibold touch-manipulation focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      >
                        <Calculator className="w-4 h-4" />
                        <span className="hidden sm:inline">Calculate Quote</span>
                        <span className="sm:hidden">Quote</span>
                      </button>
                    )}

                    {deal.stage === 'Quoted' && deal.quote_low > 0 && (
                      <button
                        onClick={() => copyQuoteEmail(deal)}
                        className="px-5 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/50 text-sky-200 rounded-lg transition-all-smooth hover:scale-105 hover:shadow-lg hover:shadow-sky-500/20 flex items-center gap-2 text-sm font-semibold touch-manipulation focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      >
                        <Copy className="w-4 h-4" />
                        <span className="hidden sm:inline">Copy Quote Email</span>
                        <span className="sm:hidden">Copy</span>
                      </button>
                    )}

                    {deal.stage === 'Contracted' && deal.payment_status === 'Not Started' && (
                      <button
                        onClick={() => updatePaymentStatus(deal.id, 'Deposit Paid')}
                        className="px-5 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-200 rounded-lg transition-all-smooth hover:scale-105 hover:shadow-lg hover:shadow-amber-500/20 flex items-center gap-2 text-sm font-semibold touch-manipulation focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span className="hidden sm:inline">Mark Deposit Paid</span>
                        <span className="sm:hidden">Deposit</span>
                      </button>
                    )}

                    {deal.stage === 'Delivered' && deal.payment_status !== 'Fully Paid' && (
                      <button
                        onClick={() => updatePaymentStatus(deal.id, 'Fully Paid')}
                        className="px-5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-200 rounded-lg transition-all-smooth hover:scale-105 hover:shadow-lg hover:shadow-emerald-500/20 flex items-center gap-2 text-sm font-semibold touch-manipulation focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span className="hidden sm:inline">Mark Fully Paid</span>
                        <span className="sm:hidden">Paid</span>
                      </button>
                    )}
                  </div>
                </div>

              {(deal.stage === 'Quoted' || deal.stage === 'Negotiating') && deal.next_followup && (
                <div className="border-t border-slate-700 pt-4 mb-4">
                  {(() => {
                    const guidance = getFollowUpGuidance(deal);
                    const today = new Date().toISOString().split('T')[0];
                    const isOverdue = deal.next_followup <= today;

                    const colorClasses = {
                      blue: 'border-blue-500/30 bg-blue-500/5',
                      yellow: 'border-yellow-500/30 bg-yellow-500/5',
                      red: 'border-red-500/30 bg-red-500/5',
                    };

                    return (
                      <div className={`border rounded-lg p-4 ${colorClasses[guidance.color as keyof typeof colorClasses]}`}>
                        <div className="flex items-start gap-3 mb-3">
                          <Clock className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                            isOverdue ? 'text-red-400' : 'text-slate-400'
                          }`} />
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-white text-sm">{guidance.title}</h4>
                              <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full">
                                Follow-up #{deal.follow_up_count + 1}
                              </span>
                              {isOverdue && (
                                <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded-full">
                                  Overdue
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 mb-3">{guidance.message}</p>

                            {deal.follow_up_count < 2 ? (
                              <button
                                onClick={() => handleFollowUp(deal)}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-2 touch-manipulation w-full sm:w-auto justify-center"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span className="hidden sm:inline">Mark as Followed Up (Set reminder for 3 days)</span>
                                <span className="sm:hidden">Followed Up (3 days)</span>
                              </button>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <button
                                  onClick={() => handleNoResponse(deal)}
                                  className="px-3 sm:px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 touch-manipulation"
                                >
                                  <XCircle className="w-4 h-4" />
                                  <span className="hidden sm:inline">No Response - Close Deal</span>
                                  <span className="sm:hidden">Close Deal</span>
                                </button>
                                <button
                                  onClick={() => handleMoveForward(deal)}
                                  className="px-3 sm:px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 touch-manipulation"
                                >
                                  <ArrowRight className="w-4 h-4" />
                                  <span className="hidden sm:inline">Move to {deal.stage === 'Quoted' ? 'Negotiating' : 'Contracted'}</span>
                                  <span className="sm:hidden">Move Forward</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              <div className="flex flex-wrap gap-3 sm:gap-4 text-xs sm:text-sm">
                {deal.contact_name && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <span>Contact:</span>
                    <span className="text-white truncate max-w-[150px]">{deal.contact_name}</span>
                  </div>
                )}

                {deal.next_followup && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Follow-up:</span>
                    <span className="text-white">{new Date(deal.next_followup).toLocaleDateString()}</span>
                  </div>
                )}

                {deal.publish_date && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Calendar className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Publish:</span>
                    <span className="text-white">{new Date(deal.publish_date).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {deal.notes && (
                <div className="mt-4 pt-4 border-t border-slate-700">
                  <div className="text-xs text-slate-500 mb-1">Notes</div>
                  <div className="text-slate-300 text-xs sm:text-sm line-clamp-3">{deal.notes}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </>
  );
}
