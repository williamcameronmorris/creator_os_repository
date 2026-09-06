import { useState, useEffect, useCallback } from 'react';
import { supabase, type Deal, type DealInvoiceRecord } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { Plus, X, AlertCircle } from 'lucide-react';

const ERROR_COLOR = '#B07050';

const inputCls =
  'w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors';

const TERMS = ['Due on Receipt', 'Net 15', 'Net 30', 'Net 60'] as const;

const termsToDays = (terms: string) => {
  if (terms === 'Due on Receipt') return 0;
  if (terms === 'Net 30') return 30;
  if (terms === 'Net 60') return 60;
  return 15;
};

const addDays = (isoDate: string, days: number) => {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const today = () => new Date().toISOString().split('T')[0];

export function InvoicesPanel() {
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const [invoices, setInvoices] = useState<DealInvoiceRecord[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    deal_id: '',
    invoice_number: '',
    invoice_amount: 0,
    invoice_date: today(),
    payment_terms: 'Net 15' as string,
    notes: '',
  });

  const load = useCallback(async () => {
    if (!user || !activeBrand) return;
    const [invRes, dealsRes] = await Promise.all([
      supabase.from('deal_invoices').select('*').eq('user_id', user.id).eq('brand_id', activeBrand.id).order('created_at', { ascending: false }),
      supabase.from('deals').select('*').eq('user_id', user.id).eq('brand_id', activeBrand.id).order('created_at', { ascending: false }),
    ]);
    if (invRes.error || dealsRes.error) {
      setError('Could not load invoices.');
    } else {
      setInvoices(invRes.data ?? []);
      setDeals(dealsRes.data ?? []);
      setError('');
    }
    setLoading(false);
  }, [user, activeBrand]);

  useEffect(() => {
    load();
  }, [load]);

  const brandOf = (dealId: string) => deals.find((d) => d.id === dealId)?.brand || 'Untitled';
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`;

  const outstanding = invoices.filter((i) => !i.payment_received_date);
  const outstandingTotal = outstanding.reduce((s, i) => s + (i.invoice_amount || 0), 0);
  const overdueCount = outstanding.filter((i) => i.is_overdue).length;
  const paidTotal = invoices
    .filter((i) => i.payment_received_date)
    .reduce((s, i) => s + (i.invoice_amount || 0), 0);

  const openForm = () => {
    setForm({
      deal_id: '',
      invoice_number: `INV-${String(invoices.length + 1).padStart(3, '0')}`,
      invoice_amount: 0,
      invoice_date: today(),
      payment_terms: 'Net 15',
      notes: '',
    });
    setShowForm(true);
    setError('');
  };

  const handleDealPick = (dealId: string) => {
    const deal = deals.find((d) => d.id === dealId);
    const prefill = deal ? (deal.final_amount > 0 ? deal.final_amount : deal.quote_standard || 0) : 0;
    setForm((f) => ({ ...f, deal_id: dealId, invoice_amount: prefill || f.invoice_amount }));
  };

  const handleCreate = async () => {
    if (!user || !activeBrand) return;
    if (!form.deal_id) {
      setError('Pick the deal this invoice belongs to.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { error: insertError } = await supabase.from('deal_invoices').insert({
        user_id: user.id,
        brand_id: activeBrand.id,
        deal_id: form.deal_id,
        invoice_number: form.invoice_number.trim(),
        invoice_amount: form.invoice_amount,
        invoice_date: form.invoice_date || null,
        due_date: form.invoice_date ? addDays(form.invoice_date, termsToDays(form.payment_terms)) : null,
        payment_terms: form.payment_terms,
        notes: form.notes,
      });
      if (insertError) throw insertError;
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invoice.');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async (invoice: DealInvoiceRecord) => {
    const { error: updateError } = await supabase
      .from('deal_invoices')
      .update({ payment_received_date: today() })
      .eq('id', invoice.id);
    if (updateError) {
      setError('Could not mark the invoice paid.');
      return;
    }
    load();
  };

  const statusChip = (inv: DealInvoiceRecord) => {
    if (inv.payment_received_date)
      return (
        <span className="t-micro" style={{ color: 'var(--accent)' }}>
          PAID
        </span>
      );
    if (inv.is_overdue)
      return (
        <span className="t-micro" style={{ color: ERROR_COLOR }}>
          OVERDUE
        </span>
      );
    return <span className="t-micro text-foreground">SENT</span>;
  };

  if (loading) {
    return <div className="py-16 text-center t-micro">LOADING&hellip;</div>;
  }

  return (
    <div className="space-y-6">
      {error && (
        <div
          className="p-3 border text-sm flex items-start gap-2"
          style={{ borderColor: ERROR_COLOR, color: ERROR_COLOR }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border p-4">
          <div className="t-micro mb-1">Outstanding</div>
          <div className="font-mono text-xl text-foreground">{fmt(outstandingTotal)}</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="t-micro mb-1" style={overdueCount > 0 ? { color: ERROR_COLOR } : undefined}>
            Overdue
          </div>
          <div className="font-mono text-xl text-foreground">{String(overdueCount).padStart(2, '0')}</div>
        </div>
        <div className="bg-card border border-border p-4">
          <div className="t-micro mb-1" style={{ color: 'var(--accent)' }}>
            Collected
          </div>
          <div className="font-mono text-xl text-foreground">{fmt(paidTotal)}</div>
        </div>
      </div>

      {/* Create */}
      {showForm ? (
        <div className="bg-card border border-border p-6 animate-scale-in">
          <div className="flex items-center justify-between mb-6">
            <span className="t-micro">New invoice</span>
            <button
              onClick={() => setShowForm(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="sm:col-span-2">
              <label className="t-micro block mb-1.5">Deal *</label>
              <select value={form.deal_id} onChange={(e) => handleDealPick(e.target.value)} className={inputCls}>
                <option value="">Choose a deal…</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.brand || 'Untitled'}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="t-micro block mb-1.5">Invoice #</label>
              <input
                type="text"
                value={form.invoice_number}
                onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Amount</label>
              <input
                type="number"
                min={0}
                value={form.invoice_amount}
                onChange={(e) => setForm({ ...form, invoice_amount: Math.max(0, parseFloat(e.target.value) || 0) })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Invoice date</label>
              <input
                type="date"
                value={form.invoice_date}
                onChange={(e) => setForm({ ...form, invoice_date: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className="t-micro block mb-1.5">Terms</label>
              <select
                value={form.payment_terms}
                onChange={(e) => setForm({ ...form, payment_terms: e.target.value })}
                className={inputCls}
              >
                {TERMS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {form.invoice_date && (
            <p className="t-micro mb-3">
              Due {addDays(form.invoice_date, termsToDays(form.payment_terms))}
            </p>
          )}
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            placeholder="Notes…"
            className={`${inputCls} mb-4`}
          />
          <div className="flex gap-3">
            <button
              onClick={handleCreate}
              disabled={saving || !form.deal_id}
              className="btn-ie btn-ie-solid flex-1 py-3 disabled:opacity-50"
            >
              <span className="btn-ie-text">{saving ? 'Saving…' : 'Create invoice'}</span>
            </button>
            <button onClick={() => setShowForm(false)} className="btn-ie px-6 py-3">
              <span className="btn-ie-text">Cancel</span>
            </button>
          </div>
        </div>
      ) : (
        <button onClick={openForm} className="btn-ie w-full py-3">
          <span className="btn-ie-text flex items-center gap-2">
            <Plus className="w-3.5 h-3.5" /> New invoice
          </span>
        </button>
      )}

      {/* List */}
      {invoices.length === 0 && !showForm ? (
        <div className="bg-card border border-border py-16 text-center">
          <p className="t-micro mb-2">NO INVOICES YET</p>
          <p className="t-body">Create one when a deal hits the invoiced stage.</p>
        </div>
      ) : (
        invoices.length > 0 && (
          <div className="bg-card border border-border p-5">
            <div className="flex items-center justify-between pb-2 border-b border-border mb-1">
              <span className="t-micro text-foreground">All invoices</span>
              <span className="t-micro">{String(invoices.length).padStart(2, '0')}</span>
            </div>
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-3 py-3 border-b border-border last:border-b-0">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium text-sm truncate">
                      {inv.invoice_number || '—'} · {brandOf(inv.deal_id)}
                    </span>
                    {statusChip(inv)}
                  </div>
                  <div className="t-micro mt-0.5">
                    {inv.invoice_date ? `Sent ${inv.invoice_date}` : 'Not dated'}
                    {inv.due_date ? ` · Due ${inv.due_date}` : ''}
                    {inv.payment_received_date ? ` · Paid ${inv.payment_received_date}` : ''}
                  </div>
                </div>
                <span className="t-mono text-foreground flex-shrink-0">{fmt(inv.invoice_amount || 0)}</span>
                {!inv.payment_received_date && (
                  <button onClick={() => markPaid(inv)} className="btn-ie !px-3 !py-1.5 flex-shrink-0">
                    <span className="btn-ie-text" style={{ fontSize: '9px' }}>
                      Mark paid
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
