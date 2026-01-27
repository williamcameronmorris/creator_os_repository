import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  DollarSign,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Calendar,
  Activity,
  ArrowRight,
  Eye,
  Heart,
} from 'lucide-react';

interface Deal {
  id: string;
  brand: string;
  requested_deliverables: string;
  final_amount: number;
  stage: string;
  stage_id: string;
  priority: string;
  expected_close_date: string | null;
  last_activity_at: string;
  created_at: string;
  draft_date: string | null;
  payment_status: string;
  invoice_date: string | null;
  deal_stages?: {
    name: string;
  };
}

interface ActivityItem {
  id: string;
  activity_type: string;
  description: string;
  created_at: string;
  deal_id: string;
  brand_name?: string;
}

interface SmartDashboardProps {
  onViewDeal: (dealId: string) => void;
  onViewPipeline: () => void;
}

export default function SmartDashboard({ onViewDeal, onViewPipeline }: SmartDashboardProps) {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [stats, setStats] = useState({
    totalViews: 0,
    totalEngagement: 0,
    scheduledPosts: 0,
    totalPipelineValue: 0,
    activeDeals: 0,
    dealsNeedingAttention: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [dealsResult, activitiesResult, postsResult, analyticsResult] = await Promise.all([
        supabase
          .from('deals')
          .select(`
            *,
            deal_stages (
              name
            )
          `)
          .eq('user_id', user.id)
          .order('last_activity_at', { ascending: false }),
        supabase
          .from('deal_activities')
          .select(`
            id,
            activity_type,
            description,
            created_at,
            deal_id
          `)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('content_posts')
          .select('id, status')
          .eq('user_id', user.id),
        supabase
          .from('post_analytics')
          .select('views, likes, comments, shares')
          .eq('user_id', user.id),
      ]);

      if (dealsResult.data) {
        setDeals(dealsResult.data);
        calculateStats(dealsResult.data, postsResult.data, analyticsResult.data);
      }

      if (activitiesResult.data) {
        const activitiesWithDeals = await Promise.all(
          activitiesResult.data.map(async (activity) => {
            const deal = dealsResult.data?.find((d) => d.id === activity.deal_id);
            return {
              ...activity,
              brand_name: deal?.brand,
            };
          })
        );
        setActivities(activitiesWithDeals);
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      setError('Failed to load dashboard data. Please try refreshing the page.');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (dealsData: Deal[], postsData: any[] = [], analyticsData: any[] = []) => {
    const activeDeals = dealsData.filter((d) => {
      const stageName = d.deal_stages?.name?.toLowerCase() || d.stage?.toLowerCase() || '';
      return stageName !== 'won' && stageName !== 'lost' && stageName !== 'closed' && stageName !== 'paid';
    });

    const totalValue = activeDeals.reduce((sum, deal) => sum + deal.final_amount, 0);
    const needingAttention = getDealsNeedingAttention(dealsData).length;

    const totalViews = analyticsData.reduce((sum, analytics) => sum + (analytics.views || 0), 0);
    const totalEngagement = analyticsData.reduce(
      (sum, analytics) => sum + (analytics.likes || 0) + (analytics.comments || 0) + (analytics.shares || 0),
      0
    );
    const scheduledPosts = postsData.filter((post) => post.status === 'scheduled').length;

    setStats({
      totalViews,
      totalEngagement,
      scheduledPosts,
      totalPipelineValue: totalValue,
      activeDeals: activeDeals.length,
      dealsNeedingAttention: needingAttention,
    });
  };

  const getDealsNeedingAttention = (dealsData: Deal[] = deals) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return dealsData
      .filter((deal) => {
        const stageName = deal.deal_stages?.name?.toLowerCase() || deal.stage?.toLowerCase() || '';

        // 1. Stalled Deal: Negotiation stage but > 7 days since last activity
        if (stageName === 'negotiating') {
          const daysSinceActivity = Math.floor(
            (now.getTime() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceActivity > 7) {
            return true;
          }
        }

        // 2. Draft Overdue: Content Creation stage but draft date is tomorrow or passed
        if (stageName === 'in production' || stageName === 'content creation') {
          if (deal.draft_date) {
            const draftDate = new Date(deal.draft_date);
            if (draftDate <= tomorrow) {
              return true;
            }
          }
        }

        // 3. Late Payment: Payment Pending status and invoice date > 30 days ago
        if (deal.payment_status?.toLowerCase() === 'overdue' && deal.invoice_date) {
          const daysSinceInvoice = Math.floor(
            (now.getTime() - new Date(deal.invoice_date).getTime()) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceInvoice > 30) {
            return true;
          }
        }

        return false;
      })
      .slice(0, 5);
  };

  const getUpcomingDeadlines = () => {
    const now = new Date();
    const twoWeeksFromNow = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return deals
      .filter(
        (deal) => {
          const stageName = deal.deal_stages?.name?.toLowerCase() || deal.stage?.toLowerCase() || '';
          const isActive = stageName !== 'won' && stageName !== 'lost' && stageName !== 'closed';

          return (
            deal.expected_close_date &&
            new Date(deal.expected_close_date) <= twoWeeksFromNow &&
            new Date(deal.expected_close_date) >= now &&
            isActive
          );
        }
      )
      .sort(
        (a, b) =>
          new Date(a.expected_close_date!).getTime() -
          new Date(b.expected_close_date!).getTime()
      )
      .slice(0, 5);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-amber-100 text-amber-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="text-red-500 text-center">
          <p className="text-lg font-semibold mb-2">Error Loading Dashboard</p>
          <p className="text-sm">{error}</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setLoading(true);
            loadDashboardData();
          }}
          className="bg-slate-900 text-white px-6 py-2 rounded-lg hover:bg-slate-800 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const dealsNeedingAttention = getDealsNeedingAttention();
  const upcomingDeadlines = getUpcomingDeadlines();

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-6">
        <div className="card-soft card-pastel-sky p-8 animate-scale-in">
          <div className="icon-container-sky w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <Eye className="w-6 h-6 text-sky-700" />
          </div>
          <div className="text-4xl font-bold mb-2 text-slate-900">
            {stats.totalViews.toLocaleString()}
          </div>
          <div className="text-sky-700 text-sm font-medium">Total Views</div>
        </div>

        <div className="card-soft card-pastel-rose p-8 animate-scale-in" style={{ animationDelay: '0.05s' }}>
          <div className="icon-container-rose w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <Heart className="w-6 h-6 text-rose-700" />
          </div>
          <div className="text-4xl font-bold mb-2 text-slate-900">
            {stats.totalEngagement.toLocaleString()}
          </div>
          <div className="text-rose-700 text-sm font-medium">Engagement</div>
        </div>

        <div className="card-soft card-pastel-lavender p-8 animate-scale-in" style={{ animationDelay: '0.1s' }}>
          <div className="icon-container-lavender w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <Calendar className="w-6 h-6 text-purple-700" />
          </div>
          <div className="text-4xl font-bold mb-2 text-slate-900">{stats.scheduledPosts}</div>
          <div className="text-purple-700 text-sm font-medium">Scheduled</div>
        </div>

        <div className="card-soft card-pastel-emerald p-8 animate-scale-in" style={{ animationDelay: '0.15s' }}>
          <div className="icon-container-emerald w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <DollarSign className="w-6 h-6 text-emerald-700" />
          </div>
          <div className="text-4xl font-bold mb-2 text-slate-900">
            {formatCurrency(stats.totalPipelineValue)}
          </div>
          <div className="text-emerald-700 text-sm font-medium">Pipeline Value</div>
        </div>

        <div className="card-soft card-pastel-cyan p-8 animate-scale-in" style={{ animationDelay: '0.2s' }}>
          <div className="icon-container-cyan w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <CheckCircle className="w-6 h-6 text-cyan-700" />
          </div>
          <div className="text-4xl font-bold mb-2 text-slate-900">{stats.activeDeals}</div>
          <div className="text-cyan-700 text-sm font-medium">Active Deals</div>
        </div>

        <div className="card-soft card-pastel-amber p-8 animate-scale-in" style={{ animationDelay: '0.25s' }}>
          <div className="icon-container-amber w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-amber-700" />
          </div>
          <div className="text-4xl font-bold mb-2 text-slate-900">{stats.dealsNeedingAttention}</div>
          <div className="text-amber-700 text-sm font-medium">Action Items</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        <div className="card-soft p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              <div className="icon-container-amber w-10 h-10 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-amber-700" />
              </div>
              Deals Needing Attention
            </h3>
            <button
              onClick={onViewPipeline}
              className="text-slate-600 hover:text-slate-900 text-sm font-semibold flex items-center gap-1 transition-colors"
            >
              View All
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {dealsNeedingAttention.length === 0 ? (
            <div className="text-center py-12">
              <div className="icon-container-emerald w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-700" />
              </div>
              <p className="text-slate-600 font-medium">All caught up! No deals need immediate attention.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dealsNeedingAttention.map((deal) => {
                const daysSinceActivity = Math.floor(
                  (new Date().getTime() - new Date(deal.last_activity_at).getTime()) /
                    (1000 * 60 * 60 * 24)
                );

                return (
                  <button
                    key={deal.id}
                    onClick={() => onViewDeal(deal.id)}
                    className="w-full text-left p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl hover:shadow-md transition-all-smooth"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-bold text-slate-900">{deal.brand}</div>
                        <div className="text-sm text-slate-600 mt-1">{deal.requested_deliverables}</div>
                      </div>
                      <span className={`text-xs px-3 py-1.5 rounded-full font-semibold ${getPriorityColor(deal.priority)}`}>
                        {deal.priority}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm font-bold text-slate-900">
                        {formatCurrency(deal.final_amount)}
                      </span>
                      <span className="text-xs text-amber-700 flex items-center gap-1 font-medium">
                        <Clock className="w-3.5 h-3.5" />
                        {daysSinceActivity}d since last update
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="card-soft p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
              <div className="icon-container-sky w-10 h-10 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-sky-700" />
              </div>
              Upcoming Deadlines
            </h3>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <div className="text-center py-12">
              <div className="icon-container-sky w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Calendar className="w-8 h-8 text-sky-700" />
              </div>
              <p className="text-slate-600 font-medium">No upcoming deadlines in the next 2 weeks</p>
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((deal) => (
                <button
                  key={deal.id}
                  onClick={() => onViewDeal(deal.id)}
                  className="w-full text-left p-5 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl hover:shadow-md transition-all-smooth"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-slate-900">{deal.brand}</div>
                      <div className="text-sm text-slate-600 mt-1">{deal.requested_deliverables}</div>
                    </div>
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(deal.final_amount)}
                    </span>
                  </div>
                  <div className="text-xs text-sky-700 flex items-center gap-1 mt-3 font-medium">
                    <Calendar className="w-3.5 h-3.5" />
                    Due {new Date(deal.expected_close_date!).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-soft p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
            <div className="icon-container-emerald w-10 h-10 rounded-xl flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-700" />
            </div>
            Recent Activity
          </h3>
        </div>

        {activities.length === 0 ? (
          <div className="text-center py-12">
            <div className="icon-container-lavender w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Activity className="w-8 h-8 text-purple-700" />
            </div>
            <p className="text-slate-600 font-medium">No recent activity</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => (
              <div
                key={activity.id}
                className="flex items-start gap-4 pb-4 border-b border-slate-100 last:border-0"
              >
                <div className="icon-container-sky w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Activity className="w-4 h-4 text-sky-700" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-slate-900 font-semibold">
                    {activity.description}
                    {activity.brand_name && (
                      <span className="text-slate-600 font-normal"> - {activity.brand_name}</span>
                    )}
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    {formatRelativeTime(activity.created_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-soft card-pastel-sky p-10 text-center">
        <div className="icon-container-sky w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 animate-bounce-gentle">
          <TrendingUp className="w-8 h-8 text-sky-700" />
        </div>
        <h3 className="text-2xl font-bold mb-3 text-slate-900">Ready to track more deals?</h3>
        <p className="text-slate-600 mb-6 font-medium">
          View your full pipeline and manage all your opportunities
        </p>
        <button
          onClick={onViewPipeline}
          className="btn-soft bg-sky-600 text-white hover:bg-sky-700"
        >
          View Pipeline
        </button>
      </div>
    </div>
  );
}