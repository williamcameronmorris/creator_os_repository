import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAIQuota } from '../../lib/aiQuota';
import { Bot, Save, Wand2, FileText, Hash, Layout, AlignLeft, ChevronRight, AlertCircle } from 'lucide-react';

interface ScriptingStageProps {
  workflowId: string;
  contentType: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function ScriptingStage({ workflowId, contentType, onComplete, onSkip }: ScriptingStageProps) {
  const [mode, setMode] = useState<'simple' | 'structured'>(
    ['video', 'blog'].includes(contentType) ? 'structured' : 'simple'
  );

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [script, setScript] = useState({
    hook: '',
    body: '',
    cta: '',
    caption: '',
    hashtags: ''
  });

  const [notes, setNotes] = useState('');
  const [ideaTopic, setIdeaTopic] = useState('');

  useEffect(() => {
    loadWorkflowData();
  }, [workflowId]);

  const loadWorkflowData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('content_workflow_stages')
      .select('script_content, idea_content')
      .eq('id', workflowId)
      .maybeSingle();

    if (data) {
      if (data.idea_content) {
        setIdeaTopic(data.idea_content);
      }

      if (data.script_content) {
        const content = data.script_content as any;
        setScript({
          hook: content.hook || '',
          body: content.body || '',
          cta: content.cta || '',
          caption: content.caption || '',
          hashtags: Array.isArray(content.hashtags) ? content.hashtags.join(' ') : (content.hashtags || '')
        });
        setNotes(content.notes || '');

        if (content.notes && !content.hook) {
          setMode('simple');
        }
      }
    }
    setLoading(false);
  };

  const handleGenerateScript = async () => {
    setGenerating(true);
    setAiError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check quota before calling
      const quota = await getAIQuota(user.id);
      if (quota && quota.requests_remaining <= 0) {
        throw new Error("Daily AI quota exceeded. Resets at midnight.");
      }

      const { data: fnData, error: fnError } = await supabase.functions.invoke('generate-script', {
        body: {
          userId: user.id,
          workflowId,
          topic: ideaTopic,
          contentType,
          mode,
        },
      });

      if (fnError) throw fnError;
      if (!fnData?.success) throw new Error(fnData?.error || 'Generation failed');

      const result = fnData.result;
      if (result.mode === 'simple' && result.notes) {
        setNotes(result.notes);
      } else if (result.mode === 'structured' && result.script) {
        setScript({
          hook: result.script.hook || '',
          body: result.script.body || '',
          cta: result.script.cta || '',
          caption: result.script.caption || '',
          hashtags: Array.isArray(result.script.hashtags)
            ? result.script.hashtags.join(' ')
            : (result.script.hashtags || ''),
        });
      }
    } catch (err: any) {
      console.error('generate-script error:', err);
      setAiError(err.message || 'AI generation failed. Try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async (completeStage = false) => {
    setLoading(true);

    const updateData: any = {
      script_content: {
        ...script,
        notes: notes,
        hashtags: script.hashtags.split(' ').filter(tag => tag.startsWith('#'))
      },
      updated_at: new Date().toISOString()
    };

    if (completeStage) {
      updateData.current_stage = 'creation';
      updateData.script_completed_at = new Date().toISOString();
    }

    await supabase
      .from('content_workflow_stages')
      .update(updateData)
      .eq('id', workflowId);

    if (completeStage) {
      onComplete();
    }
    setLoading(false);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {ideaTopic && (
        <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-xl">
          <p className="text-sm font-medium text-muted-foreground mb-1">Selected Idea:</p>
          <p className="text-lg font-bold text-foreground">{ideaTopic}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h2 className="text-2xl font-bold text-slate-900">Scripting</h2>

        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setMode('simple')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'simple' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <AlignLeft className="w-4 h-4" />
            Quick Notes
          </button>
          <button
            onClick={() => setMode('structured')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
              mode === 'structured' ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Layout className="w-4 h-4" />
            Structured
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={handleGenerateScript}
              disabled={generating}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium flex items-center gap-2"
            >
              {generating ? <Wand2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
              {mode === 'simple' ? 'Generate Outline' : 'Auto-Draft Script'}
            </button>
          </div>

          {aiError && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              {aiError}
            </div>
          )}

          {mode === 'simple' ? (
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Jot down your concept, bullet points, or rough ideas here..."
              className="w-full p-6 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[400px] text-lg leading-relaxed bg-white shadow-sm"
            />
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Visual Hook (0-3s)</label>
                <textarea
                  value={script.hook}
                  onChange={(e) => setScript({ ...script, hook: e.target.value })}
                  placeholder="The 'Stop the Scroll' moment..."
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Body</label>
                <textarea
                  value={script.body}
                  onChange={(e) => setScript({ ...script, body: e.target.value })}
                  placeholder="The core value or story..."
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[200px]"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">CTA</label>
                <input
                  type="text"
                  value={script.cta}
                  onChange={(e) => setScript({ ...script, cta: e.target.value })}
                  placeholder="What should they do next?"
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 h-full">
            <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-slate-500" />
              Caption & Tags
            </h3>

            <div className="space-y-4">
              <textarea
                value={script.caption}
                onChange={(e) => setScript({ ...script, caption: e.target.value })}
                placeholder="Write your caption here (optional)..."
                className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[200px] bg-white"
              />
              <div className="flex items-center gap-2 bg-white p-3 rounded-xl border border-slate-200">
                <Hash className="w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={script.hashtags}
                  onChange={(e) => setScript({ ...script, hashtags: e.target.value })}
                  placeholder="Add tags..."
                  className="flex-1 outline-none text-blue-600 placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200 space-y-3">
              <button
                onClick={() => handleSave(true)}
                disabled={loading}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg"
              >
                Save & Continue
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={onSkip}
                className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
              >
                Skip Scripting
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
