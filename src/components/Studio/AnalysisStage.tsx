import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { TrendingUp, ArrowUp, ArrowDown, Lightbulb, CheckCircle2, Save, Bot, Wand2, AlertCircle } from 'lucide-react';

interface AnalysisStageProps {
  workflowId: string;
  onComplete: () => void;
}

export function AnalysisStage({ workflowId, onComplete }: AnalysisStageProps) {
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('instagram');
  const [contentType, setContentType] = useState<string>('reel');
  const [metrics, setMetrics] = useState({
    views: 0,
    likes: 0,
    comments: 0,
    engagementRate: 0,
    avgViews: 0,
    avgEngagement: 0,
    hasRealData: false,
  });
  const [insight, setInsight] = useState('');
  const [nextIdea, setNextIdea] = useState('');

  useEffect(() => {
    loadData();
  }, [workflowId]);

  const loadData = async () => {
    setLoading(true);

    const { data: workflow } = await supabase
      .from('content_workflow_stages')
      .select('published_post_id, analysis_notes, platform, content_type')
      .eq('id', workflowId)
      .maybeSingle();

    if (!workflow) { setLoading(false); return; }

    const plat = workflow.platform || 'instagram';
    const ctype = workflow.content_type || 'reel';
    setPlatform(plat);
    setContentType(ctype);

    // Restore saved analysis if exists
    if (workflow.analysis_notes) {
      try {
        const saved = typeof workflow.analysis_notes === 'string'
          ? JSON.parse(workflow.analysis_notes)
          : workflow.analysis_notes;
        if (saved?.key_learning) setInsight(saved.key_learning);
        if (saved?.next_idea) setNextIdea(saved.next_idea);
      } catch { /* ignore parse errors */ }
    }

    if (workflow.published_post_id) {
      setPostId(workflow.published_post_id);

      // Fetch real post metrics
      const { data: post } = await supabase
        .from('content_posts')
        .select('views, likes, comments, engagement_rate, content_type')
        .eq('id', workflow.published_post_id)
        .maybeSingle();

      // Fetch historical avg for same platform + content type (last 90 days, excluding this post)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: { user } } = await supabase.auth.getUser();

      let avgViews = 0, avgEngagement = 0;
      if (user) {
        const { data: history } = await supabase
          .from('content_posts')
          .select('views, engagement_rate')
          .eq('user_id', user.id)
          .eq('platform', plat)
          .eq('status', 'published')
          .gte('published_date', ninetyDaysAgo.toISOString())
          .neq('id', workflow.published_post_id)
          .not('views', 'is', null)
          .limit(30);

        if (history && history.length > 0) {
          const totalViews = history.reduce((sum, p) => sum + (p.views || 0), 0);
          const totalEng = history.reduce((sum, p) => sum + Number(p.engagement_rate || 0), 0);
          avgViews = Math.round(totalViews / history.length);
          avgEngagement = Math.round((totalEng / history.length) * 10) / 10;
        }
      }

      if (post) {
        setMetrics({
          views: post.views || 0,
          likes: post.likes || 0,
          comments: post.comments || 0,
          engagementRate: Number(post.engagement_rate) || 0,
          avgViews,
          avgEngagement,
          hasRealData: (post.views || 0) > 0,
        });
      }
    }

    setLoading(false);
  };

  const handleGenerateAnalysis = async () => {
    if (!postId) return;
    setGenerating(true);
    setAiError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-analysis', {
        body: {
          userId: user.id,
          workflowId,
          postId,
          platform,
          contentType,
          metrics,
        },
      });

      if (fnError) throw fnError;
      if (!fnData?.success) throw new Error(fnData?.error || 'Analysis generation failed');

      if (fnData.key_learning) setInsight(fnData.key_learning);
      if (fnData.next_idea) setNextIdea(fnData.next_idea);
    } catch (err: any) {
      setAiError(err.message || 'AI analysis failed. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!insight) return;
    setLoading(true);

    await supabase
      .from('content_workflow_stages')
      .update({
        current_stage: 'completed',
        analysis_notes: JSON.stringify({
          key_learning: insight,
          next_idea: nextIdea,
          final_metrics: metrics
        }),
        analysis_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);

    if (nextIdea) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('saved_content_ideas').insert({
          user_id: user.id,
          title: nextIdea,
          platform: 'instagram',
          content_type: 'reel',
          notes: `Inspired by insight: ${insight}`,
          inspiration_source: 'Analytics Retro'
        });
      }
    }

    onComplete();
    setLoading(false);
  };

  const hasAvg = metrics.avgViews > 0;
  const overperformed = metrics.views >= metrics.avgViews;
  const performanceColor = !hasAvg ? 'text-gray-500' : overperformed ? 'text-emerald-600' : 'text-amber-600';
  const performanceIcon = overperformed ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-bold text-gray-900">The Retro</h2>
        <p className="text-gray-500 text-sm mt-1">
          Review performance and capture one key learning to improve your next video.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Views</p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-bold text-gray-900">{metrics.views.toLocaleString()}</span>
            {hasAvg && metrics.views > 0 && (
              <div className={`flex items-center text-xs font-bold ${performanceColor} bg-violet-50 px-2 py-1 rounded-lg`}>
                {performanceIcon}
                {Math.abs(Math.round(((metrics.views - metrics.avgViews) / metrics.avgViews) * 100))}%
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {hasAvg ? `vs. your avg (${metrics.avgViews.toLocaleString()})` : 'No comparison data yet'}
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Engagement</p>
          <div className="text-3xl font-bold text-gray-900">{metrics.engagementRate.toFixed(1)}%</div>
          <p className="text-xs text-gray-400 mt-2">
            {metrics.likes.toLocaleString()} likes · {metrics.comments.toLocaleString()} comments
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm text-center flex flex-col items-center justify-center">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 ${hasAvg && metrics.views > 0 ? (overperformed ? 'bg-emerald-50' : 'bg-amber-50') : 'bg-blue-50'}`}>
            <TrendingUp className={`w-5 h-5 ${hasAvg && metrics.views > 0 ? (overperformed ? 'text-emerald-600' : 'text-amber-600') : 'text-blue-600'}`} />
          </div>
          <p className="text-sm font-medium text-gray-600">
            {!metrics.hasRealData
              ? 'Metrics sync after publish'
              : !hasAvg
                ? 'First post — no baseline yet'
                : overperformed
                  ? 'Outperformed your avg!'
                  : 'Below your avg'}
          </p>
        </div>
      </div>

      <div className="bg-violet-50 border border-gray-200 rounded-2xl p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="p-3 bg-yellow-100 rounded-xl text-yellow-700">
            <Lightbulb className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">What did we learn?</h3>
            <p className="text-gray-500 text-sm">
              Don't just look at numbers. Why did this perform the way it did?
            </p>
          </div>
          <button
            onClick={handleGenerateAnalysis}
            disabled={generating || !postId}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 flex-shrink-0"
            title={!postId ? 'No published post linked' : 'Generate AI analysis'}
          >
            {generating ? <Wand2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
            {generating ? 'Analyzing...' : 'AI Analysis'}
          </button>
        </div>

        <div className="space-y-6">
          {aiError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {aiError}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Key Takeaway (The "Insight")
            </label>
            <textarea
              value={insight}
              onChange={(e) => setInsight(e.target.value)}
              placeholder="e.g. The text overlay hook worked better than just talking..."
              className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white min-h-[100px]"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Next Video Idea (Optional)
            </label>
            <input
              type="text"
              value={nextIdea}
              onChange={(e) => setNextIdea(e.target.value)}
              placeholder="e.g. Try the same hook format on a different topic..."
              className="w-full p-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
            />
            <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              This will automatically be added to your Saved Ideas.
            </p>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              onClick={handleSave}
              disabled={loading || !insight}
              className="px-8 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-all shadow-lg flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Complete Workflow'}
              <Save className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
