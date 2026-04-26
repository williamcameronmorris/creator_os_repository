import { useState, useEffect } from 'react';
import { supabase, type AIContentSuggestion } from '../../lib/supabase';
import { Sparkles, Bot, ThumbsDown, RefreshCw, ArrowRight, PenTool, Lightbulb, Zap } from 'lucide-react';

interface IdeationStageProps {
  onIdeaSelected: (idea: AIContentSuggestion) => void;
  prefilledIdea?: AIContentSuggestion;
}

export function IdeationStage({ onIdeaSelected, prefilledIdea }: IdeationStageProps) {
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [suggestions, setSuggestions] = useState<AIContentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [manualTopic, setManualTopic] = useState('');
  const [manualFormat, setManualFormat] = useState('reel');
  const [submitting, setSubmitting] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'ai') { loadSuggestions(); }
  }, [mode]);

  const loadSuggestions = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('ai_content_suggestions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'new')
      .order('created_at', { ascending: false });
    if (data) setSuggestions(data);
    setLoading(false);
  };

  const generateIdeas = async () => {
    setGenerating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-ideas`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ userId: user.id }),
        }
      );
      const result = await response.json();
      if (!response.ok) { throw new Error(result.error || 'Failed to generate ideas'); }
      if (result.suggestions && result.suggestions.length > 0) {
        setSuggestions(prev => [...result.suggestions, ...prev]);
      }
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

  const platformColor = (platform: string) => {
    if (platform === 'instagram') return 'bg-pink-500/10 text-pink-600';
    if (platform === 'tiktok') return 'bg-foreground/10 text-foreground';
    return 'bg-red-500/10 text-red-600';
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Ideation</h2>
          <p className="text-muted-foreground text-sm">Choose a concept to start your production line.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setMode('ai')}
            className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors flex items-center gap-2"
            style={{
              borderColor: mode === 'ai' ? 'var(--accent)' : 'var(--border)',
              color: mode === 'ai' ? 'var(--accent)' : 'var(--foreground)',
            }}
          >
            <Sparkles className="w-3.5 h-3.5" /> AI SUGGESTIONS
          </button>
          <button
            onClick={() => setMode('manual')}
            className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors flex items-center gap-2"
            style={{
              borderColor: mode === 'manual' ? 'var(--accent)' : 'var(--border)',
              color: mode === 'manual' ? 'var(--accent)' : 'var(--foreground)',
            }}
          >
            <PenTool className="w-3.5 h-3.5" /> MANUAL ENTRY
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="bg-card border border-border rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mb-6">
            <Lightbulb className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-6">What's on your mind?</h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Concept / Topic</label>
              <input
                type="text"
                value={manualTopic}
                onChange={(e) => setManualTopic(e.target.value)}
                placeholder="e.g., Day in the life, Q&A, Product Review..."
                className="w-full px-4 py-3 rounded-xl border border-border focus:ring-2 focus:ring-primary outline-none bg-background text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-foreground mb-2">Intended Format</label>
              <div className="grid grid-cols-2 sm:flex gap-3">
                {['reel', 'story', 'post', 'video'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setManualFormat(fmt)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium capitalize transition-colors ${
                      manualFormat === fmt
                        ? 'bg-primary/10 border-primary/30 text-primary'
                        : 'border-border hover:bg-accent text-foreground'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleManualSubmit}
              disabled={!manualTopic || submitting}
              className="w-full py-4 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> Starting...</>
              ) : (
                <><ArrowRight className="w-5 h-5" /> Start Project</>
              )}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Daily Brief prefilled idea — pinned at top */}
          {prefilledIdea && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-widest">From Your Daily Brief</span>
              </div>
              <div
                className="bg-primary/5 border-2 border-primary/25 rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/40 transition-all group cursor-pointer"
                onClick={() => handleSelectIdea(prefilledIdea)}
              >
                <div className="flex items-start justify-between gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0">
                    {prefilledIdea.suggested_format && prefilledIdea.suggested_format !== prefilledIdea.suggested_topic && (
                      <p className="text-sm italic text-foreground/60 mb-3 leading-relaxed border-l-2 border-primary/30 pl-3">
                        "{prefilledIdea.suggested_format}"
                      </p>
                    )}
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                      <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${platformColor(prefilledIdea.platform)}`}>
                        {prefilledIdea.platform}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground capitalize">{prefilledIdea.content_type}</span>
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-foreground mb-1 break-words">{prefilledIdea.suggested_topic}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">{prefilledIdea.reasoning}</p>
                  </div>
                  <div className="flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSelectIdea(prefilledIdea); }}
                      disabled={selectingId === '__prefilled__'}
                      className="p-2 sm:p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors shadow-sm group-hover:scale-105 transform disabled:opacity-70 disabled:cursor-not-allowed"
                      title="Start Project"
                    >
                      {selectingId === '__prefilled__' ? (
                        <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      ) : (
                        <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="text-center py-8">
            <button
              onClick={generateIdeas}
              disabled={generating}
              className="px-8 py-4 bg-primary text-primary-foreground rounded-xl font-medium hover:bg-primary/90 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 mx-auto disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {generating ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /> Analyzing Performance...</>
              ) : (
                <><Bot className="w-5 h-5" /> Generate New Ideas</>
              )}
            </button>
          </div>

          <div className="grid gap-4">
            {loading ? (
              <div className="text-center text-muted-foreground py-10">Loading suggestions...</div>
            ) : suggestions.length === 0 && !generating ? (
              <div className="text-center text-muted-foreground py-10 border-2 border-dashed border-border rounded-2xl">
                No active ideas. Click generate to start.
              </div>
            ) : (
              suggestions.map((idea) => (
                <div key={idea.id} className="bg-card border border-border rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                        <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${platformColor(idea.platform)}`}>
                          {idea.platform}
                        </span>
                        <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {idea.confidence_score}% Match
                        </span>
                      </div>
                      <h3 className="text-base sm:text-lg font-bold text-foreground mb-1 break-words">{idea.suggested_topic}</h3>
                      <p className="text-sm text-muted-foreground line-clamp-2">{idea.reasoning}</p>
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleSelectIdea(idea)}
                        disabled={selectingId === idea.id}
                        className="p-2 sm:p-3 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors shadow-sm group-hover:scale-105 transform disabled:opacity-70 disabled:cursor-not-allowed"
                        title="Start Project"
                      >
                        {selectingId === idea.id ? (
                          <RefreshCw className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleAction(idea.id, 'rejected')}
                        disabled={!!selectingId}
                        className="p-2 sm:p-3 bg-accent text-muted-foreground rounded-xl hover:bg-accent/80 hover:text-foreground transition-colors disabled:opacity-50"
                        title="Dismiss"
                      >
                        <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5" />
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
