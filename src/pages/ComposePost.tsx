import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, Check } from 'lucide-react';

const PLATFORMS = [
  { id: 'threads',   label: 'Threads',   limit: 500  },
  { id: 'instagram', label: 'Instagram', limit: 2200 },
] as const;

type PlatformId = typeof PLATFORMS[number]['id'];

type Mode = 'idle' | 'scheduling' | 'saving' | 'done' | 'error';

export function ComposePost() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [platform, setPlatform] = useState<PlatformId>('threads');
  const [caption, setCaption] = useState('');
  const [scheduleAt, setScheduleAt] = useState('');
  const [mode, setMode] = useState<Mode>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const selected = PLATFORMS.find(p => p.id === platform)!;
  const remaining = selected.limit - caption.length;
  const overLimit = remaining < 0;
  const isEmpty = caption.trim().length === 0;

  const save = async (postNow: boolean) => {
    if (!user || isEmpty || overLimit) return;
    setMode('saving');
    setErrorMsg('');

    const scheduledDate = postNow
      ? new Date().toISOString()
      : scheduleAt
        ? new Date(scheduleAt).toISOString()
        : null;

    const { error } = await supabase.from('content_posts').insert({
      user_id: user.id,
      platform,
      caption: caption.trim(),
      media_urls: [],
      scheduled_date: scheduledDate,
      status: postNow ? 'published' : 'scheduled',
    });

    if (error) {
      setMode('error');
      setErrorMsg(error.message);
      return;
    }

    setMode('done');
    setTimeout(() => navigate('/office'), 1200);
  };

  const handleSchedule = () => {
    if (mode === 'idle') {
      setMode('scheduling');
      return;
    }
    save(false);
  };

  if (mode === 'done') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div
          className="w-12 h-12 flex items-center justify-center border border-border"
          style={{ color: 'var(--accent)' }}
        >
          <Check className="w-6 h-6" />
        </div>
        <span className="t-micro">SAVED</span>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">

      {/* Header */}
      <div className="flex items-center justify-between mb-10">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 t-micro text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          BACK
        </button>
        <div className="t-micro">
          <span className="text-foreground">00</span>
          <span className="mx-2">/</span>
          <span>COMPOSE</span>
        </div>
      </div>

      {/* Platform selector */}
      <div className="flex gap-2 mb-8 flex-wrap">
        {PLATFORMS.map(p => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors"
            style={{
              borderColor: platform === p.id ? 'var(--accent)' : 'var(--border)',
              color: platform === p.id ? 'var(--accent)' : 'var(--muted-foreground)',
              background: 'transparent',
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Compose area */}
      <div className="ie-border-t ie-border-b py-6 mb-6">
        <textarea
          autoFocus
          value={caption}
          onChange={e => setCaption(e.target.value)}
          placeholder={`What's on your mind?`}
          rows={6}
          className="w-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground"
          style={{ fontSize: '1.0625rem', letterSpacing: '-0.01em', lineHeight: 1.6 }}
        />
        <div className="flex justify-end mt-3">
          <span
            className="t-mono text-[11px]"
            style={{ color: overLimit ? 'var(--destructive)' : remaining < 50 ? 'var(--accent)' : 'var(--muted-foreground)' }}
          >
            {remaining}
          </span>
        </div>
      </div>

      {/* Schedule datetime input */}
      {mode === 'scheduling' && (
        <div className="mb-6 animate-reveal-up">
          <label className="t-micro block mb-2">SCHEDULE FOR</label>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={e => setScheduleAt(e.target.value)}
            className="w-full bg-transparent border border-border px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-accent transition-colors"
          />
        </div>
      )}

      {/* Error */}
      {mode === 'error' && (
        <p className="t-micro mb-4" style={{ color: 'var(--destructive)' }}>
          {errorMsg || 'Something went wrong. Try again.'}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => save(true)}
          disabled={isEmpty || overLimit || mode === 'saving'}
          className="btn-ie btn-ie-solid flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="btn-ie-text">
            {mode === 'saving' ? 'SAVING…' : 'POST NOW'}
          </span>
        </button>
        <button
          onClick={handleSchedule}
          disabled={isEmpty || overLimit || mode === 'saving'}
          className="btn-ie flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <span className="btn-ie-text">
            {mode === 'scheduling' ? 'CONFIRM SCHEDULE' : 'SCHEDULE'}
          </span>
        </button>
      </div>

    </div>
  );
}
