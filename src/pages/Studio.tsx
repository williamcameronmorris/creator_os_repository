import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, type AIContentSuggestion } from '../lib/supabase';
import { useBrand } from '../contexts/BrandContext';
import { getAIQuota, type AIQuotaInfo } from '../lib/aiQuota';
import { WorkflowStepper, type WorkflowStage } from '../components/Studio/WorkflowStepper';
import { IdeationStage } from '../components/Studio/IdeationStage';
import { ScriptingStage } from '../components/Studio/ScriptingStage';
import { CreationStage } from '../components/Studio/CreationStage';
import { SchedulingStage } from '../components/Studio/SchedulingStage';
import { AnalysisStage } from '../components/Studio/AnalysisStage';
import { Bot } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export function Studio() {
  const { activeBrand } = useBrand();
  const toast = useToast();
  const [activeStage, setActiveStage] = useState<WorkflowStage>('ideation');
  const [completedStages, setCompletedStages] = useState<WorkflowStage[]>([]);
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeContentType, setActiveContentType] = useState<string>('reel');
  const [aiSidebarOpen] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [aiQuota, setAiQuota] = useState<AIQuotaInfo | null>(null);
  const [prefilledIdea, setPrefilledIdea] = useState<AIContentSuggestion | null>(null);
  // A post handed in from Analytics ("Make more like this"): Ideation asks
  // generate-ideas for four variations of its angle and shows them to pick from.
  const [sourcePost, setSourcePost] = useState<{ id: string; platform: string; type: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [bootstrapping, setBootstrapping] = useState(() => searchParams.has('idea') && searchParams.has('autostart'));

  useEffect(() => {
    const loadQuota = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const quota = await getAIQuota(user.id);
      setAiQuota(quota);
    };
    loadQuota();
  }, []);

  // Handle an idea handed in via the URL. With ?autostart=1 (Clio's idea
  // cards) we skip Ideation entirely — create the workflow and drop straight
  // into Scripting. Without it (e.g. the 30-day challenge) we pre-fill the
  // Ideation stage and let the user confirm.
  useEffect(() => {
    if (!activeBrand) return;
    const sourcePostId = searchParams.get('sourcePostId');
    if (sourcePostId) {
      setSourcePost({
        id: sourcePostId,
        platform: searchParams.get('platform') || 'instagram',
        type: searchParams.get('type') || 'reel',
      });
      setSearchParams({}, { replace: true });
      return;
    }
    const ideaParam = searchParams.get('idea');
    if (!ideaParam) return;
    const autostart = searchParams.get('autostart') === '1';
    const idea: AIContentSuggestion = {
      id: '',
      user_id: '',
      platform: (searchParams.get('platform') || 'instagram') as any,
      content_type: (searchParams.get('type') || 'reel') as any,
      suggested_topic: ideaParam,
      suggested_format: searchParams.get('hook') || ideaParam,
      reasoning: searchParams.get('reasoning') || 'From your Daily Brief',
      hook_text: searchParams.get('hook') || undefined,
      confidence_score: Number(searchParams.get('confidence') || 85),
      status: 'accepted',
      created_at: new Date().toISOString(),
    };
    setSearchParams({}, { replace: true });
    if (autostart) {
      handleIdeaSelected(idea).finally(() => setBootstrapping(false));
    } else {
      setPrefilledIdea(idea);
    }
  }, [activeBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleIdeaSelected = async (idea: AIContentSuggestion) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { toast.error('Sign in again to start a project.'); return; }
      if (!activeBrand) { toast.error('Pick a brand first.'); return; }

      const now = new Date().toISOString();
      const base = {
        user_id: user.id,
        brand_id: activeBrand.id,
        platform: idea.platform,
        content_type: idea.content_type,
        current_stage: 'scripting',
        idea_content: idea.suggested_topic,
        idea_completed_at: now,
      };
      // The hook and reasoning the creator picked the idea for travel with
      // the workflow so the script opens on them. Older databases without
      // the two columns fall back to the bare row rather than failing.
      const extras = {
        idea_hook: idea.hook_text || null,
        idea_reasoning: idea.reasoning || null,
      };
      let { data, error } = await supabase
        .from('content_workflow_stages')
        .insert({ ...base, ...extras })
        .select()
        .maybeSingle();
      if (error && (error.code === '42703' || error.code === 'PGRST204')) {
        ({ data, error } = await supabase
          .from('content_workflow_stages')
          .insert(base)
          .select()
          .maybeSingle());
      }

      if (error) { console.error('Error creating workflow:', error); toast.error('Could not start the workflow. Try again.'); return; }

      if (data) {
        // Provenance: which idea became which workflow, and when. Every
        // suggestion used to be accepted with these left null.
        if (idea.id) {
          await supabase
            .from('ai_content_suggestions')
            .update({ status: 'accepted', created_workflow_id: data.id, acted_on_at: now })
            .eq('id', idea.id);
        }
        setActiveWorkflowId(data.id);
        setActiveContentType(data.content_type);
        setCompletedStages(['ideation']);
        setActiveStage('scripting');
        setPrefilledIdea(null);
        setSourcePost(null);
      } else {
        toast.error('Could not start the workflow. Try again.');
      }
    } catch (err) {
      console.error('Unexpected error:', err);
      toast.error('Something went wrong starting the workflow. Try again.');
    }
  };

  const handleStepComplete = (stageName: WorkflowStage) => {
    if (!completedStages.includes(stageName)) {
      setCompletedStages(prev => [...prev, stageName]);
    }
    const stages: WorkflowStage[] = ['ideation', 'scripting', 'creation', 'scheduling', 'analysis'];
    const idx = stages.indexOf(stageName);
    if (idx < stages.length - 1) { setActiveStage(stages[idx + 1]); }
  };

  const handleSkip = (stageName: WorkflowStage) => { handleStepComplete(stageName); };
  // Scheduling now advances straight to Analysis (engagement retired).
  const handleSchedulingComplete = () => { setCompletedStages(prev => [...prev, 'scheduling']); setActiveStage('analysis'); };
  const handleWorkflowComplete = () => {
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
      setActiveStage('ideation');
      setActiveWorkflowId(null);
      setCompletedStages([]);
    }, 3000);
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-1.5 h-1.5 bg-foreground animate-pulse" />
      </div>
    );
  }

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center animate-fade-in">
          <div className="mb-6">
            <span className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase text-foreground">Complete</span>
          </div>
          <h2 className="text-3xl font-bold text-foreground mb-2">Workflow Complete!</h2>
          <p className="text-muted-foreground">Your insight has been saved and loop closed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <WorkflowStepper
        currentStage={activeStage}
        onStageSelect={setActiveStage}
        completedStages={completedStages}
      />
      <div className="flex-1 flex max-w-7xl mx-auto w-full p-4 lg:p-6 gap-4 lg:gap-6 items-start">
        <div className="flex-1 bg-card border border-border h-full flex flex-col overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-border flex justify-between items-center">
            <div>
              <h2 className="font-mono text-[10px] font-bold tracking-[0.08em] uppercase text-foreground mb-2">{activeStage}</h2>
              <p className="text-sm text-muted-foreground t-body">
                {activeStage === 'ideation' && "Analyze performance and generate winning ideas."}
                {activeStage === 'scripting' && "Draft your hook, body, and CTA."}
                {activeStage === 'creation' && "Upload media and check production quality."}
                {activeStage === 'scheduling' && "Pick the optimal time to post."}
                {activeStage === 'analysis' && "Review performance and save insights."}
              </p>
            </div>
          </div>
          <div className="flex-1 p-4 lg:p-8 overflow-y-auto">
            {activeStage === 'ideation' ? (
              <IdeationStage
                onIdeaSelected={handleIdeaSelected}
                prefilledIdea={prefilledIdea ?? undefined}
                sourcePost={sourcePost ?? undefined}
              />
            ) : activeStage === 'scripting' && activeWorkflowId ? (
              <ScriptingStage
                workflowId={activeWorkflowId}
                contentType={activeContentType}
                onComplete={() => handleStepComplete('scripting')}
                onSkip={() => handleSkip('scripting')}
              />
            ) : activeStage === 'creation' && activeWorkflowId ? (
              <CreationStage
                workflowId={activeWorkflowId}
                contentType={activeContentType}
                onComplete={() => handleStepComplete('creation')}
                onSkip={() => handleSkip('creation')}
              />
            ) : activeStage === 'scheduling' && activeWorkflowId ? (
              <SchedulingStage
                workflowId={activeWorkflowId}
                contentType={activeContentType}
                onComplete={handleSchedulingComplete}
              />
            ) : activeStage === 'analysis' && activeWorkflowId ? (
              <AnalysisStage
                workflowId={activeWorkflowId}
                onComplete={handleWorkflowComplete}
              />
            ) : (
              <div className="text-center py-20 text-muted-foreground">
                Pick an idea in Ideate first. The rest of the workflow starts from there.
              </div>
            )}
          </div>
        </div>

        {aiSidebarOpen && (
          <div className="w-80 bg-card border border-border h-full flex flex-col hidden lg:flex">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-foreground" />
                <span className="font-mono text-[10px] font-medium tracking-[0.08em] uppercase text-foreground">AI Assistant</span>
              </div>
              <div className={`text-xs px-2 py-1 font-medium border ${
                aiQuota
                  ? aiQuota.requestsRemaining <= 3
                    ? 'border-foreground text-foreground'
                    : 'border-border text-muted-foreground'
                  : 'border-border text-muted-foreground'
              }`}>
                {aiQuota ? `${aiQuota.requestsRemaining} credits left` : '...'}
              </div>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-4">
              <div className="flex gap-3">
                <div className="w-8 h-8 border border-border flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-foreground" />
                </div>
                <div className="bg-background border border-border p-3 text-sm text-foreground">
                  {activeStage === 'analysis'
                    ? "Great job! Based on these metrics, your 'Hook' seems to be the strongest element. Let's double down on that."
                    : "I'm ready to help! Once you select an idea, I can generate 3 hook options for you."}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-border">
              <input
                type="text"
                placeholder="Ask AI for help..."
                className="w-full px-4 py-3 bg-background border border-border text-sm focus:outline-none focus:ring-2 focus:ring-foreground/50 text-foreground placeholder:text-muted-foreground"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
