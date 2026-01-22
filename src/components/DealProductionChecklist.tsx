import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, Circle, AlertCircle, Calendar, FileText, Save } from 'lucide-react';
import { format } from 'date-fns';

interface DealProductionChecklistProps {
  dealId: string;
}

interface ProductionData {
  id?: string;
  draft_delivered_date: string | null;
  draft_file_url: string;
  feedback_received_date: string | null;
  feedback_notes: string;
  revisions_delivered_date: string | null;
  final_approved_date: string | null;
  post_published_date: string | null;
  post_url: string;
  is_overdue: boolean;
}

export function DealProductionChecklist({ dealId }: DealProductionChecklistProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [production, setProduction] = useState<ProductionData>({
    draft_delivered_date: null,
    draft_file_url: '',
    feedback_received_date: null,
    feedback_notes: '',
    revisions_delivered_date: null,
    final_approved_date: null,
    post_published_date: null,
    post_url: '',
    is_overdue: false,
  });

  useEffect(() => {
    if (dealId && user) {
      loadProduction();
    }
  }, [dealId, user]);

  const loadProduction = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_production_checklist')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProduction(data);
      }
    } catch (error) {
      console.error('Error loading production checklist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const dataToSave = {
        deal_id: dealId,
        user_id: user.id,
        ...production,
      };

      if (production.id) {
        const { error } = await supabase
          .from('deal_production_checklist')
          .update(dataToSave)
          .eq('id', production.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('deal_production_checklist')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        if (data) setProduction(data);
      }

      const productionStatus = production.post_published_date
        ? 'live'
        : production.final_approved_date
        ? 'approved'
        : production.revisions_delivered_date || production.feedback_received_date
        ? 'revisions'
        : production.draft_delivered_date
        ? 'draft'
        : 'not_started';

      await supabase
        .from('deals')
        .update({ production_status: productionStatus })
        .eq('id', dealId);

    } catch (error) {
      console.error('Error saving production checklist:', error);
    } finally {
      setSaving(false);
    }
  };

  const isStepComplete = (date: string | null) => {
    return date !== null;
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'Not set';
    try {
      return format(new Date(date), 'MMM d, yyyy');
    } catch {
      return 'Invalid date';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const steps = [
    {
      title: 'Draft Delivered',
      dateField: 'draft_delivered_date' as keyof ProductionData,
      urlField: 'draft_file_url' as keyof ProductionData,
      urlLabel: 'Draft File URL',
      icon: FileText,
    },
    {
      title: 'Feedback Received',
      dateField: 'feedback_received_date' as keyof ProductionData,
      notesField: 'feedback_notes' as keyof ProductionData,
      notesLabel: 'Feedback Notes',
      icon: FileText,
    },
    {
      title: 'Revisions Delivered',
      dateField: 'revisions_delivered_date' as keyof ProductionData,
      icon: FileText,
    },
    {
      title: 'Final Approved',
      dateField: 'final_approved_date' as keyof ProductionData,
      icon: CheckCircle2,
    },
    {
      title: 'Post Published',
      dateField: 'post_published_date' as keyof ProductionData,
      urlField: 'post_url' as keyof ProductionData,
      urlLabel: 'Post URL',
      icon: CheckCircle2,
    },
  ];

  const completedSteps = steps.filter(step => isStepComplete(production[step.dateField] as string | null)).length;
  const progressPercentage = (completedSteps / steps.length) * 100;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground mb-1">Production Checklist</h3>
        <p className="text-sm text-muted-foreground">Track milestones from draft to publication</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-foreground">
            {completedSteps} of {steps.length} completed
          </span>
          <span className="text-sm font-semibold text-foreground">{Math.round(progressPercentage)}%</span>
        </div>
        <div className="w-full bg-muted rounded-full h-3">
          <div
            className="bg-primary h-3 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {production.is_overdue && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Production Overdue</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                One or more milestones have passed their deadline.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {steps.map((step, index) => {
          const isComplete = isStepComplete(production[step.dateField] as string | null);
          const Icon = step.icon;

          return (
            <div
              key={step.title}
              className={`p-5 rounded-xl border transition-all ${
                isComplete
                  ? 'bg-green-500/10 border-green-500/20'
                  : 'bg-card border-border'
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  isComplete
                    ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {isComplete ? (
                    <CheckCircle2 className="w-6 h-6" />
                  ) : (
                    <span className="font-bold">{index + 1}</span>
                  )}
                </div>

                <div className="flex-1 space-y-3">
                  <div>
                    <h4 className="font-bold text-foreground">{step.title}</h4>
                    {isComplete && (
                      <p className="text-sm text-muted-foreground mt-1">
                        Completed on {formatDate(production[step.dateField] as string | null)}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-2">
                      <Calendar className="w-4 h-4 inline mr-1" />
                      Date
                    </label>
                    <input
                      type="date"
                      value={production[step.dateField] as string || ''}
                      onChange={(e) => setProduction(prev => ({
                        ...prev,
                        [step.dateField]: e.target.value || null,
                      }))}
                      className="w-full px-4 py-2 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>

                  {step.urlField && (
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        {step.urlLabel}
                      </label>
                      <input
                        type="url"
                        value={production[step.urlField] as string || ''}
                        onChange={(e) => setProduction(prev => ({
                          ...prev,
                          [step.urlField!]: e.target.value,
                        }))}
                        placeholder="https://"
                        className="w-full px-4 py-2 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  )}

                  {step.notesField && (
                    <div>
                      <label className="block text-sm font-semibold text-foreground mb-2">
                        {step.notesLabel}
                      </label>
                      <textarea
                        value={production[step.notesField] as string || ''}
                        onChange={(e) => setProduction(prev => ({
                          ...prev,
                          [step.notesField!]: e.target.value,
                        }))}
                        placeholder="Enter feedback details..."
                        rows={3}
                        className="w-full px-4 py-2 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Saving...' : 'Save Progress'}
      </button>
    </div>
  );
}
