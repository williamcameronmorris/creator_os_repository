import { useState, useEffect } from 'react';
import { supabase, type Deal, type Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculatePricing } from '../lib/pricing';
import { Calculator, ArrowRight, Plus, Check, X } from 'lucide-react';

type AssignmentMode = 'none' | 'new' | 'existing';

export function QuickQuoteCalculator() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [objective, setObjective] = useState<'Awareness' | 'Repurposing' | 'Conversion'>('Awareness');
  const [pricingInputs, setPricingInputs] = useState({
    shortFormYoutube: 0,
    shortFormTiktok: 0,
    shortFormInstagram: 0,
    longFormPosts: 0,
    longFormFactor: 'mention' as const,
  });

  const [addOns, setAddOns] = useState({
    paidUsage: false,
    paidUsageDuration: 30,
    whitelisting: false,
    whitelistingDuration: 30,
    exclusivity: false,
    exclusivityCategory: '',
    exclusivityMonths: 3,
    rushLevel: 'None' as const,
  });

  const [calculatedQuote, setCalculatedQuote] = useState<{
    low: number;
    standard: number;
    stretch: number;
  } | null>(null);

  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('none');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [newDealBrand, setNewDealBrand] = useState('');

  useEffect(() => {
    if (user) {
      loadProfile();
      loadDeals();
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setProfile(data);
  };

  const loadDeals = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (data) setDeals(data);
  };

  const handleCalculate = () => {
    if (!profile) {
      setError('Profile not loaded');
      return;
    }

    if (!objective) {
      setError('Please select an objective');
      return;
    }

    const pricing = calculatePricing({
      profile,
      shortFormPosts: {
        youtube: pricingInputs.shortFormYoutube,
        tiktok: pricingInputs.shortFormTiktok,
        instagram: pricingInputs.shortFormInstagram,
      },
      longFormPosts: pricingInputs.longFormPosts,
      longFormFactor: pricingInputs.longFormFactor,
      objective: objective,
      paidUsageDays: addOns.paidUsage ? addOns.paidUsageDuration : undefined,
      whitelistingDays: addOns.whitelisting ? addOns.whitelistingDuration : undefined,
      exclusivityType: addOns.exclusivity ? (addOns.exclusivityCategory.toLowerCase().includes('tight') ? 'tight' : 'loose') : undefined,
      exclusivityMonths: addOns.exclusivity ? addOns.exclusivityMonths : undefined,
      rushLevel: addOns.rushLevel,
    });

    setCalculatedQuote({
      low: pricing.low,
      standard: pricing.standard,
      stretch: pricing.stretch,
    });

    setError('');
    setSuccess('Quote calculated successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleAssignToNewDeal = async () => {
    if (!user || !calculatedQuote || !newDealBrand) {
      setError('Please provide a brand name');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const newDeal: Partial<Deal> = {
        user_id: user.id,
        brand: newDealBrand,
        objective: objective,
        quote_low: calculatedQuote.low,
        quote_standard: calculatedQuote.standard,
        quote_stretch: calculatedQuote.stretch,
        paid_usage: addOns.paidUsage,
        paid_usage_duration: addOns.paidUsageDuration,
        whitelisting: addOns.whitelisting,
        whitelisting_duration: addOns.whitelistingDuration,
        exclusivity: addOns.exclusivity,
        exclusivity_category: addOns.exclusivityCategory,
        exclusivity_months: addOns.exclusivityMonths,
        rush_level: addOns.rushLevel,
        stage: 'Quoted',
      };

      const { error: insertError } = await supabase
        .from('deals')
        .insert(newDeal);

      if (insertError) throw insertError;

      setSuccess('Quote saved to new deal!');
      setCalculatedQuote(null);
      setAssignmentMode('none');
      setNewDealBrand('');
      resetForm();
      loadDeals();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignToExistingDeal = async () => {
    if (!user || !calculatedQuote || !selectedDealId) {
      setError('Please select a deal');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: updateError } = await supabase
        .from('deals')
        .update({
          objective: objective,
          quote_low: calculatedQuote.low,
          quote_standard: calculatedQuote.standard,
          quote_stretch: calculatedQuote.stretch,
          paid_usage: addOns.paidUsage,
          paid_usage_duration: addOns.paidUsageDuration,
          whitelisting: addOns.whitelisting,
          whitelisting_duration: addOns.whitelistingDuration,
          exclusivity: addOns.exclusivity,
          exclusivity_category: addOns.exclusivityCategory,
          exclusivity_months: addOns.exclusivityMonths,
          rush_level: addOns.rushLevel,
          stage: 'Quoted',
        })
        .eq('id', selectedDealId);

      if (updateError) throw updateError;

      setSuccess('Quote assigned to existing deal!');
      setCalculatedQuote(null);
      setAssignmentMode('none');
      setSelectedDealId('');
      resetForm();
      loadDeals();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPricingInputs({
      shortFormYoutube: 0,
      shortFormTiktok: 0,
      shortFormInstagram: 0,
      longFormPosts: 0,
      longFormFactor: 'mention',
    });
    setAddOns({
      paidUsage: false,
      paidUsageDuration: 30,
      whitelisting: false,
      whitelistingDuration: 30,
      exclusivity: false,
      exclusivityCategory: '',
      exclusivityMonths: 3,
      rushLevel: 'None',
    });
    setObjective('Awareness');
  };

  const cancelAssignment = () => {
    setAssignmentMode('none');
    setSelectedDealId('');
    setNewDealBrand('');
    setError('');
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="p-8 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-primary/10">
            <Calculator className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-3xl font-bold text-foreground">
            Quick Quote Calculator
          </h2>
        </div>
        <p className="text-muted-foreground mb-8 font-medium">
          Calculate pricing without creating a deal. Optionally assign the quote to a new or existing deal.
        </p>

        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border-2 border-destructive/20 rounded-2xl text-destructive text-sm flex items-start gap-3 font-medium">
            <X className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-chart-2/10 border-2 border-chart-2/20 rounded-2xl text-chart-2 text-sm flex items-start gap-3 font-medium">
            <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <div className="space-y-8">
          <div>
            <label className="block text-sm font-bold text-foreground mb-3">Objective</label>
            <select
              value={objective}
              onChange={(e) => setObjective(e.target.value as any)}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="Awareness">Awareness</option>
              <option value="Repurposing">Repurposing</option>
              <option value="Conversion">Conversion</option>
            </select>
          </div>

          <div>
            <h3 className="text-xl font-bold text-foreground mb-4">Deliverables</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">YT Shorts</label>
                <input
                  type="number"
                  value={pricingInputs.shortFormYoutube}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, shortFormYoutube: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-foreground mb-2">TikToks</label>
                <input
                  type="number"
                  value={pricingInputs.shortFormTiktok}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, shortFormTiktok: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-foreground mb-2">IG Reels</label>
                <input
                  type="number"
                  value={pricingInputs.shortFormInstagram}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, shortFormInstagram: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Long-Form</label>
                <input
                  type="number"
                  value={pricingInputs.longFormPosts}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, longFormPosts: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-foreground mb-2">LF Type</label>
                <select
                  value={pricingInputs.longFormFactor}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, longFormFactor: e.target.value as any })}
                  className="w-full px-3 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="mention">Mention</option>
                  <option value="adSpot">Ad Spot</option>
                  <option value="dedicated">Dedicated</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-xl font-bold text-foreground mb-4">Add-Ons</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <input
                  type="checkbox"
                  id="quick_paid_usage"
                  checked={addOns.paidUsage}
                  onChange={(e) => setAddOns({ ...addOns, paidUsage: e.target.checked })}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                />
                <label htmlFor="quick_paid_usage" className="text-sm font-semibold text-foreground">Paid Usage</label>
                {addOns.paidUsage && (
                  <>
                    <input
                      type="number"
                      value={addOns.paidUsageDuration}
                      onChange={(e) => setAddOns({ ...addOns, paidUsageDuration: parseInt(e.target.value) || 0 })}
                      placeholder="30"
                      className="w-20 px-2 py-1 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-sm text-muted-foreground font-medium">days</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <input
                  type="checkbox"
                  id="quick_whitelisting"
                  checked={addOns.whitelisting}
                  onChange={(e) => setAddOns({ ...addOns, whitelisting: e.target.checked })}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                />
                <label htmlFor="quick_whitelisting" className="text-sm font-semibold text-foreground">Whitelisting</label>
                {addOns.whitelisting && (
                  <>
                    <input
                      type="number"
                      value={addOns.whitelistingDuration}
                      onChange={(e) => setAddOns({ ...addOns, whitelistingDuration: parseInt(e.target.value) || 0 })}
                      placeholder="30"
                      className="w-20 px-2 py-1 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-sm text-muted-foreground font-medium">days</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                <input
                  type="checkbox"
                  id="quick_exclusivity"
                  checked={addOns.exclusivity}
                  onChange={(e) => setAddOns({ ...addOns, exclusivity: e.target.checked })}
                  className="w-5 h-5 rounded border-border text-primary focus:ring-2 focus:ring-primary/50"
                />
                <label htmlFor="quick_exclusivity" className="text-sm font-semibold text-foreground">Exclusivity</label>
                {addOns.exclusivity && (
                  <>
                    <input
                      type="text"
                      value={addOns.exclusivityCategory}
                      onChange={(e) => setAddOns({ ...addOns, exclusivityCategory: e.target.value })}
                      placeholder="tight/loose"
                      className="flex-1 px-2 py-1 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <input
                      type="number"
                      value={addOns.exclusivityMonths}
                      onChange={(e) => setAddOns({ ...addOns, exclusivityMonths: parseInt(e.target.value) || 0 })}
                      placeholder="3"
                      className="w-20 px-2 py-1 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                    <span className="text-sm text-muted-foreground font-medium">months</span>
                  </>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Rush Level</label>
                <select
                  value={addOns.rushLevel}
                  onChange={(e) => setAddOns({ ...addOns, rushLevel: e.target.value as any })}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="None">None</option>
                  <option value="Standard">Standard Rush (+25-50%)</option>
                  <option value="Extreme">Extreme Rush (+75-150%)</option>
                </select>
              </div>
            </div>
          </div>

          <button
            onClick={handleCalculate}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl flex items-center justify-center gap-2 text-lg py-4 font-semibold transition-colors"
          >
            <Calculator className="w-6 h-6" />
            Calculate Quote
          </button>
        </div>
      </div>

      {calculatedQuote && (
        <div className="p-8 rounded-xl bg-card border border-border animate-scale-in">
          <h3 className="text-2xl font-bold text-foreground mb-6">Calculated Quote</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="p-6 rounded-xl bg-chart-4/10 border border-chart-4/30">
              <div className="text-sm text-chart-4 mb-2 font-semibold">Low</div>
              <div className="text-3xl font-bold text-foreground">${calculatedQuote.low.toLocaleString()}</div>
            </div>
            <div className="p-6 rounded-xl bg-primary/10 border-2 border-primary">
              <div className="text-sm text-primary mb-2 font-semibold">Standard</div>
              <div className="text-3xl font-bold text-foreground">${calculatedQuote.standard.toLocaleString()}</div>
            </div>
            <div className="p-6 rounded-xl bg-chart-2/10 border border-chart-2/30">
              <div className="text-sm text-chart-2 mb-2 font-semibold">Stretch</div>
              <div className="text-3xl font-bold text-foreground">${calculatedQuote.stretch.toLocaleString()}</div>
            </div>
          </div>

          {assignmentMode === 'none' && (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm mb-4 font-medium">
                This quote isn't saved yet. You can assign it to a deal or calculate a new quote.
              </p>
              <div className="flex gap-4">
                <button
                  onClick={() => setAssignmentMode('new')}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl py-3 flex items-center justify-center gap-2 font-semibold transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Create New Deal
                </button>
                <button
                  onClick={() => setAssignmentMode('existing')}
                  className="flex-1 bg-muted text-foreground hover:bg-muted/80 rounded-xl py-3 flex items-center justify-center gap-2 font-semibold transition-colors"
                >
                  <ArrowRight className="w-5 h-5" />
                  Assign to Existing
                </button>
              </div>
            </div>
          )}

          {assignmentMode === 'new' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Brand Name</label>
                <input
                  type="text"
                  value={newDealBrand}
                  onChange={(e) => setNewDealBrand(e.target.value)}
                  placeholder="Enter brand name"
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAssignToNewDeal}
                  disabled={loading || !newDealBrand}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-xl py-3 font-semibold transition-colors"
                >
                  {loading ? 'Saving...' : 'Save to New Deal'}
                </button>
                <button
                  onClick={cancelAssignment}
                  className="bg-muted text-foreground hover:bg-muted/80 rounded-xl px-6 py-3 font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {assignmentMode === 'existing' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-foreground mb-2">Select Deal</label>
                <select
                  value={selectedDealId}
                  onChange={(e) => setSelectedDealId(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Choose a deal...</option>
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.brand || 'Untitled'} - {deal.stage}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAssignToExistingDeal}
                  disabled={loading || !selectedDealId}
                  className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground rounded-xl py-3 font-semibold transition-colors"
                >
                  {loading ? 'Saving...' : 'Assign to Deal'}
                </button>
                <button
                  onClick={cancelAssignment}
                  className="bg-muted text-foreground hover:bg-muted/80 rounded-xl px-6 py-3 font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
