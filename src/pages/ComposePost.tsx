import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { listZernioAccounts, type ZernioAccount, ZERNIO_PLATFORMS } from '../lib/zernio';
import {
  getSuggestedTimes,
  suggestedTimeToDate,
  formatSuggestedTime,
  type SuggestedTime,
} from '../lib/suggestedTimes';

/**
 * ComposePost — Zernio-modern quick publisher.
 *
 * Multi-select across all Zernio-connected platforms, with three modes:
 *   - NOW       : insert as scheduled@now and immediately invoke the orchestrator
 *   - SCHEDULE  : datetime picker, optionally autofilled by Suggested Times chips
 *   - QUEUE     : let Zernio assign the next free slot (queuedFromProfile flag)
 *
 * For each selected platform, one row is inserted into content_posts with
 * provider='zernio'. The publish-scheduled-posts orchestrator routes by
 * provider field — direct integrations on existing rows are unaffected.
 */

type Mode = 'now' | 'schedule' | 'queue';
type PublishState = 'idle' | 'submitting' | 'done' | 'error';

// Per-platform character limits, most-restrictive used when multiple selected
const PLATFORM_CAPTION_LIMITS: Record<string, number> = {
  twitter: 280,
  threads: 500,
  linkedin: 3000,
  instagram: 2200,
  tiktok: 4000,
  youtube: 5000,
  facebook: 63000,
};

export function ComposePost() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState<ZernioAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());

  const [caption, setCaption] = useState('');
  const [mode, setMode] = useState<Mode>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [suggestedTimes, setSuggestedTimes] = useState<SuggestedTime[]>([]);
  const [suggestedSource, setSuggestedSource] = useState<'industry_default' | 'personal'>('industry_default');

  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Load connected accounts once
  useEffect(() => {
    if (!user) return;
    listZernioAccounts(user.id, false)
      .then((s) => {
        setAccounts(s.accounts);
        // Pre-select the first connected platform
        if (s.accounts.length > 0) {
          setSelectedPlatforms(new Set([s.accounts[0].platform]));
        }
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [user]);

  // Load suggested times whenever the primary platform changes
  useEffect(() => {
    if (!user || selectedPlatforms.size === 0) {
      setSuggestedTimes([]);
      return;
    }
    const primary = [...selectedPlatforms][0];
    getSuggestedTimes(user.id, primary).then((r) => {
      setSuggestedTimes(r.times);
      setSuggestedSource(r.source);
    });
  }, [user, selectedPlatforms]);

  // Most-restrictive caption limit across selected platforms
  const limit = [...selectedPlatforms]
    .map((p) => PLATFORM_CAPTION_LIMITS[p] ?? 2200)
    .reduce((min, n) => Math.min(min, n), Infinity);
  const remaining = (limit === Infinity ? 2200 : limit) - caption.length;
  const overLimit = remaining < 0;
  const isEmpty = caption.trim().length === 0;
  const noPlatformSelected = selectedPlatforms.size === 0;

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const applySuggestedTime = (time: SuggestedTime) => {
    const date = suggestedTimeToDate(time);
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const pad = (n: number) => String(n).padStart(2, '0');
    setScheduleAt(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  };

  const submit = async () => {
    if (!user || isEmpty || overLimit || noPlatformSelected) return;
    setPublishState('submitting');
    setErrorMsg('');

    try {
      let scheduledFor: string;
      if (mode === 'now') {
        scheduledFor = new Date().toISOString();
      } else if (mode === 'schedule') {
        if (!scheduleAt) throw new Error('Pick a date/time to schedule');
        scheduledFor = new Date(scheduleAt).toISOString();
      } else {
        // queue: insert with a placeholder scheduled_for; Zernio assigns the real slot
        scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // One row per platform
      const rows = [...selectedPlatforms].map((platform) => ({
        user_id: user.id,
        platform,
        caption: caption.trim(),
        media_urls: [],
        scheduled_date: scheduledFor,
        scheduled_for: scheduledFor,
        status: 'scheduled',
        provider: 'zernio',
        content_type: 'post',
      }));

      const { error: insertErr } = await supabase.from('content_posts').insert(rows);
      if (insertErr) throw new Error(insertErr.message);

      // Trigger immediate dispatch for "now" posts
      if (mode === 'now') {
        const { error: invokeErr } = await supabase.functions.invoke('publish-scheduled-posts');
        if (invokeErr) {
          console.warn('Dispatch invoke warning:', invokeErr.message);
          // Non-fatal — orchestrator will pick up on next cron run
        }
      }

      setPublishState('done');
      setTimeout(() => navigate('/office'), 1200);
    } catch (err) {
      setPublishState('error');
      setErrorMsg((err as Error).message);
    }
  };

  // Done state
  if (publishState === 'done') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div
          className="w-12 h-12 flex items-center justify-center border border-border"
          style={{ color: 'var(--accent)' }}
        >
          <Check className="w-6 h-6" />
        </div>
        <span className="t-micro">
          {mode === 'now' ? 'PUBLISHING' : mode === 'queue' ? 'QUEUED' : 'SCHEDULED'}
        </span>
      </div>
    );
  }

  // No platforms connected
  if (!loadingAccounts && accounts.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="t-micro mb-2">
          <span className="text-foreground">00</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>COMPOSE</span>
        </div>
        <h1
          className="text-foreground mb-8"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          Connect a platform{' '}
          <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>first.</em>
        </h1>
        <p className="t-body mb-8" style={{ maxWidth: '40ch' }}>
          You haven't linked any social accounts yet. Wire one up to start publishing.
        </p>
        <button onClick={() => navigate('/office/connections')} className="btn-ie">
          <span className="btn-ie-text">Open connections</span>
        </button>
      </div>
    );
  }

  // Build display platforms list — show all 7, but disable ones not connected
  const connectedPlatformIds = new Set(accounts.map((a) => a.platform));

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
          <span className="mx-2 text-muted-foreground">/</span>
          <span>COMPOSE</span>
        </div>
      </div>

      {/* Platform multi-select */}
      <div className="mb-2">
        <span className="t-micro">PLATFORMS · {String(selectedPlatforms.size).padStart(2,'0')}</span>
      </div>
      <div className="flex gap-2 mb-8 flex-wrap">
        {ZERNIO_PLATFORMS.map((p) => {
          const connected = connectedPlatformIds.has(p.id);
          const selected = selectedPlatforms.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => connected && togglePlatform(p.id)}
              disabled={!connected}
              className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderColor: selected ? 'var(--accent)' : 'var(--border)',
                color: selected ? 'var(--accent)' : connected ? 'var(--foreground)' : 'var(--muted-foreground)',
                background: selected ? 'transparent' : 'transparent',
              }}
              title={connected ? '' : 'Connect this platform first in Office'}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* Compose area */}
      <div className="ie-border-t ie-border-b py-6 mb-6">
        <textarea
          autoFocus
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What's on your mind?"
          rows={6}
          className="w-full bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground"
          style={{ fontSize: '1.0625rem', letterSpacing: '-0.01em', lineHeight: 1.6 }}
        />
        <div className="flex justify-end mt-3">
          <span
            className="font-mono text-[11px]"
            style={{ color: overLimit ? 'var(--destructive)' : remaining < 50 ? 'var(--accent)' : 'var(--muted-foreground)' }}
          >
            {remaining}
          </span>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="mb-6">
        <span className="t-micro block mb-2">WHEN</span>
        <div className="flex gap-2 flex-wrap">
          {(['now', 'schedule', 'queue'] as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors"
                style={{
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent)' : 'var(--foreground)',
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Schedule mode: suggested times + datetime picker */}
      {mode === 'schedule' && (
        <div className="mb-6">
          {suggestedTimes.length > 0 && (
            <div className="mb-4">
              <div className="t-micro mb-2 flex items-center justify-between">
                <span>SUGGESTED · 03</span>
                <span className="text-muted-foreground" style={{ fontSize: '9px' }}>
                  {suggestedSource === 'personal' ? 'BASED ON YOUR ANALYTICS' : 'BASED ON INDUSTRY RESEARCH'}
                </span>
              </div>
              <div className="flex gap-2 flex-wrap">
                {suggestedTimes.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => applySuggestedTime(t)}
                    className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border border-border text-foreground hover:bg-foreground hover:text-background transition-colors"
                  >
                    {formatSuggestedTime(t)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="t-micro block mb-2">SCHEDULE FOR</label>
          <input
            type="datetime-local"
            value={scheduleAt}
            onChange={(e) => setScheduleAt(e.target.value)}
            className="w-full bg-transparent border border-border px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-accent transition-colors"
          />
        </div>
      )}

      {/* Queue mode hint */}
      {mode === 'queue' && (
        <div className="mb-6 border border-border px-4 py-3 t-micro text-muted-foreground">
          NEXT FREE SLOT — Zernio will assign automatically
        </div>
      )}

      {/* Error */}
      {publishState === 'error' && (
        <p className="t-micro mb-4" style={{ color: 'var(--destructive)' }}>
          {errorMsg || 'Something went wrong. Try again.'}
        </p>
      )}

      {/* Submit */}
      <button
        onClick={submit}
        disabled={
          isEmpty || overLimit || noPlatformSelected ||
          (mode === 'schedule' && !scheduleAt) ||
          publishState === 'submitting'
        }
        className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span className="btn-ie-text">
          {publishState === 'submitting'
            ? 'SUBMITTING…'
            : mode === 'now'
            ? 'PUBLISH NOW'
            : mode === 'queue'
            ? 'ADD TO QUEUE'
            : 'SCHEDULE POST'}
        </span>
        {publishState !== 'submitting' && <ArrowRight className="w-3 h-3" />}
      </button>

    </div>
  );
}
