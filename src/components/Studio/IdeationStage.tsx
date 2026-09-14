import { useState, useEffect, useRef } from 'react';
import { supabase, type AIContentSuggestion } from '../../lib/supabase';
import { useAccount } from '../../contexts/AccountContext';
import { useBrand } from '../../contexts/BrandContext';
import { Sparkles, Bot, ThumbsDown, ArrowRight, PenTool, Lightbulb, Zap } from 'lucide-react';

interface IdeationStageProps {
  onIdeaSelected: (idea: AIContentSuggestion) => void;
  prefilledIdea?: AIContentSuggestion;
  /** A post from Analytics to make more of: ideas are four variations of its angle. */
  sourcePost?: { id: string; platform: string; type: string };
}

export function IdeationStage({ onIdeaSelected, prefilledIdea, sourcePost }: IdeationStageProps) {
  const { activeAccount } = useAccount();
  const { activeBrand } = useBrand();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [suggestions, setSuggestions] = useState<AIContentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [manualTopic, setManualTopic] = useState('');
  const [manualFormat, setManualFormat] = useState('reel');
  const [submitting, setSubmitting] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  // True when the last generate call handed back today's unused ideas
  // instead of calling the model; the next click is then an explicit
  // "again", which does spend a credit.
  const [cachedNotice, setCachedNotice] = useState(false);
  const generatedForSource = useRef<string | null>(null);

  useEffect(() => {
    if (mode === 'ai') { loadSuggestions(); }
  }, [mode, activeBrand]);

  // "Make more like this" from Analytics: ask for the variations as soon as
  // the brand is known. The ref keeps a re-render from asking twice.
  useEffect(() => {
    if (!sourcePost?.id || !activeBrand) return;
    if (generatedForSource.current === sourcePost.id) return;
    generatedForSource.current = sourcePost.id;
    setMode('ai');
    generateIdeas({ sourcePostId: sourcePost.id });
  }, [sourcePost?.id, activeBrand]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSuggestions = async () => {
    if (!activeBrand) return;
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('ai_content_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('brand_id', activeBrand.id)
      .eq('status', 'new')
      .order('created_at', { ascending: false });
    if (data) setSuggestions(data);
    setLoading(false);
  };

  const generateIdeas = async (opts: { sourcePostId?: string; force?: boolean } = {}) => {
    if (!activeBrand) return;
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: result, error } = await supabase.functions.invoke('generate-ideas', {
        body: {
          userId: user.id,
          brandId: activeBrand.id,
          // Account Switcher scope: ideas grounded in this account's posts,
          // voice, and niche. Omitted under "All accounts" (legacy behavior).
          ...(activeAccount ? { socialAccountId: activeAccount.id } : {}),
          // Pin a source post: the ideas come back as variations of its angle.
          ...(opts.sourcePostId ? { sourcePostId: opts.sourcePostId } : {}),
          // Without force, today's unused ideas come back with no model call.
          ...(opts.force ? { force: true } : {}),
        },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) { throw new Error(error.message || 'Failed to generate ideas'); }
      const fresh: AIContentSuggestion[] = result?.suggestions ?? [];
      if (fresh.length > 0) {
        setSuggestions(prev => [...fresh.filter(s => !prev.some(p => p.id === s.id)), ...prev]);
      }
      setCachedNotice(result?.cached === true);
    } catch (err) {
      console.error('Error generating ideas:', err);
      alert((err as Error).message || 'Failed to generate ideas. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleManualSubmit = async () => {
    if (!manualTopic || submitting) return;
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const manualIdea: Partial<AIContentSuggestion> = {
        user_id: user.id,
        platform: 'instagram',
        content_type: manualFormat as any,
        suggested_topic: manualTopic,
        suggested_format: 'Manual Entry',
        reasoning: 'User generated concept',
        confidence_score: 100,
        status: 'accepted'
      };
      onIdeaSelected(manualIdea as AIContentSuggestion);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAction = async (id: string, action: 'rejected') => {
    await supabase.from('ai_content_suggestions').update({ status: action }).eq('id', id);
    setSuggestions(prev => prev.filter(s => s.id !== id));
  };

  const handleSelectIdea = async (idea: AIContentSuggestion) => {
    setSelectingId(idea.id || '__prefilled__');
    try { await onIdeaSelected(idea); }
    finally { setSelectingId(null); }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-border flex items-center justify-center flex-shrink-0">
            <Lightbulb className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              Ideation
            </h2>
            <p className="t-body">Choose a concept to start your production line.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('ai')}
            className="t-micro px-3 py-2 border transition-colors flex items-center gap-2"
            style={{
              borderColor: mode === 'ai' ? 'var(--accent)' : 'var(--border)',
              color: mode === 'ai' ? 'var(--accent)' : 'var(--foreground)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" /> AI suggestions
          </button>
          <button
            onClick={() => setMode('manual')}
            className="t-micro px-3 py-2 border transition-colors flex items-center gap-2"
            style={{
              borderColor: mode === 'manual' ? 'var(--accent)' : 'var(--border)',
              color: mode === 'manual' ? 'var(--accent)' : 'var(--foreground)',
            }}
          >
            <PenTool className="w-3.5 h-3.5" /> Manual entry
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="bg-card border border-border p-6 sm:p-8">
          <div className="w-12 h-12 border border-border flex items-center justify-center mb-6">
            <Lightbulb className="w-5 h-5 text-foreground" />
          </div>
          <h3 className="text-foreground mb-6" style={{ fontSize: '1.25rem', fontWeight: 500 }}>What's on your mind?</h3>
          <div className="space-y-6">
            <div>
              <label className="t-micro text-foreground block mb-2">Concept / Topic</label>
              <input
                type="text"
                value={manualTopic}
                onChange={(e) => setManualTopic(e.target.value)}
                placeholder="e.g. Day in the life, Q&A, product review…"
                className="w-full px-4 py-3 border border-border bg-background text-foreground outline-none transition-colors focus:border-foreground placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <div>
              <label className="t-micro text-foreground block mb-2">Intended format</label>
              <div className="grid grid-cols-2 sm:flex gap-3">
                {['reel', 'story', 'post', 'video'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setManualFormat(fmt)}
                    className="px-4 py-2 border text-sm capitalize transition-colors"
                    style={{
                      borderColor: manualFormat === fmt ? 'var(--accent)' : 'var(--border)',
                      color: manualFormat === fmt ? 'var(--accent)' : 'var(--foreground)',
                    }}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleManualSubmit}
              disabled={!manualTopic || submitting}
              className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="btn-ie-text flex items-center gap-2">
                {submitting
                  ? <><span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" /> Starting…</>
                  : <><ArrowRight className="w-4 h-4" /> Start project</>}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Daily Brief prefilled idea — pinned at top */}
          {prefilledIdea && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
                <span className="t-micro" style={{ color: 'var(--accent)' }}>From your daily brief</span>
              </div>
              <div
                className="bg-card border p-4 sm:p-6 transition-colors group cursor-pointer"
                style={{ borderColor: 'var(--accent)' }}
                onClick={() => handleSelectIdea(prefilledIdea)}
              >
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    {prefilledIdea.suggested_format && prefilledIdea.suggested_format !== prefilledIdea.suggested_topic && (
                      <p className="text-sm italic text-muted-foreground mb-3 leading-relaxed pl-3" style={{ borderLeft: '2px solid var(--accent)' }}>
                        "{prefilledIdea.suggested_format}"
                      </p>
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                      <span className="t-micro px-2 py-1 border border-border">{prefilledIdea.platform}</span>
                      <span className="t-micro capitalize">{prefilledIdea.content_type}</span>
                    </div>
                    <h3 className="text-foreground mb-1 break-words" style={{ fontSize: '1.05rem', fontWeight: 500 }}>{prefilledIdea.suggested_topic}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{prefilledIdea.reasoning}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSelectIdea(prefilledIdea); }}
                    disabled={selectingId === '__prefilled__'}
                    className="flex-shrink-0 w-10 h-10 flex items-center justify-center border transition-colors disabled:opacity-60"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                    title="Start project"
                  >
                    {selectingId === '__prefilled__'
                      ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      : <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {sourcePost && (
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-3.5 h-3.5" style={{ color: 'var(--accent)' }} />
              <span className="t-micro" style={{ color: 'var(--accent)' }}>
                Variations on your {sourcePost.platform} {sourcePost.type}
              </span>
            </div>
          )}

          <div className="text-center py-8">
            <button
              onClick={() => generateIdeas({ force: cachedNotice })}
              disabled={generating}
              className="btn-ie btn-ie-solid mx-auto disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="btn-ie-text flex items-center gap-2">
                {generating
                  ? <><span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" /> {sourcePost ? 'Making more like this…' : 'Analyzing performance…'}</>
                  : <><Bot className="w-4 h-4" /> {cachedNotice ? 'Generate again' : 'Generate new ideas'}</>}
              </span>
            </button>
            {cachedNotice && !generating && (
              <p className="t-micro text-muted-foreground mt-3">
                These are today's unused ideas. Generating again spends a credit.
              </p>
            )}
          </div>

          <div className="grid gap-4">
            {loading ? (
              <div className="text-center t-body py-10">Loading suggestions…</div>
            ) : suggestions.length === 0 && !generating ? (
              <div className="text-center t-body py-10 border border-dashed border-border">
                No active ideas. Generate to start.
              </div>
            ) : (
              suggestions.map((idea) => (
                <div key={idea.id} className="bg-card border border-border p-4 sm:p-6 transition-colors hover:border-foreground/50 group">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                        <span className="t-micro px-2 py-1 border border-border">{idea.platform}</span>
                        <span className="t-micro flex items-center gap-1" style={{ color: 'var(--accent)' }}>
                          <Sparkles className="w-3 h-3" />
                          {idea.confidence_score}% match
                        </span>
                      </div>
                      <h3 className="text-foreground mb-1 break-words" style={{ fontSize: '1.05rem', fontWeight: 500 }}>{idea.suggested_topic}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{idea.reasoning}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSelectIdea(idea)}
                        disabled={selectingId === idea.id}
                        className="w-10 h-10 flex items-center justify-center border transition-colors disabled:opacity-60"
                        style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                        title="Start project"
                      >
                        {selectingId === idea.id
                          ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          : <ArrowRight className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => handleAction(idea.id, 'rejected')}
                        disabled={!!selectingId}
                        className="w-10 h-10 flex items-center justify-center border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        title="Dismiss"
                      >
                        <ThumbsDown className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
