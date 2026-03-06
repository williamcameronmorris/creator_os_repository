import { useState, useEffect } from 'react';
import { supabase, type AIContentSuggestion } from '../lib/supabase';
import { Sparkles, Bot, ThumbsUp, ThumbsDown, RefreshCw, ArrowRight, PenTool, Lightbulb } from 'lucide-react';

interface IdeationStageProps {
  onIdeaSelected: (idea: AIContentSuggestion) => void;
}

export function IdeationStage({ onIdeaSelected }: IdeationStageProps) {
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [suggestions, setSuggestions] = useState<AIContentSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [manualTopic, setManualTopic] = useState('');
  const [manualFormat, setManualFormat] = useState('reel');

  useEffect(() => {
    if (mode === 'ai') {
      loadSuggestions();
    }
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

    if (data) setSuggestions(data as AIContentSuggestion[]);
    setLoading(false);
  };

  const generateIdeas = async () => {
    setGenerating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await new Promise(resolve => setTimeout(resolve, 2000));

    const newIdeas: Partial<AIContentSuggestion>[] = [
      {
        user_id: user.id,
        platform: 'instagram',
        content_type: 'reel',
        suggested_topic: 'Behind the Scenes of [Project X]',
        suggested_format: 'Time-lapse with voiceover',
        reasoning: 'Your audience engaged 40% more with BTS content last week.',
        confidence_score: 95,
        status: 'new'
      },
      {
        user_id: user.id,
        platform: 'tiktok',
        content_type: 'video',
        suggested_topic: '3 Mistakes Beginners Make',
        suggested_format: 'Green screen reaction',
        reasoning: 'Educational hooks are trending in your niche right now.',
        confidence_score: 88,
        status: 'new'
      }
    ];

    const { data, error } = await supabase
      .from('ai_content_suggestions')
      .insert(newIdeas)
      .select();

    if (data && !error) {
      setSuggestions(prev => [...(data as AIContentSuggestion[]), ...prev]);
    }
    setGenerating(false);
  };

  const handleManualSubmit = async () => {
    if (!manualTopic) return;
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
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ideation</h2>
          <p className="text-slate-500 text-sm">Choose a concept to start your production line.</p>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMode('ai')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'ai' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Suggestions
          </button>
          <button
            onClick={() => setMode('manual')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'manual' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <PenTool className="w-4 h-4" />
            Manual Entry
          </button>
        </div>
      </div>

      {mode === 'manual' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-6">
            <Lightbulb className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-6">What's on your mind?</h3>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Concept / Topic</label>
              <input
                type="text"
                value={manualTopic}
                onChange={(e) => setManualTopic(e.target.value)}
                placeholder="e.g., Day in the life, Q&A, Product Review..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Intended Format</label>
              <div className="flex gap-3">
                {['reel', 'story', 'post', 'video'].map(fmt => (
                  <button
                    key={fmt}
                    onClick={() => setManualFormat(fmt)}
                    className={`px-4 py-2 rounded-lg border text-sm font-medium capitalize ${
                      manualFormat === fmt
                        ? 'bg-blue-50 border-blue-200 text-blue-700'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    {fmt}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleManualSubmit}
              disabled={!manualTopic}
              className="w-full py-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              Start Project
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="text-center py-8">
            <button
              onClick={generateIdeas}
              disabled={generating}
              className="px-8 py-4 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 mx-auto disabled:opacity-70"
            >
              {generating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Analyzing Performance...
                </>
              ) : (
                <>
                  <Bot className="w-5 h-5" />
                  Generate New Ideas
                </>
              )}
            </button>
          </div>

          <div className="grid gap-4">
            {loading ? (
              <div className="text-center text-slate-400 py-10">Loading suggestions...</div>
            ) : suggestions.length === 0 && !generating ? (
              <div className="text-center text-slate-400 py-10 border-2 border-dashed border-slate-200 rounded-2xl">
                No active ideas. Click generate to start.
              </div>
            ) : (
              suggestions.map((idea) => (
                <div key={idea.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all group">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
                          idea.platform === 'instagram' ? 'bg-pink-100 text-pink-700' :
                          idea.platform === 'tiktok' ? 'bg-black/5 text-black' : 'bg-red-100 text-red-700'
                        }`}>
                          {idea.platform}
                        </span>
                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          {idea.confidence_score || 75}% Match
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 mb-1">{idea.suggested_topic}</h3>
                      <p className="text-sm text-slate-600 line-clamp-2">{idea.reasoning}</p>
                    </div>

                    <button
                      onClick={() => onIdeaSelected(idea)}
                      className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm group-hover:scale-105 transform"
                      title="Start Project"
                    >
                      <ArrowRight className="w-5 h-5" />
                    </button>
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
