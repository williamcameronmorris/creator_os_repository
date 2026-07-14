import { useState } from 'react';
import { supabase, type Deal, type DealStage } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { AlertCircle, X } from 'lucide-react';

const ERROR_COLOR = '#B07050';

const inputCls =
  'w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors';

const PAYMENT_STATUSES = ['Not Started', 'Deposit Paid', 'Fully Paid', 'Overdue'] as const;
const PACKAGES = ['', 'Starter', 'Core', 'Premium', 'Platinum', 'Custom'] as const;

interface DealFormProps {
  deal?: Deal | null; // null/undefined = create
  stages: DealStage[];
  onSaved: () => void;
  onClose: () => void;
}

export function DealForm({ deal, stages, onSaved, onClose }: DealFormProps) {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    brand: deal?.brand ?? '',
    contact_name: deal?.contact_name ?? '',
    contact_email: deal?.contact_email ?? '',
    product: deal?.product ?? '',
    requested_deliverables: deal?.requested_deliverables ?? '',
    recommended_package: deal?.recommended_package ?? ('' as Deal['recommended_package']),
    objective: deal?.objective ?? ('Awareness' as Deal['objective']),
    stage_id: deal?.stage_id ?? stages[0]?.id ?? '',
    quote_low: deal?.quote_low ?? 0,
    quote_standard: deal?.quote_standard ?? 0,
    quote_stretch: deal?.quote_stretch ?? 0,
    final_amount: deal?.final_amount ?? 0,
    payment_status: deal?.payment_status ?? ('Not Started' as Deal['payment_status']),
    brief_date: deal?.brief_date ?? '',
    publish_date: deal?.publish_date ?? '',
    next_followup: deal?.next_followup ?? '',
    notes: deal?.notes ?? '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    if (!user) return;
    if (!form.brand.trim()) {
      setError('Brand is the one required field.');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      brand: form.brand.trim(),
      brand_name: form.brand.trim(), // legacy mirror column, kept coherent
      contact_name: form.contact_name.trim(),
      contact_email: form.contact_email.trim(),
      product: form.product.trim(),
      requested_deliverables: form.requested_deliverables.trim(),
      deliverable_type: form.requested_deliverables.trim(), // legacy mirror column
      recommended_package: form.recommended_package,
      objective: form.objective,
      stage_id: form.stage_id || null,
      quote_low: form.quote_low,
      quote_standard: form.quote_standard,
      quote_stretch: form.quote_stretch,
      final_amount: form.final_amount,
      rate: form.final_amount > 0 ? form.final_amount : form.quote_standard, // legacy mirror column
      payment_status: form.payment_status,
      brief_date: form.brief_date || null,
      publish_date: form.publish_date || null,
      next_followup: form.next_followup || null,
      notes: form.notes,
    };

    try {
      if (deal) {
        const { error: updateError } = await supabase.from('deals').update(payload).eq('id', deal.id);
        if (updateError) throw updateError;
        if (deal.stage_id !== form.stage_id && form.stage_id) {
          const stageName = stages.find((s) => s.id === form.stage_id)?.name ?? 'a new stage';
          await supabase.from('deal_activities').insert({
            deal_id: deal.id,
            user_id: user.id,
            activity_type: 'stage_changed',
            description: `Moved to ${stageName}`,
          });
        }
      } else {
        const { data, error: insertError } = await supabase
          .from('deals')
          .insert({ user_id: user.id, ...payload })
          .select('id')
          .single();
        if (insertError) throw insertError;
        if (data) {
          await supabase.from('deal_activities').insert({
            deal_id: data.id,
            user_id: user.id,
            activity_type: 'created',
            description: `Deal created for ${form.brand.trim()}`,
          });
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the deal.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card border border-border p-6 animate-scale-in">
      <div className="flex items-center justify-between mb-6">
        <span className="t-micro">{deal ? 'Edit deal' : 'New deal'}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div
          className="mb-4 p-3 border text-sm flex items-start gap-2"
          style={{ borderColor: ERROR_COLOR, color: ERROR_COLOR }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <div className="space-y-6">
        {/* Brand + contact */}
        <div>
          <div className="t-micro mb-3">01 · Brand</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="t-micro block mb-1.5">Brand *</label>
              <input type="text" value={form.brand} onChange={(e) => set('brand', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Contact name</label>
              <input type="text" value={form.contact_name} onChange={(e) => set('contact_name', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Contact email</label>
              <input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Scope */}
        <div>
          <div className="t-micro mb-3">02 · Scope</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="t-micro block mb-1.5">Product</label>
              <input type="text" value={form.product} onChange={(e) => set('product', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Package</label>
              <select
                value={form.recommended_package}
                onChange={(e) => set('recommended_package', e.target.value as Deal['recommended_package'])}
                className={inputCls}
              >
                {PACKAGES.map((p) => (
                  <option key={p} value={p}>
                    {p === '' ? 'None' : p}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="t-micro block mb-1.5">Deliverables</label>
              <input
                type="text"
                value={form.requested_deliverables}
                onChange={(e) => set('requested_deliverables', e.target.value)}
                placeholder="e.g. 2 reels + 1 dedicated long-form"
                className={inputCls}
              />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Objective</label>
              <select
                value={form.objective}
                onChange={(e) => set('objective', e.target.value as Deal['objective'])}
                className={inputCls}
              >
                <option value="Awareness">Awareness</option>
                <option value="Repurposing">Repurposing</option>
                <option value="Conversion">Conversion</option>
              </select>
            </div>
            <div>
              <label className="t-micro block mb-1.5">Stage</label>
              <select value={form.stage_id} onChange={(e) => set('stage_id', e.target.value)} className={inputCls}>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Money */}
        <div>
          <div className="t-micro mb-3">03 · Money</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(
              [
                ['Quote low', 'quote_low'],
                ['Quote std', 'quote_standard'],
                ['Quote stretch', 'quote_stretch'],
                ['Final amount', 'final_amount'],
              ] as const
            ).map(([label, key]) => (
              <div key={key}>
                <label className="t-micro block mb-1.5">{label}</label>
                <input
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) => set(key, Math.max(0, parseFloat(e.target.value) || 0))}
                  className={inputCls}
                />
              </div>
            ))}
            <div>
              <label className="t-micro block mb-1.5">Payment</label>
              <select
                value={form.payment_status}
                onChange={(e) => set('payment_status', e.target.value as Deal['payment_status'])}
                className={inputCls}
              >
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Dates + notes */}
        <div>
          <div className="t-micro mb-3">04 · Dates &amp; notes</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div>
              <label className="t-micro block mb-1.5">Brief date</label>
              <input type="date" value={form.brief_date ?? ''} onChange={(e) => set('brief_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Publish date</label>
              <input type="date" value={form.publish_date ?? ''} onChange={(e) => set('publish_date', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Next follow-up</label>
              <input type="date" value={form.next_followup ?? ''} onChange={(e) => set('next_followup', e.target.value)} className={inputCls} />
            </div>
          </div>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={3}
            placeholder="Notes, red flags, context…"
            className={inputCls}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={handleSave} disabled={saving} className="btn-ie btn-ie-solid flex-1 py-3 disabled:opacity-50">
            <span className="btn-ie-text">{saving ? 'Saving…' : deal ? 'Save changes' : 'Create deal'}</span>
          </button>
          <button onClick={onClose} className="btn-ie px-6 py-3">
            <span className="btn-ie-text">Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
}
