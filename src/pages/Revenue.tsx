import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { DollarSign, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

interface RevenueRecord {
  id: string;
  source: string;
  amount: number;
  date: string;
  status: string;
}

export function Revenue() {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const [records, setRecords] = useState<RevenueRecord[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">
          Revenue Tracking
        </h1>
        <p className="text-muted-foreground">
          Monitor your earnings and payment status
        </p>
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
          {records.map((record) => (
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
        </div>
      )}
    </div>
  );
}
