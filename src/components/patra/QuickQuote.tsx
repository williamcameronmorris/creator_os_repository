import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, type Deal, type DealStage, type Profile } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { calculatePricing, type PricingOutput } from '../../lib/pricing';
import { ArrowRight, Plus, AlertCircle } from 'lucide-react';

// Terracotta = Patra's error color per the brand spec.
const ERROR_COLOR = '#B07050';

const inputCls =
  'w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors';

type AssignmentMode = 'none' | 'new' | 'existing';

interface QuickQuoteProps {
  onDealSaved?: () => void;
}

export function QuickQuote({ onDealSaved }: QuickQuoteProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const [objective, setObjective] = useState<'Awareness' | 'Repurposing' | 'Conversion'>('Awareness');
  const [deliverables, setDeliverables] = useState({
    shortFormYoutube: 0,
    shortFormTiktok: 0,
    shortFormInstagram: 0,
    longFormPosts: 0,
    longFormFactor: 'mention' as 'mention' | 'adSpot' | 'dedicated',
  });
  const [addOns, setAddOns] = useState({
    paidUsage: false,
    paidUsageDuration: 30,
    whitelisting: false,
    whitelistingDuration: 30,
    exclusivity: false,
    exclusivityType: 'loose' as 'loose' | 'tight',
    exclusivityMonths: 3,
    rushLevel: 'None' as 'None' | 'Standard' | 'Extreme',
  });

  const [quote, setQuote] = useState<PricingOutput | null>(null);
  const [assignmentMode, setAssignmentMode] = useState<AssignmentMode>('none');
  const [selectedDealId, setSelectedDealId] = useState('');
  const [newDealBrand, setNewDealBrand] = useState('');

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [profileRes, dealsRes, stagesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('deals').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('deal_stages').select('*').eq('user_id', user.id).order('position', { ascending: true }),
      ]);
      if (profileRes.data) setProfile(profileRes.data);
      if (dealsRes.data) setDeals(dealsRes.data);
      if (stagesRes.data) setStages(stagesRes.data);
    };
    load();
  }, [user]);

  const hasAverages =
    !!profile &&
    (profile.youtube_avg_views > 0 ||
      profile.youtube_shorts_avg_views > 0 ||
      profile.tiktok_avg_views > 0 ||
      profile.instagram_avg_views > 0);

  const handleCalculate = () => {
    if (!profile) {
      setError('Profile not loaded yet — try again in a second.');
      return;
    }
    const pricing = calculatePricing({
      profile,
      shortFormPosts: {
        youtube: deliverables.shortFormYoutube,
        tiktok: deliverables.shortFormTiktok,
        instagram: deliverables.shortFormInstagram,
      },
      longFormPosts: deliverables.longFormPosts,
      longFormFactor: deliverables.longFormFactor,
      objective,
      paidUsageDays: addOns.paidUsage ? addOns.paidUsageDuration : undefined,
      whitelistingDays: addOns.whitelisting ? addOns.whitelistingDuration : undefined,
      exclusivityType: addOns.exclusivity ? addOns.exclusivityType : undefined,
      exclusivityMonths: addOns.exclusivity ? addOns.exclusivityMonths : undefined,
      rushLevel: addOns.rushLevel,
    });
    setQuote(pricing);
    setError('');
  };

  // Find the creator-path "quote" stage for this user (name varies slightly
  // between the seeded stage sets, so match loosely).
  const quoteStageId = (): string | null => {
    const match = stages.find((s) => /quote|pitch/i.test(s.name));
    return match?.id ?? null;
  };

  const quoteFields = () => ({
    objective,
    quote_low: quote!.low,
    quote_standard: quote!.standard,
    quote_stretch: quote!.stretch,
    paid_usage: addOns.paidUsage,
    paid_usage_duration: addOns.paidUsage ? addOns.paidUsageDuration : 0,
    whitelisting: addOns.whitelisting,
    whitelisting_duration: addOns.whitelisting ? addOns.whitelistingDuration : 0,
    exclusivity: addOns.exclusivity,
    exclusivity_category: addOns.exclusivity ? addOns.exclusivityType : '',
    exclusivity_months: addOns.exclusivity ? addOns.exclusivityMonths : 0,
    rush_level: addOns.rushLevel,
    stage: 'Quoted' as const,
    rate: quote!.standard,
  });

  const handleSaveToNewDeal = async () => {
    if (!user || !quote || !newDealBrand.trim()) {
      setError('Enter a brand name first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('deals').insert({
        user_id: user.id,
        brand: newDealBrand.trim(),
        brand_name: newDealBrand.trim(),
        stage_id: quoteStageId(),
        ...quoteFields(),
      });
      if (insertError) throw insertError;
      setFlash(`Quote saved — ${newDealBrand.trim()} added to your deals.`);
      setTimeout(() => setFlash(''), 4000);
      setQuote(null);
      setAssignmentMode('none');
      setNewDealBrand('');
      onDealSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the deal.');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignToExisting = async () => {
    if (!user || !quote || !selectedDealId) {
      setError('Pick a deal first.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: updateError } = await supabase
        .from('deals')
        .update(quoteFields())
        .eq('id', selectedDealId);
      if (updateError) throw updateError;
      setFlash('Quote assigned to the deal.');
      setTimeout(() => setFlash(''), 4000);
      setQuote(null);
      setAssignmentMode('none');
      setSelectedDealId('');
      onDealSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the deal.');
    } finally {
      setSaving(false);
    }
  };

  const fmt = (n: number) => `$${n.toLocaleString()}`;

  return (
    <div className="space-y-6">
      {!hasAverages && profile && (
        <div className="p-4 bg-card border border-border flex items-start gap-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div className="flex-1">
            <p className="text-sm text-foreground mb-1">Your performance averages are empty.</p>
            <p className="t-body mb-3">
              Quotes are CPM-based — set your average views per platform in Settings so the math has something to work with.
            </p>
            <button onClick={() => navigate('/settings')} className="btn-ie px-4 py-2">
              <span className="btn-ie-text">Open settings</span>
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          className="p-3 border text-sm flex items-start gap-2"
          style={{ borderColor: ERROR_COLOR, color: ERROR_COLOR, background: 'color-mix(in srgb, #B07050 8%, transparent)' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {flash && (
        <div className="p-3 bg-card border border-border text-sm text-foreground">
          <span style={{ color: 'var(--accent)' }}>●</span>&nbsp;&nbsp;{flash}
        </div>
      )}

      {/* Inputs */}
      <div className="bg-card border border-border p-6 space-y-8">
        {/* Objective */}
        <div>
          <div className="t-micro mb-3">01 · Objective</div>
          <div className="grid grid-cols-3 gap-2">
            {(['Awareness', 'Repurposing', 'Conversion'] as const).map((o) => (
              <button
                key={o}
                onClick={() => setObjective(o)}
                className={`px-3 py-2.5 border text-xs font-mono uppercase tracking-[0.08em] transition-colors ${
                  objective === o
                    ? 'border-foreground text-foreground bg-foreground/5'
                    : 'border-border text-muted-foreground hover:border-foreground/40'
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        {/* Deliverables */}
        <div>
          <div className="t-micro mb-3">02 · Deliverables</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(
              [
                ['YT Shorts', 'shortFormYoutube'],
                ['TikToks', 'shortFormTiktok'],
                ['IG Reels', 'shortFormInstagram'],
                ['Long-form', 'longFormPosts'],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                <label className="t-micro block mb-1.5">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={deliverables[key]}
                  onChange={(e) =>
                    setDeliverables({ ...deliverables, [key]: Math.max(0, parseInt(e.target.value) || 0) })
                  }
                  className={inputCls}
                />
              </div>
            ))}
            <div>
              <label className="t-micro block mb-1.5">LF Type</label>
              <select
                value={deliverables.longFormFactor}
                onChange={(e) =>
                  setDeliverables({ ...deliverables, longFormFactor: e.target.value as 'mention' | 'adSpot' | 'dedicated' })
                }
                className={inputCls}
              >
                <option value="mention">Mention</option>
                <option value="adSpot">Ad spot</option>
                <option value="dedicated">Dedicated</option>
              </select>
            </div>
          </div>
        </div>

        {/* Add-ons */}
        <div>
          <div className="t-micro mb-3">03 · Add-ons</div>
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 border border-border">
              <input
                type="checkbox"
                id="patra-paid-usage"
                checked={addOns.paidUsage}
                onChange={(e) => setAddOns({ ...addOns, paidUsage: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <label htmlFor="patra-paid-usage" className="text-sm text-foreground flex-1">
                Paid usage <span className="t-micro ml-2">+10–75%</span>
              </label>
              {addOns.paidUsage && (
                <>
                  <input
                    type="number"
                    min={0}
                    value={addOns.paidUsageDuration}
                    onChange={(e) => setAddOns({ ...addOns, paidUsageDuration: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} !w-20`}
                  />
                  <span className="t-micro">days</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 p-3 border border-border">
              <input
                type="checkbox"
                id="patra-whitelisting"
                checked={addOns.whitelisting}
                onChange={(e) => setAddOns({ ...addOns, whitelisting: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <label htmlFor="patra-whitelisting" className="text-sm text-foreground flex-1">
                Whitelisting <span className="t-micro ml-2">+15–90%</span>
              </label>
              {addOns.whitelisting && (
                <>
                  <input
                    type="number"
                    min={0}
                    value={addOns.whitelistingDuration}
                    onChange={(e) => setAddOns({ ...addOns, whitelistingDuration: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} !w-20`}
                  />
                  <span className="t-micro">days</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 p-3 border border-border flex-wrap">
              <input
                type="checkbox"
                id="patra-exclusivity"
                checked={addOns.exclusivity}
                onChange={(e) => setAddOns({ ...addOns, exclusivity: e.target.checked })}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <label htmlFor="patra-exclusivity" className="text-sm text-foreground flex-1">
                Exclusivity <span className="t-micro ml-2">per month</span>
              </label>
              {addOns.exclusivity && (
                <>
                  <select
                    value={addOns.exclusivityType}
                    onChange={(e) => setAddOns({ ...addOns, exclusivityType: e.target.value as 'loose' | 'tight' })}
                    className={`${inputCls} !w-28`}
                  >
                    <option value="loose">Loose</option>
                    <option value="tight">Tight</option>
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={addOns.exclusivityMonths}
                    onChange={(e) => setAddOns({ ...addOns, exclusivityMonths: parseInt(e.target.value) || 0 })}
                    className={`${inputCls} !w-20`}
                  />
                  <span className="t-micro">months</span>
                </>
              )}
            </div>

            <div>
              <label className="t-micro block mb-1.5">Rush level</label>
              <select
                value={addOns.rushLevel}
                onChange={(e) => setAddOns({ ...addOns, rushLevel: e.target.value as 'None' | 'Standard' | 'Extreme' })}
                className={inputCls}
              >
                <option value="None">None</option>
                <option value="Standard">Standard rush (+25–50%)</option>
                <option value="Extreme">Extreme rush (+75–150%)</option>
              </select>
            </div>
          </div>
        </div>

        <button onClick={handleCalculate} className="btn-ie btn-ie-solid w-full py-3">
          <span className="btn-ie-text">Calculate quote</span>
        </button>
      </div>

      {/* Result */}
      {quote && (
        <div className="bg-card border border-border p-6 animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <span className="t-micro">Your quote</span>
            <span className="t-micro">
              {quote.breakdown.expectedViews.toLocaleString()} expected views
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div className="p-5 border border-border">
              <div className="t-micro mb-2">Low</div>
              <div className="font-mono text-2xl text-foreground" style={{ letterSpacing: '-0.02em' }}>
                {fmt(quote.low)}
              </div>
            </div>
            <div className="p-5 border" style={{ borderColor: 'var(--accent)' }}>
              <div className="t-micro mb-2" style={{ color: 'var(--accent)' }}>
                Standard
              </div>
              <div className="font-mono text-2xl text-foreground" style={{ letterSpacing: '-0.02em' }}>
                {fmt(quote.standard)}
              </div>
            </div>
            <div className="p-5 border border-border">
              <div className="t-micro mb-2">Stretch</div>
              <div className="font-mono text-2xl text-foreground" style={{ letterSpacing: '-0.02em' }}>
                {fmt(quote.stretch)}
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="mb-6 border-t border-border pt-4">
            <div className="data-row !py-2">
              <span className="t-micro">Base fee (standard)</span>
              <span className="t-mono text-foreground">{fmt(quote.breakdown.baseFee.standard)}</span>
            </div>
            {quote.breakdown.addOns.paidUsage.high > 0 && (
              <div className="data-row !py-2">
                <span className="t-micro">Paid usage</span>
                <span className="t-mono text-foreground">
                  {fmt(Math.round(quote.breakdown.addOns.paidUsage.low))} – {fmt(Math.round(quote.breakdown.addOns.paidUsage.high))}
                </span>
              </div>
            )}
            {quote.breakdown.addOns.whitelisting.high > 0 && (
              <div className="data-row !py-2">
                <span className="t-micro">Whitelisting</span>
                <span className="t-mono text-foreground">
                  {fmt(Math.round(quote.breakdown.addOns.whitelisting.low))} – {fmt(Math.round(quote.breakdown.addOns.whitelisting.high))}
                </span>
              </div>
            )}
            {quote.breakdown.addOns.exclusivity.high > 0 && (
              <div className="data-row !py-2">
                <span className="t-micro">Exclusivity</span>
                <span className="t-mono text-foreground">
                  {fmt(Math.round(quote.breakdown.addOns.exclusivity.low))} – {fmt(Math.round(quote.breakdown.addOns.exclusivity.high))}
                </span>
              </div>
            )}
            {quote.breakdown.addOns.rush.high > 0 && (
              <div className="data-row !py-2">
                <span className="t-micro">Rush</span>
                <span className="t-mono text-foreground">
                  {fmt(Math.round(quote.breakdown.addOns.rush.low))} – {fmt(Math.round(quote.breakdown.addOns.rush.high))}
                </span>
              </div>
            )}
          </div>

          {assignmentMode === 'none' && (
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setAssignmentMode('new')} className="btn-ie btn-ie-solid flex-1 py-3">
                <span className="btn-ie-text flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5" /> Save as new deal
                </span>
              </button>
              <button onClick={() => setAssignmentMode('existing')} className="btn-ie flex-1 py-3">
                <span className="btn-ie-text flex items-center gap-2">
                  <ArrowRight className="w-3.5 h-3.5" /> Assign to existing
                </span>
              </button>
            </div>
          )}

          {assignmentMode === 'new' && (
            <div className="space-y-3">
              <div>
                <label className="t-micro block mb-1.5">Brand name</label>
                <input
                  type="text"
                  value={newDealBrand}
                  onChange={(e) => setNewDealBrand(e.target.value)}
                  placeholder="Who's the deal with?"
                  className={inputCls}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSaveToNewDeal}
                  disabled={saving || !newDealBrand.trim()}
                  className="btn-ie btn-ie-solid flex-1 py-3 disabled:opacity-50"
                >
                  <span className="btn-ie-text">{saving ? 'Saving…' : 'Save deal'}</span>
                </button>
                <button onClick={() => setAssignmentMode('none')} className="btn-ie px-6 py-3">
                  <span className="btn-ie-text">Cancel</span>
                </button>
              </div>
            </div>
          )}

          {assignmentMode === 'existing' && (
            <div className="space-y-3">
              <div>
                <label className="t-micro block mb-1.5">Select deal</label>
                <select value={selectedDealId} onChange={(e) => setSelectedDealId(e.target.value)} className={inputCls}>
                  <option value="">Choose a deal…</option>
                  {deals.map((deal) => (
                    <option key={deal.id} value={deal.id}>
                      {deal.brand || 'Untitled'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleAssignToExisting}
                  disabled={saving || !selectedDealId}
                  className="btn-ie btn-ie-solid flex-1 py-3 disabled:opacity-50"
                >
                  <span className="btn-ie-text">{saving ? 'Saving…' : 'Assign quote'}</span>
                </button>
                <button onClick={() => setAssignmentMode('none')} className="btn-ie px-6 py-3">
                  <span className="btn-ie-text">Cancel</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
