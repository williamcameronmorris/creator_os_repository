import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp, Lock, Crown } from 'lucide-react';
import { format } from 'date-fns';
import { PaywallModal } from '../components/PaywallModal';

interface RevenueRecord {
  id: string;
  source: string;
  amount: number;
  date: string;
  status: string;
}

export function Revenue() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const { darkMode } = useTheme();
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPaywall, setShowPaywall] = useState(false);

  const isPremium = tier === 'paid';

  useEffect(() => {
    if (user) {
      loadRevenue();
    }
  }, [user]);

  const loadRevenue = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('revenue_records')
      .select('*')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (!error && data) {
      setRecords(data);
      const total = data.filter(r => r.status === 'received').reduce((sum, r) => sum + (r.amount || 0), 0);
      setTotalRevenue(total);
    }
    setLoading(false);
  };

  const displayedRecords = isPremium ? records : records.slice(0, 3);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Revenue Tracking
            </h1>
            <p className="text-muted-foreground">
              Monitor your earnings and payment status
            </p>
          </div>
          {!isPremium && (
            <button
              onClick={() => setShowPaywall(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-medium bg-gradient-to-r from-orange-500 to-orange-600 text-white hover:shadow-lg transition-all"
            >
              <Crown className="w-4 h-4" />
              Upgrade
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-chart-2/10">
              <DollarSign className="w-6 h-6 text-chart-2" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            Total Revenue
          </p>
          <p className="text-3xl font-bold text-foreground">
            ${totalRevenue.toLocaleString()}
          </p>
        </div>

        <div className="p-6 rounded-xl bg-card border border-border">
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-chart-1/10">
              <TrendingUp className="w-6 h-6 text-chart-1" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-1">
            Total Transactions
          </p>
          <p className="text-3xl font-bold text-foreground">
            {records.length}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="p-8 rounded-xl text-center bg-card border border-border">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="p-8 rounded-xl text-center bg-card border border-border">
          <DollarSign className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-xl font-bold mb-2 text-foreground">
            No revenue records
          </h3>
          <p className="text-muted-foreground">
            Add your first revenue record to start tracking earnings
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {!isPremium && records.length > 3 && (
            <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-start gap-3">
              <Lock className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-semibold text-foreground mb-1">Limited View</h4>
                <p className="text-sm text-muted-foreground">
                  You're viewing only the 3 most recent transactions. Upgrade to Premium to see your complete revenue history and access advanced tracking features.
                </p>
              </div>
            </div>
          )}
          {displayedRecords.map((record) => (
            <div
              key={record.id}
              className="p-6 rounded-xl bg-card border border-border"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold mb-1 text-foreground">
                    {record.source}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(record.date), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold mb-1 text-foreground">
                    ${record.amount.toLocaleString()}
                  </p>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    record.status === 'received'
                      ? 'bg-chart-2/10 text-chart-2'
                      : record.status === 'pending'
                      ? 'bg-chart-5/10 text-chart-5'
                      : 'bg-destructive/10 text-destructive'
                  }`}>
                    {record.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
          {!isPremium && records.length > 3 && (
            <button
              onClick={() => setShowPaywall(true)}
              className="w-full py-4 px-4 rounded-xl border-2 border-dashed border-orange-500/30 bg-orange-500/5 text-orange-600 dark:text-orange-400 font-medium hover:bg-orange-500/10 transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-5 h-5" />
              View All {records.length} Transactions (Premium)
            </button>
          )}
        </div>
      )}

      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        feature="Full Revenue Tracking"
      />
    </div>
  );
}
