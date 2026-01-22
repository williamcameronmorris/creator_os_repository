import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { DollarSign, FileText, Calendar, AlertTriangle, CheckCircle, Save } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface DealInvoiceProps {
  dealId: string;
}

interface InvoiceData {
  id?: string;
  invoice_number: string;
  invoice_amount: number;
  invoice_date: string | null;
  due_date: string | null;
  payment_terms: string;
  payment_received_date: string | null;
  is_overdue: boolean;
  invoice_file_url: string;
  payment_method: string;
  notes: string;
}

export function DealInvoice({ dealId }: DealInvoiceProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [invoice, setInvoice] = useState<InvoiceData>({
    invoice_number: '',
    invoice_amount: 0,
    invoice_date: null,
    due_date: null,
    payment_terms: 'Net 15',
    payment_received_date: null,
    is_overdue: false,
    invoice_file_url: '',
    payment_method: '',
    notes: '',
  });

  useEffect(() => {
    if (dealId && user) {
      loadInvoice();
    }
  }, [dealId, user]);

  useEffect(() => {
    calculateDueDate();
  }, [invoice.invoice_date, invoice.payment_terms]);

  useEffect(() => {
    checkOverdueStatus();
  }, [invoice.due_date, invoice.payment_received_date]);

  const loadInvoice = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_invoices')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setInvoice(data);
      }
    } catch (error) {
      console.error('Error loading invoice:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateDueDate = () => {
    if (!invoice.invoice_date) return;

    try {
      const invoiceDate = new Date(invoice.invoice_date);
      let daysToAdd = 15;

      if (invoice.payment_terms === 'Net 30') daysToAdd = 30;
      if (invoice.payment_terms === 'Net 60') daysToAdd = 60;
      if (invoice.payment_terms === 'Due on Receipt') daysToAdd = 0;

      const dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + daysToAdd);

      setInvoice(prev => ({ ...prev, due_date: dueDate.toISOString().split('T')[0] }));
    } catch (error) {
      console.error('Error calculating due date:', error);
    }
  };

  const checkOverdueStatus = () => {
    if (!invoice.due_date || invoice.payment_received_date) {
      setInvoice(prev => ({ ...prev, is_overdue: false }));
      return;
    }

    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    const isOverdue = dueDate < today;

    setInvoice(prev => ({ ...prev, is_overdue: isOverdue }));
  };

  const getDaysUntilDue = () => {
    if (!invoice.due_date) return null;

    const today = new Date();
    const dueDate = new Date(invoice.due_date);
    return differenceInDays(dueDate, today);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const dataToSave = {
        deal_id: dealId,
        user_id: user.id,
        ...invoice,
      };

      if (invoice.id) {
        const { error } = await supabase
          .from('deal_invoices')
          .update(dataToSave)
          .eq('id', invoice.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('deal_invoices')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        if (data) setInvoice(data);
      }

      await supabase
        .from('deals')
        .update({
          invoice_date: invoice.invoice_date,
          payment_status: invoice.payment_received_date ? 'Fully Paid' : invoice.is_overdue ? 'Overdue' : 'Not Started'
        })
        .eq('id', dealId);

    } catch (error) {
      console.error('Error saving invoice:', error);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
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

  const daysUntilDue = getDaysUntilDue();
  const isPaid = invoice.payment_received_date !== null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground mb-1">Invoice & Payment</h3>
        <p className="text-sm text-muted-foreground">Track invoice and payment details</p>
      </div>

      {isPaid ? (
        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-600 dark:text-green-400">Payment Received</p>
              <p className="text-xs text-green-600/80 dark:text-green-400/80 mt-1">
                Paid on {formatDate(invoice.payment_received_date)}
              </p>
            </div>
          </div>
        </div>
      ) : invoice.is_overdue ? (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-600 dark:text-red-400">Payment Overdue</p>
              <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-1">
                Due date was {formatDate(invoice.due_date)} ({Math.abs(daysUntilDue || 0)} days overdue)
              </p>
            </div>
          </div>
        </div>
      ) : daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue >= 0 ? (
        <div className="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">Payment Due Soon</p>
              <p className="text-xs text-yellow-600/80 dark:text-yellow-400/80 mt-1">
                Due {formatDate(invoice.due_date)} ({daysUntilDue} days remaining)
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="p-6 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-3 mb-2">
          <DollarSign className="w-6 h-6 text-primary" />
          <div className="text-sm font-semibold text-muted-foreground">Invoice Amount</div>
        </div>
        <div className="text-4xl font-bold text-foreground">{formatCurrency(invoice.invoice_amount)}</div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Invoice Number
          </label>
          <input
            type="text"
            value={invoice.invoice_number}
            onChange={(e) => setInvoice(prev => ({ ...prev, invoice_number: e.target.value }))}
            placeholder="INV-001"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Invoice Amount
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={invoice.invoice_amount}
            onChange={(e) => setInvoice(prev => ({ ...prev, invoice_amount: parseFloat(e.target.value) || 0 }))}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              <Calendar className="w-4 h-4 inline mr-1" />
              Invoice Date
            </label>
            <input
              type="date"
              value={invoice.invoice_date || ''}
              onChange={(e) => setInvoice(prev => ({ ...prev, invoice_date: e.target.value || null }))}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">
              Payment Terms
            </label>
            <select
              value={invoice.payment_terms}
              onChange={(e) => setInvoice(prev => ({ ...prev, payment_terms: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="Due on Receipt">Due on Receipt</option>
              <option value="Net 15">Net 15</option>
              <option value="Net 30">Net 30</option>
              <option value="Net 60">Net 60</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Due Date (Auto-calculated)
          </label>
          <input
            type="date"
            value={invoice.due_date || ''}
            readOnly
            className="w-full px-4 py-3 rounded-xl bg-muted border border-border text-foreground cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            <Calendar className="w-4 h-4 inline mr-1" />
            Payment Received Date
          </label>
          <input
            type="date"
            value={invoice.payment_received_date || ''}
            onChange={(e) => setInvoice(prev => ({ ...prev, payment_received_date: e.target.value || null }))}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Payment Method
          </label>
          <select
            value={invoice.payment_method}
            onChange={(e) => setInvoice(prev => ({ ...prev, payment_method: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value="">Select payment method</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="PayPal">PayPal</option>
            <option value="Venmo">Venmo</option>
            <option value="Zelle">Zelle</option>
            <option value="Check">Check</option>
            <option value="Wire">Wire Transfer</option>
            <option value="Other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            <FileText className="w-4 h-4 inline mr-1" />
            Invoice File URL
          </label>
          <input
            type="url"
            value={invoice.invoice_file_url}
            onChange={(e) => setInvoice(prev => ({ ...prev, invoice_file_url: e.target.value }))}
            placeholder="https://example.com/invoice.pdf"
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">
            Notes
          </label>
          <textarea
            value={invoice.notes}
            onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
            placeholder="Additional payment notes..."
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Save className="w-5 h-5" />
        {saving ? 'Saving...' : 'Save Invoice'}
      </button>
    </div>
  );
}
