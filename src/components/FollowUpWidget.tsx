import { useState, useEffect } from 'react';
import { supabase, type Deal } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Clock, AlertCircle, CheckCircle, XCircle, ArrowRight } from 'lucide-react';

type FollowUpWidgetProps = {
  onViewDeal?: (dealId: string) => void;
};

export function FollowUpWidget({ onViewDeal }: FollowUpWidgetProps) {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadFollowUps();
    }
  }, [user]);

  const loadFollowUps = async () => {
    setLoading(true);
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user?.id)
      .in('stage', ['Quoted', 'Negotiating'])
      .not('next_followup', 'is', null)
      .lte('next_followup', today)
      .order('next_followup', { ascending: true });

    if (!error && data) {
      setDeals(data);
    }
    setLoading(false);
  };

  const handleFollowUp = async (deal: Deal) => {
    const newCount = deal.follow_up_count + 1;
    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + 3);

    await supabase
      .from('deals')
      .update({
        follow_up_count: newCount,
        next_followup: nextFollowUp.toISOString().split('T')[0],
      })
      .eq('id', deal.id);

    loadFollowUps();
  };

  const handleNoResponse = async (deal: Deal) => {
    await supabase
      .from('deals')
      .update({
        stage: 'Closed',
        next_followup: null,
        notes: deal.notes + `\n\n[${new Date().toLocaleDateString()}] Closed due to no response after ${deal.follow_up_count + 1} follow-ups.`,
      })
      .eq('id', deal.id);

    loadFollowUps();
  };

  const handleMoveForward = async (deal: Deal) => {
    const newStage = deal.stage === 'Quoted' ? 'Negotiating' : 'Contracted';
    await supabase
      .from('deals')
      .update({
        stage: newStage,
        follow_up_count: deal.follow_up_count + 1,
        next_followup: null,
      })
      .eq('id', deal.id);

    loadFollowUps();
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

  if (loading) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <div className="text-slate-400">Loading follow-ups...</div>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-10 h-10 bg-green-500/20 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">All Caught Up!</h3>
            <p className="text-sm text-slate-400">No follow-ups needed today</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-xl p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="flex items-center justify-center w-10 h-10 bg-orange-500/20 rounded-lg">
          <Clock className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Follow-Up Reminders</h3>
          <p className="text-sm text-slate-400">{deals.length} deal{deals.length !== 1 ? 's' : ''} need{deals.length === 1 ? 's' : ''} your attention</p>
        </div>
      </div>

      <div className="space-y-4">
        {deals.map((deal) => {
          const guidance = getFollowUpGuidance(deal);
          const colorClasses = {
            blue: 'border-blue-500/30 bg-blue-500/5',
            yellow: 'border-yellow-500/30 bg-yellow-500/5',
            red: 'border-red-500/30 bg-red-500/5',
          };

          return (
            <div
              key={deal.id}
              className={`border rounded-lg p-4 ${colorClasses[guidance.color as keyof typeof colorClasses]}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-white">{deal.brand}</h4>
                    <span className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full">
                      Follow-up #{deal.follow_up_count + 1}
                    </span>
                  </div>
                  <p className="text-sm text-slate-400 mb-2">{deal.product}</p>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" />
                    <span>Due: {new Date(deal.next_followup!).toLocaleDateString()}</span>
                  </div>
                </div>
                {onViewDeal && (
                  <button
                    onClick={() => onViewDeal(deal.id)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="mb-3 p-3 bg-slate-900/50 rounded-lg">
                <div className="text-xs font-medium text-slate-300 mb-1">{guidance.title}</div>
                <div className="text-xs text-slate-400">{guidance.message}</div>
              </div>

              {deal.follow_up_count < 2 ? (
                <button
                  onClick={() => handleFollowUp(deal)}
                  className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  Mark as Followed Up
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleNoResponse(deal)}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <XCircle className="w-4 h-4" />
                    No Response
                  </button>
                  <button
                    onClick={() => handleMoveForward(deal)}
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Move Forward
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
