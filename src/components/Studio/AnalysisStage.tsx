import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useBrand } from '../../contexts/BrandContext';
import { ArrowUp, ArrowDown, Lightbulb, CheckCircle2, Save, Bot, Wand2, AlertCircle } from 'lucide-react';

interface AnalysisStageProps {
  workflowId: string;
  onComplete: () => void;
}

export function AnalysisStage({ workflowId, onComplete }: AnalysisStageProps) {
  const { activeBrand } = useBrand();
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
  }, [workflowId, activeBrand]);

  const loadData = async () => {
    if (!activeBrand) return;
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

      const { data: post } = await supabase
        .from('content_posts')
        .select('views, likes, comments, engagement_rate, content_type')
        .eq('id', workflow.published_post_id)
        .maybeSingle();

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: { user } } = await supabase.auth.getUser();

      let avgViews = 0, avgEngagement = 0;
      if (user) {
        const { data: history } = await supabase
          .from('content_posts')
          .select('views, engagement_rate')
          .eq('user_id', user.id)
          .eq('brand_id', activeBrand.id)
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
    if (!insight || !activeBrand) return;
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
          brand_id: activeBrand.id,
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
  const PerfArrow = overperformed ? ArrowUp : ArrowDown;
  const deltaPct = hasAvg && metrics.avgViews > 0
    ? Math.abs(Math.round(((metrics.views - metrics.avgViews) / metrics.avgViews) * 100))
    : 0;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <h2 className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          The Retro
        </h2>
        <p className="t-body">Review performance and capture one key learning to improve your next video.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <div className="bg-card border border-border p-5">
          <p className="t-micro text-muted-foreground mb-2">Views</p>
          <div className="flex items-baseline gap-2">
            <span className="text-foreground" style={{ fontSize: '1.75rem', fontWeight: 500, letterSpacing: '-0.02em' }}>
              {metrics.views.toLocaleString()}
            </span>
            {hasAvg && metrics.views > 0 && (
              <span className={`inline-flex items-center gap-0.5 t-micro ${overperformed ? 'text-accent' : 'text-muted-foreground'}`}>
                <PerfArrow className="w-3 h-3" />
                {deltaPct}%
              </span>
            )}
          </div>
          <p className="t-body mt-2">
            {hasAvg ? `vs. your avg (${metrics.avgViews.toLocaleString()})` : 'No comparison data yet'}
          </p>
        </div>

        <div className="bg-card border border-border p-5">
          <p className="t-micro text-muted-foreground mb-2">Engagement</p>
          <span className="text-foreground block" style={{ fontSize: '1.75rem', fontWeight: 500, letterSpacing: '-0.02em' }}>
            {metrics.engagementRate.toFixed(1)}%
          </span>
          <p className="t-body mt-2">
            {metrics.likes.toLocaleString()} likes · {metrics.comments.toLocaleString()} comments
          </p>
        </div>

        <div className="bg-card border border-border p-5 flex flex-col justify-between">
          <p className="t-micro text-muted-foreground mb-2">Verdict</p>
          <p className="text-sm text-foreground" style={{ fontWeight: 500 }}>
            {!metrics.hasRealData
              ? 'Metrics sync after publish'
              : !hasAvg
                ? 'First post — no baseline yet'
                : overperformed
                  ? 'Outperformed your average'
                  : 'Below your average'}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border p-6 sm:p-8">
        <div className="flex items-start gap-3 mb-6">
          <div className="w-10 h-10 border border-border flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="text-foreground" style={{ fontSize: '1.0625rem', fontWeight: 500, letterSpacing: '-0.01em' }}>
              What did we learn?
            </h3>
            <p className="t-body">Don't just look at numbers. Why did this perform the way it did?</p>
          </div>
          <button
            onClick={handleGenerateAnalysis}
            disabled={generating || !postId}
            className="t-micro text-accent hover:underline inline-flex items-center gap-1.5 flex-shrink-0 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
            title={!postId ? 'No published post linked' : 'Generate AI analysis'}
          >
            {generating ? <Wand2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
            {generating ? 'Analyzing…' : 'AI analysis'}
          </button>
        </div>

        <div className="space-y-5">
          {aiError && (
            <div className="flex items-start gap-2 p-3 border border-destructive text-sm text-destructive bg-destructive/5">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {aiError}
            </div>
          )}

          <div>
            <label className="block t-micro text-muted-foreground mb-2">Key takeaway (the "insight")</label>
            <textarea
              value={insight}
              onChange={(e) => setInsight(e.target.value)}
              placeholder='e.g. The text overlay hook worked better than just talking…'
              className="w-full p-3 bg-background border border-border focus:outline-none focus:border-foreground text-sm text-foreground placeholder:text-muted-foreground min-h-[100px] resize-y"
            />
          </div>

          <div>
            <label className="block t-micro text-muted-foreground mb-2">Next video idea (optional)</label>
            <input
              type="text"
              value={nextIdea}
              onChange={(e) => setNextIdea(e.target.value)}
              placeholder="e.g. Try the same hook format on a different topic…"
              className="w-full p-3 bg-background border border-border focus:outline-none focus:border-foreground text-sm text-foreground placeholder:text-muted-foreground"
            />
            <p className="t-body mt-2 inline-flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-accent" />
              This will automatically be added to your Saved Ideas.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={loading || !insight}
              className="btn-ie btn-ie-solid inline-flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="btn-ie-text">{loading ? 'Saving…' : 'Complete workflow'}</span>
              <Save className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
