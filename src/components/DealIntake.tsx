import { useState, useEffect } from 'react';
import { supabase, type Deal, type Profile, type DealTemplate } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { calculatePricing } from '../lib/pricing';
import { packageDefaults } from '../lib/smartDefaults';
import { Save, Calculator, AlertCircle, ChevronLeft, ChevronRight, ArrowLeft, Send } from 'lucide-react';

type DealIntakeProps = {
  dealId?: string;
  template?: DealTemplate;
  onSave?: () => void;
  onBack?: () => void;
};

export function DealIntake({ dealId, template, onSave, onBack }: DealIntakeProps) {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState<Partial<Deal>>({
    brand: '',
    contact_name: '',
    contact_email: '',
    product: '',
    category: '',
    source: '',
    objective: template?.objective || 'Awareness',
    outcome_wanted: '',
    requested_deliverables: '',
    recommended_package: template?.recommended_package || '',
    paid_usage: template?.paid_usage || false,
    paid_usage_duration: template?.paid_usage_duration || 0,
    whitelisting: template?.whitelisting || false,
    whitelisting_duration: template?.whitelisting_duration || 0,
    exclusivity: template?.exclusivity || false,
    exclusivity_category: template?.exclusivity_category || '',
    exclusivity_months: template?.exclusivity_months || 0,
    rush_level: template?.rush_level || 'None',
    budget_shared: false,
    budget_range: '',
    red_flags: '',
    quote_low: 0,
    quote_standard: 0,
    quote_stretch: 0,
    stage: 'Intake',
    follow_up_count: 0,
    notes: '',
  });

  const [pricingInputs, setPricingInputs] = useState({
    shortFormYoutube: template?.short_form_youtube || 0,
    shortFormTiktok: template?.short_form_tiktok || 0,
    shortFormInstagram: template?.short_form_instagram || 0,
    longFormPosts: template?.long_form_posts || 0,
    longFormFactor: (template?.long_form_factor || 'mention') as const,
  });

  const steps = [
    { number: 1, title: 'Basic Info' },
    { number: 2, title: 'Objectives' },
    { number: 3, title: 'Add-Ons' },
    { number: 4, title: 'Pricing' },
    { number: 5, title: 'Review' },
  ];

  useEffect(() => {
    if (user) {
      loadProfile();
      if (dealId) {
        loadDeal();
      }
    }
  }, [user, dealId]);

  useEffect(() => {
    if (formData.recommended_package && packageDefaults[formData.recommended_package]) {
      const defaults = packageDefaults[formData.recommended_package];

      setPricingInputs({
        shortFormYoutube: defaults.shortFormYoutube,
        shortFormTiktok: defaults.shortFormTiktok,
        shortFormInstagram: defaults.shortFormInstagram,
        longFormPosts: defaults.longFormPosts,
        longFormFactor: defaults.longFormFactor,
      });

      setFormData((prev) => ({
        ...prev,
        paid_usage: defaults.paidUsage,
        paid_usage_duration: defaults.paidUsageDuration,
        whitelisting: defaults.whitelisting,
        whitelisting_duration: defaults.whitelistingDuration,
        exclusivity: defaults.exclusivity,
        exclusivity_category: defaults.exclusivityCategory,
        exclusivity_months: defaults.exclusivityMonths,
        rush_level: defaults.rushLevel,
      }));
    }
  }, [formData.recommended_package]);

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (data) setProfile(data);
  };

  const loadDeal = async () => {
    if (!dealId) return;
    const { data } = await supabase
      .from('deals')
      .select('*')
      .eq('id', dealId)
      .maybeSingle();
    if (data) setFormData(data);
  };

  const handleCalculate = () => {
    if (!profile) {
      setError('Profile not loaded');
      return;
    }

    if (!formData.objective || formData.objective === '') {
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
      objective: formData.objective as 'Awareness' | 'Repurposing' | 'Conversion',
      paidUsageDays: formData.paid_usage ? formData.paid_usage_duration : undefined,
      whitelistingDays: formData.whitelisting ? formData.whitelisting_duration : undefined,
      exclusivityType: formData.exclusivity ? (formData.exclusivity_category.toLowerCase().includes('tight') ? 'tight' : 'loose') : undefined,
      exclusivityMonths: formData.exclusivity ? formData.exclusivity_months : undefined,
      rushLevel: formData.rush_level,
    });

    setFormData({
      ...formData,
      quote_low: pricing.low,
      quote_standard: pricing.standard,
      quote_stretch: pricing.stretch,
    });

    setSuccess(`Calculated: Low $${pricing.low.toLocaleString()} | Standard $${pricing.standard.toLocaleString()} | Stretch $${pricing.stretch.toLocaleString()}`);
    setTimeout(() => setSuccess(''), 5000);
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (dealId) {
        const { error: updateError } = await supabase
          .from('deals')
          .update(formData)
          .eq('id', dealId);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('deals')
          .insert({ ...formData, user_id: user.id });
        if (insertError) throw insertError;
      }

      setSuccess('Deal saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
      if (onSave) onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 sm:space-y-8 pb-24 sm:pb-8">
      {/* Header with Back Button */}
      <div className="flex items-start gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="mt-1 p-2 rounded-xl bg-card border border-border hover:bg-muted transition-colors"
            aria-label="Back to Deal Pipeline"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            {dealId ? 'Edit Deal' : 'Create New Deal'}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Follow the steps below to {dealId ? 'update' : 'add'} deal information, calculate quotes, and save to your pipeline.
          </p>
        </div>
      </div>

      {template && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2">
            <span className="text-blue-300 text-sm">Using template:</span>
            <span className="text-foreground font-semibold">{template.name}</span>
          </div>
          {template.description && (
            <p className="text-blue-300 text-sm mt-1">{template.description}</p>
          )}
        </div>
      )}

      {/* Progress Timeline */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-center w-full">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center flex-1">
              <div className="flex flex-col items-center w-full">
                <button
                  onClick={() => {
                    setCurrentStep(step.number);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-sm sm:text-base transition-all cursor-pointer hover:scale-110 ${
                    step.number === currentStep
                      ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                      : step.number < currentStep
                      ? 'bg-green-500 text-white hover:bg-green-600'
                      : 'bg-card border-2 border-border text-muted-foreground hover:border-primary hover:text-primary'
                  }`}
                  aria-label={`Go to step ${step.number}: ${step.title}`}
                >
                  {step.number}
                </button>
                <div className={`mt-2 text-xs sm:text-sm font-medium text-center whitespace-nowrap ${
                  step.number === currentStep ? 'text-primary' : 'text-muted-foreground'
                }`}>
                  {step.title}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`h-1 flex-1 mx-2 rounded-full transition-all ${
                  step.number < currentStep ? 'bg-green-500' : 'bg-border'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 sm:p-6 shadow-lg">
        <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4 sm:mb-6">
          {steps[currentStep - 1].title}
        </h2>

        {error && (
          <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm">
            {success}
          </div>
        )}

        {currentStep === 1 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Brand</label>
              <input
                type="text"
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Contact Name</label>
              <input
                type="text"
                value={formData.contact_name}
                onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Contact Email</label>
              <input
                type="email"
                value={formData.contact_email}
                onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Product</label>
              <input
                type="text"
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Category</label>
              <input
                type="text"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Source</label>
              <input
                type="text"
                value={formData.source}
                onChange={(e) => setFormData({ ...formData, source: e.target.value })}
                placeholder="Where they found you"
                className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
              />
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Objective</label>
                <select
                  value={formData.objective}
                  onChange={(e) => setFormData({ ...formData, objective: e.target.value as Deal['objective'] })}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                >
                  <option value="">Select objective</option>
                  <option value="Awareness">Awareness</option>
                  <option value="Repurposing">Repurposing</option>
                  <option value="Conversion">Conversion</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Recommended Package</label>
                <select
                  value={formData.recommended_package}
                  onChange={(e) => setFormData({ ...formData, recommended_package: e.target.value as Deal['recommended_package'] })}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                >
                  <option value="">Select package</option>
                  <option value="Starter">Starter</option>
                  <option value="Core">Core</option>
                  <option value="Premium">Premium</option>
                  <option value="Platinum">Platinum</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>

            {formData.recommended_package && packageDefaults[formData.recommended_package] && (
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-sm text-blue-300">
                Smart defaults applied for {formData.recommended_package} package. You can adjust values in the next steps.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Outcome Wanted (Plain English)</label>
              <textarea
                value={formData.outcome_wanted}
                onChange={(e) => setFormData({ ...formData, outcome_wanted: e.target.value })}
                rows={3}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Requested Deliverables</label>
              <textarea
                value={formData.requested_deliverables}
                onChange={(e) => setFormData({ ...formData, requested_deliverables: e.target.value })}
                rows={4}
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="paid_usage"
                  checked={formData.paid_usage}
                  onChange={(e) => setFormData({ ...formData, paid_usage: e.target.checked })}
                  className="w-5 h-5 rounded bg-background border-2 border-border text-primary focus:ring-2 focus:ring-primary"
                />
                <label htmlFor="paid_usage" className="text-sm font-medium text-foreground">Paid Usage</label>
                {formData.paid_usage && (
                  <>
                    <input
                      type="number"
                      value={formData.paid_usage_duration}
                      onChange={(e) => setFormData({ ...formData, paid_usage_duration: parseInt(e.target.value) || 0 })}
                      placeholder="30"
                      className="w-20 px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="whitelisting"
                  checked={formData.whitelisting}
                  onChange={(e) => setFormData({ ...formData, whitelisting: e.target.checked })}
                  className="w-5 h-5 rounded bg-background border-2 border-border text-primary focus:ring-2 focus:ring-primary"
                />
                <label htmlFor="whitelisting" className="text-sm font-medium text-foreground">Whitelisting</label>
                {formData.whitelisting && (
                  <>
                    <input
                      type="number"
                      value={formData.whitelisting_duration}
                      onChange={(e) => setFormData({ ...formData, whitelisting_duration: parseInt(e.target.value) || 0 })}
                      placeholder="30"
                      className="w-20 px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">days</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="exclusivity"
                  checked={formData.exclusivity}
                  onChange={(e) => setFormData({ ...formData, exclusivity: e.target.checked })}
                  className="w-5 h-5 rounded bg-background border-2 border-border text-primary focus:ring-2 focus:ring-primary"
                />
                <label htmlFor="exclusivity" className="text-sm font-medium text-foreground">Exclusivity</label>
                {formData.exclusivity && (
                  <>
                    <input
                      type="number"
                      value={formData.exclusivity_months}
                      onChange={(e) => setFormData({ ...formData, exclusivity_months: parseInt(e.target.value) || 0 })}
                      placeholder="3"
                      className="w-20 px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                    <span className="text-sm text-muted-foreground">months</span>
                  </>
                )}
              </div>
            </div>

            {formData.exclusivity && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Exclusivity Category</label>
                <input
                  type="text"
                  value={formData.exclusivity_category}
                  onChange={(e) => setFormData({ ...formData, exclusivity_category: e.target.value })}
                  placeholder="e.g., 'Tight - no health supplements' or 'Loose - no protein powder'"
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Rush Level</label>
                <select
                  value={formData.rush_level}
                  onChange={(e) => setFormData({ ...formData, rush_level: e.target.value as Deal['rush_level'] })}
                  className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                >
                  <option value="None">None</option>
                  <option value="Standard">Standard Rush (+25-50%)</option>
                  <option value="Extreme">Extreme Rush (+75-150%)</option>
                </select>
              </div>

              <div className="flex items-center gap-3 pt-7">
                <input
                  type="checkbox"
                  id="budget_shared"
                  checked={formData.budget_shared}
                  onChange={(e) => setFormData({ ...formData, budget_shared: e.target.checked })}
                  className="w-5 h-5 rounded bg-background border-2 border-border text-primary focus:ring-2 focus:ring-primary"
                />
                <label htmlFor="budget_shared" className="text-sm font-medium text-foreground">Budget Shared?</label>
                {formData.budget_shared && (
                  <input
                    type="text"
                    value={formData.budget_range}
                    onChange={(e) => setFormData({ ...formData, budget_range: e.target.value })}
                    placeholder="e.g., $2,000-$5,000"
                    className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">Red Flags</label>
              <textarea
                value={formData.red_flags}
                onChange={(e) => setFormData({ ...formData, red_flags: e.target.value })}
                rows={3}
                placeholder="List any red flags or concerns..."
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </div>
          </div>
        )}

        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-300">
                Enter the <span className="font-semibold">number of videos requested for deal</span>. Pricing is calculated based on your average views per post (set in Settings).
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-200 mb-2">YT Shorts</label>
                <input
                  type="number"
                  value={pricingInputs.shortFormYoutube}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, shortFormYoutube: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-2 bg-background border border-border rounded-xl text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-200 mb-2">TikToks</label>
                <input
                  type="number"
                  value={pricingInputs.shortFormTiktok}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, shortFormTiktok: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-2 bg-background border border-border rounded-xl text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-200 mb-2">IG Reels</label>
                <input
                  type="number"
                  value={pricingInputs.shortFormInstagram}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, shortFormInstagram: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-2 bg-background border border-border rounded-xl text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-200 mb-2">Long-Form</label>
                <input
                  type="number"
                  value={pricingInputs.longFormPosts}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, longFormPosts: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 sm:px-4 py-2 bg-background border border-border rounded-xl text-foreground text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-slate-200 mb-2">LF Type</label>
                <select
                  value={pricingInputs.longFormFactor}
                  onChange={(e) => setPricingInputs({ ...pricingInputs, longFormFactor: e.target.value as any })}
                  className="w-full px-3 sm:px-4 py-2 bg-background border border-border rounded-xl text-foreground text-xs sm:text-base focus:outline-none focus:ring-2 focus:ring-primary transition-all"
                >
                  <option value="mention">Mention</option>
                  <option value="adSpot">Ad Spot</option>
                  <option value="dedicated">Dedicated</option>
                </select>
              </div>
            </div>

            <button
              onClick={handleCalculate}
              className="w-full sm:w-auto px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
            >
              <Calculator className="w-5 h-5" />
              <span>Calculate Quotes</span>
            </button>

            {formData.quote_low > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="text-sm text-muted-foreground mb-1">Low</div>
                  <div className="text-2xl font-bold text-foreground">${formData.quote_low.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-card border-2 border-primary rounded-xl shadow-lg shadow-primary/20">
                  <div className="text-sm text-muted-foreground mb-1">Standard</div>
                  <div className="text-2xl font-bold text-foreground">${formData.quote_standard.toLocaleString()}</div>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="text-sm text-muted-foreground mb-1">Stretch</div>
                  <div className="text-2xl font-bold text-foreground">${formData.quote_stretch.toLocaleString()}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {currentStep === 5 && (
          <div className="space-y-6">
            <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4">
              <h3 className="font-semibold text-foreground mb-3">Deal Summary</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Brand:</span>
                  <span className="text-foreground ml-2 font-medium">{formData.brand || 'Not set'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Contact:</span>
                  <span className="text-foreground ml-2 font-medium">{formData.contact_name || 'Not set'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Objective:</span>
                  <span className="text-foreground ml-2 font-medium">{formData.objective || 'Not set'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Package:</span>
                  <span className="text-foreground ml-2 font-medium">{formData.recommended_package || 'Not set'}</span>
                </div>
              </div>
            </div>

            {formData.quote_low > 0 && (
              <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4">
                <h3 className="font-semibold text-foreground mb-3">Quote Tiers</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Low</div>
                    <div className="text-xl font-bold text-foreground">${formData.quote_low.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Standard</div>
                    <div className="text-xl font-bold text-primary">${formData.quote_standard.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Stretch</div>
                    <div className="text-xl font-bold text-foreground">${formData.quote_stretch.toLocaleString()}</div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-2">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={4}
                placeholder="Add any additional notes about this deal..."
                className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all resize-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="fixed bottom-16 left-0 right-0 sm:relative sm:bottom-auto bg-card/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t border-border sm:border-0 p-4 sm:p-0 flex justify-between gap-3 z-50">
        <div className="flex gap-3">
          <button
            onClick={prevStep}
            disabled={currentStep === 1}
            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed text-foreground font-semibold rounded-xl transition-colors flex items-center gap-2 text-sm sm:text-base"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Previous</span>
            <span className="sm:hidden">Prev</span>
          </button>

          {currentStep === steps.length && (
            <button
              onClick={async () => {
                await handleSave();
              }}
              disabled={loading}
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-muted hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed text-foreground font-semibold rounded-xl transition-colors flex items-center gap-2 text-sm sm:text-base"
            >
              <Save className="w-4 h-4 sm:w-5 sm:h-5" />
              <span className="hidden sm:inline">{loading ? 'Saving...' : 'Save Draft'}</span>
              <span className="sm:hidden">{loading ? 'Saving...' : 'Save'}</span>
            </button>
          )}
        </div>

        {currentStep < steps.length ? (
          <button
            onClick={nextStep}
            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-colors flex items-center gap-2 text-sm sm:text-base shadow-lg"
          >
            <span>Next</span>
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        ) : (
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 sm:px-8 py-3 sm:py-3.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all flex items-center gap-2 text-base sm:text-lg shadow-xl hover:shadow-green-500/50"
          >
            <Send className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>{loading ? 'Submitting...' : 'Submit to Pipeline'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
