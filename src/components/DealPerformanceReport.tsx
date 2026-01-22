import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { BarChart3, TrendingUp, Eye, Heart, MessageCircle, Share2, Save, Send, Copy, CheckCircle } from 'lucide-react';

interface DealPerformanceReportProps {
  dealId: string;
}

interface ReportData {
  id?: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  best_performing_metric: string;
  renewal_opportunity_score: number;
  recommended_next_campaign: string;
  report_generated_at: string | null;
  report_sent_at: string | null;
}

export function DealPerformanceReport({ dealId }: DealPerformanceReportProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<ReportData>({
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    engagement_rate: 0,
    best_performing_metric: '',
    renewal_opportunity_score: 0,
    recommended_next_campaign: '',
    report_generated_at: null,
    report_sent_at: null,
  });

  useEffect(() => {
    if (dealId && user) {
      loadReport();
    }
  }, [dealId, user]);

  useEffect(() => {
    calculateEngagementRate();
    determineBestMetric();
  }, [report.views, report.likes, report.comments, report.shares]);

  const loadReport = async () => {
    try {
      const { data, error } = await supabase
        .from('deal_performance_reports')
        .select('*')
        .eq('deal_id', dealId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setReport(data);
      }
    } catch (error) {
      console.error('Error loading performance report:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateEngagementRate = () => {
    if (report.views === 0) {
      setReport(prev => ({ ...prev, engagement_rate: 0 }));
      return;
    }

    const totalEngagements = report.likes + report.comments + report.shares;
    const rate = (totalEngagements / report.views) * 100;
    setReport(prev => ({ ...prev, engagement_rate: Math.round(rate * 100) / 100 }));
  };

  const determineBestMetric = () => {
    const metrics = [
      { name: 'Views', value: report.views },
      { name: 'Likes', value: report.likes },
      { name: 'Comments', value: report.comments },
      { name: 'Shares', value: report.shares },
    ];

    const best = metrics.reduce((prev, current) =>
      current.value > prev.value ? current : prev
    );

    setReport(prev => ({ ...prev, best_performing_metric: best.name }));
  };

  const generateReportText = () => {
    return `Campaign Performance Report

Total Views: ${report.views.toLocaleString()}
Likes: ${report.likes.toLocaleString()}
Comments: ${report.comments.toLocaleString()}
Shares: ${report.shares.toLocaleString()}
Engagement Rate: ${report.engagement_rate}%

Best Performing Metric: ${report.best_performing_metric}

Renewal Opportunity Score: ${report.renewal_opportunity_score}/100

Recommended Next Campaign:
${report.recommended_next_campaign}

This content resonated well with the audience and delivered strong results. I'd love to explore another collaboration!`;
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateReportText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateReport = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const dataToSave = {
        deal_id: dealId,
        user_id: user.id,
        ...report,
        report_generated_at: new Date().toISOString(),
      };

      if (report.id) {
        const { error } = await supabase
          .from('deal_performance_reports')
          .update(dataToSave)
          .eq('id', report.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('deal_performance_reports')
          .insert(dataToSave)
          .select()
          .single();

        if (error) throw error;
        if (data) setReport(data);
      }
    } catch (error) {
      console.error('Error generating report:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleMarkAsSent = async () => {
    if (!user || !report.id) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('deal_performance_reports')
        .update({ report_sent_at: new Date().toISOString() })
        .eq('id', report.id);

      if (error) throw error;

      setReport(prev => ({ ...prev, report_sent_at: new Date().toISOString() }));
    } catch (error) {
      console.error('Error marking report as sent:', error);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-foreground mb-1">Performance Report</h3>
        <p className="text-sm text-muted-foreground">Track and share campaign results</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <Eye className="w-5 h-5 text-blue-600 dark:text-blue-400 mb-2" />
          <div className="text-2xl font-bold text-foreground">{report.views.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Views</div>
        </div>

        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <Heart className="w-5 h-5 text-red-600 dark:text-red-400 mb-2" />
          <div className="text-2xl font-bold text-foreground">{report.likes.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Likes</div>
        </div>

        <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/20">
          <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400 mb-2" />
          <div className="text-2xl font-bold text-foreground">{report.comments.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Comments</div>
        </div>

        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <Share2 className="w-5 h-5 text-purple-600 dark:text-purple-400 mb-2" />
          <div className="text-2xl font-bold text-foreground">{report.shares.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Shares</div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-foreground mb-2">Views</label>
          <input
            type="number"
            value={report.views}
            onChange={(e) => setReport(prev => ({ ...prev, views: parseInt(e.target.value) || 0 }))}
            className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Likes</label>
            <input
              type="number"
              value={report.likes}
              onChange={(e) => setReport(prev => ({ ...prev, likes: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Comments</label>
            <input
              type="number"
              value={report.comments}
              onChange={(e) => setReport(prev => ({ ...prev, comments: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-foreground mb-2">Shares</label>
            <input
              type="number"
              value={report.shares}
              onChange={(e) => setReport(prev => ({ ...prev, shares: parseInt(e.target.value) || 0 }))}
              className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
        </div>
      </div>

      <div className="p-4 rounded-xl bg-chart-2/10 border border-chart-2/20">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-chart-2" />
          <div>
            <div className="text-sm font-semibold text-foreground">Engagement Rate</div>
            <div className="text-2xl font-bold text-foreground">{report.engagement_rate}%</div>
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">
          Renewal Opportunity Score (0-100)
        </label>
        <input
          type="number"
          min="0"
          max="100"
          value={report.renewal_opportunity_score}
          onChange={(e) => setReport(prev => ({ ...prev, renewal_opportunity_score: parseInt(e.target.value) || 0 }))}
          className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <p className="text-xs text-muted-foreground mt-1">How likely is this brand to renew? (100 = very likely)</p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-foreground mb-2">
          Recommended Next Campaign
        </label>
        <textarea
          value={report.recommended_next_campaign}
          onChange={(e) => setReport(prev => ({ ...prev, recommended_next_campaign: e.target.value }))}
          placeholder="What would be a great follow-up campaign with this brand?"
          rows={4}
          className="w-full px-4 py-3 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="p-4 rounded-xl bg-muted/30 border border-border">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-bold text-foreground">Report Preview</h4>
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border hover:bg-muted transition-colors text-sm font-semibold"
          >
            {copied ? (
              <>
                <CheckCircle className="w-4 h-4" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
        </div>
        <pre className="text-xs text-foreground whitespace-pre-wrap font-mono">{generateReportText()}</pre>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleGenerateReport}
          disabled={saving}
          className="flex-1 px-6 py-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-5 h-5" />
          {saving ? 'Saving...' : 'Save Report'}
        </button>

        {report.id && !report.report_sent_at && (
          <button
            onClick={handleMarkAsSent}
            disabled={saving}
            className="flex-1 px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Send className="w-5 h-5" />
            Mark as Sent
          </button>
        )}

        {report.report_sent_at && (
          <div className="flex-1 px-6 py-3 bg-green-600/20 text-green-600 dark:text-green-400 rounded-xl font-semibold flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Sent to Brand
          </div>
        )}
      </div>
    </div>
  );
}
