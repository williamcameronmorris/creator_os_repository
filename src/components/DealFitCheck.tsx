import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle2, XCircle, AlertTriangle, Save } from 'lucide-react';

interface DealFitCheckProps {
  dealId: string;
  onScoreChange?: (score: number) => void;
}

interface FitCheckData {
  id?: string;
  audience_match: boolean;
  content_match: boolean;
  brand_safety: boolean;
  budget_realistic: boolean;
  timeline_realistic: boolean;
  usage_clarity: boolean;
  payment_terms_clear: boolean;
  has_real_brief: boolean;
  fit_score: number;
  fit_notes: string;
}

export function DealFitCheck({ dealId, onScoreChange }: DealFitCheckProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fitCheck, setFitCheck] = useState<FitCheckData>({
    audience_match: false,
    content_match: false,
    brand_safety: false,
    budget_realistic: false,
    timeline_realistic: false,
    usage_clarity: false,
    payment_terms_clear: false,
    has_real_brief: false,
    fit_score: 0,
    fit_notes: '',
  });

  useEffect(() => {
    if (dealId && user) {
      loadFitCheck();
    }
  }, [dealId, user]);

  useEffect(() => {
    const score = calculateScore();
    setFitCheck(prev => ({ ...prev, fit_score: score }));
    onScoreChange?.(score);
  }, [
    fitCheck.audience_match,
    fitCheck.content_match,
    fitCheck.brand_safety,
    fitCheck.budget_realistic,
    fitCheck.timeline_realistic,
    fitCheck.usage_clarity,
    fitCheck.payment_terms_clear,
    fitCheck.has_real_brief,
  ]);

  const loadFitCheck = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_fit_checks')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setFitCheck(data);
      }
    } catch (error) {
      console.error('Error loading fit check:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateScore = () => {
    let score = 0;
    if (fitCheck.audience_match) score += 13;
    if (fitCheck.content_match) score += 13;
    if (fitCheck.brand_safety) score += 12;
    if (fitCheck.budget_realistic) score += 13;
    if (fitCheck.timeline_realistic) score += 12;
    if (fitCheck.usage_clarity) score += 13;
    if (fitCheck.payment_terms_clear) score += 12;
    if (fitCheck.has_real_brief) score += 12;
    return score;
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const dataToSave = {
        deal_id: dealId,
        user_id: user.id,
        ...fitCheck,
        fit_score: calculateScore(),
      };

      if (fitCheck.id) {
        const { error } = await supabase
          .from('deal_fit_checks')
          .update(dataToSave)
          .eq('id', fitCheck.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('deal_fit_checks')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        if (data) setFitCheck(data);
      }

      await supabase
        .from('deals')
        .update({ fit_check_completed: true })
        .eq('id', dealId);

    } catch (error) {
      console.error('Error saving fit check:', error);
    } finally {
      setSaving(false);
    }
  };

  const toggleCriteria = (field: keyof FitCheckData) => {
    setFitCheck(prev => ({
      ...prev,
      [field]: !prev[field as keyof FitCheckData],
    }));
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return 'Excellent Fit';
    if (score >= 60) return 'Good Fit';
    if (score >= 40) return 'Moderate Fit';
    return 'Poor Fit';
  };

  const criteria = [
    { key: 'audience_match' as keyof FitCheckData, label: 'Audience Match', description: 'Does their audience align with my niche?' },
    { key: 'content_match' as keyof FitCheckData, label: 'Content Match', description: 'Does my content style fit their brand message?' },
    { key: 'brand_safety' as keyof FitCheckData, label: 'Brand Safety', description: 'No reputation risks or red flags?' },
    { key: 'budget_realistic' as keyof FitCheckData, label: 'Budget Realistic', description: 'Does their budget match the scope?' },
    { key: 'timeline_realistic' as keyof FitCheckData, label: 'Timeline Realistic', description: 'Can I deliver on their timeline?' },
    { key: 'usage_clarity' as keyof FitCheckData, label: 'Usage Rights Clear', description: 'Are usage rights clearly defined?' },
    { key: 'payment_terms_clear' as keyof FitCheckData, label: 'Payment Terms Clear', description: 'Payment structure agreed upon?' },
    { key: 'has_real_brief' as keyof FitCheckData, label: 'Has Real Brief', description: 'Actual brief vs. "make something cool"?' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const score = calculateScore();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-foreground">Deal Fit Check</h3>
          <p className="text-sm text-muted-foreground">Evaluate whether this deal is a good fit</p>
        </div>
        <div className="text-right">
          <div className={`text-4xl font-bold ${getScoreColor(score)}`}>
            {score}
          </div>
          <div className={`text-sm font-semibold ${getScoreColor(score)}`}>
            {getScoreLabel(score)}
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-muted/30 border border-border">
        <div className="flex items-start gap-3">
          {score >= 80 ? (
            <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
          ) : score >= 60 ? (
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
          ) : (
            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
          )}
          <div>
            <p className="text-sm font-semibold text-foreground">
              {score >= 80 && 'This deal looks like a great opportunity!'}
              {score >= 60 && score < 80 && 'This deal has potential but needs attention.'}
              {score < 60 && 'Consider carefully before proceeding with this deal.'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Check all criteria that apply to calculate your fit score.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {criteria.map(criterion => (
          <button
            key={criterion.key}
            onClick={() => toggleCriteria(criterion.key)}
            className="w-full p-4 rounded-xl bg-card border border-border hover:border-primary/50 transition-all text-left group"
          >
            <div className="flex items-start gap-3">
              <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                fitCheck[criterion.key]
                  ? 'bg-primary border-primary'
                  : 'border-border group-hover:border-primary/50'
              }`}>
                {fitCheck[criterion.key] && (
                  <CheckCircle2 className="w-4 h-4 text-primary-foreground" />
                )}
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">{criterion.label}</div>
                <div className="text-sm text-muted-foreground">{criterion.description}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">
          Additional Notes
        </label>
        <textarea
          value={fitCheck.fit_notes}
          onChange={(e) => setFitCheck(prev => ({ ...prev, fit_notes: e.target.value }))}
          placeholder="Any additional context about this deal..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Saving...' : 'Save Fit Check'}
      </button>
    </div>
  );
}
