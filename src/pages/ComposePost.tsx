import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { ArrowLeft, ArrowRight, Check, Upload, X as XIcon } from 'lucide-react';
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
 *   - QUEUE     : let Zernio assign the next free slot
 */

type Mode = 'now' | 'schedule' | 'queue';
type PublishState = 'idle' | 'uploading' | 'submitting' | 'done' | 'error';
type YouTubeFormat = 'short' | 'long';

interface MediaItem {
  file: File;
  preview: string;
  kind: 'image' | 'video';
}

interface PlatformRule {
  captionLimit: number;
  mediaRequired: boolean;
  mediaMax: number;
  mediaTypes: 'image' | 'video' | 'both';
}

const PLATFORM_RULES: Record<string, PlatformRule> = {
  twitter:   { captionLimit: 280,    mediaRequired: false, mediaMax: 4,  mediaTypes: 'both' },
  threads:   { captionLimit: 500,    mediaRequired: false, mediaMax: 10, mediaTypes: 'both' },
  linkedin:  { captionLimit: 3000,   mediaRequired: false, mediaMax: 9,  mediaTypes: 'both' },
  instagram: { captionLimit: 2200,   mediaRequired: true,  mediaMax: 10, mediaTypes: 'both' },
  tiktok:    { captionLimit: 4000,   mediaRequired: true,  mediaMax: 1,  mediaTypes: 'video' },
  youtube:   { captionLimit: 5000,   mediaRequired: true,  mediaMax: 1,  mediaTypes: 'video' },
  facebook:  { captionLimit: 63000,  mediaRequired: false, mediaMax: 10, mediaTypes: 'both' },
};

const YOUTUBE_SHORT_CAPTION_LIMIT = 100;

export function ComposePost() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [accounts, setAccounts] = useState<ZernioAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<string>>(new Set());
  const [youtubeFormat, setYoutubeFormat] = useState<YouTubeFormat>('short');

  const [caption, setCaption] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [mode, setMode] = useState<Mode>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [suggestedTimes, setSuggestedTimes] = useState<SuggestedTime[]>([]);
  const [suggestedSource, setSuggestedSource] = useState<'industry_default' | 'personal'>('industry_default');

  const [publishState, setPublishState] = useState<PublishState>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!user) return;
    listZernioAccounts(user.id, false)
      .then((s) => {
        setAccounts(s.accounts);
        if (s.accounts.length > 0) {
          setSelectedPlatforms(new Set([s.accounts[0].platform]));
        }
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [user]);

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

  useEffect(() => {
    return () => {
      media.forEach((m) => URL.revokeObjectURL(m.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ytSelected = selectedPlatforms.has('youtube');
  const ytLimit = ytSelected && youtubeFormat === 'short'
    ? YOUTUBE_SHORT_CAPTION_LIMIT
    : (PLATFORM_RULES.youtube?.captionLimit ?? 5000);

  const captionLimit = [...selectedPlatforms]
    .map((p) => p === 'youtube' ? ytLimit : (PLATFORM_RULES[p]?.captionLimit ?? 2200))
    .reduce((min, n) => Math.min(min, n), Infinity);

  const effectiveLimit = captionLimit === Infinity ? 2200 : captionLimit;
  const remaining = effectiveLimit - caption.length;
  const overLimit = remaining < 0;

  const mediaRequiredByAny = [...selectedPlatforms].some((p) => PLATFORM_RULES[p]?.mediaRequired);
  const mediaMax = [...selectedPlatforms]
    .map((p) => PLATFORM_RULES[p]?.mediaMax ?? 10)
    .reduce((min, n) => Math.min(min, n), Infinity);
  const requiresVideoOnly = [...selectedPlatforms].some((p) => PLATFORM_RULES[p]?.mediaTypes === 'video');

  const isEmpty = caption.trim().length === 0;
  const noPlatformSelected = selectedPlatforms.size === 0;
  const missingRequiredMedia = mediaRequiredByAny && media.length === 0;
  const tooMuchMedia = mediaMax !== Infinity && media.length > mediaMax;
  const wrongMediaType = requiresVideoOnly && media.some((m) => m.kind !== 'video');

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  };

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const next: MediaItem[] = [...media];
    for (const f of Array.from(list)) {
      const kind: 'image' | 'video' = f.type.startsWith('video') ? 'video' : 'image';
      next.push({ file: f, preview: URL.createObjectURL(f), kind });
    }
    setMedia(next);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeMedia = (idx: number) => {
    setMedia((prev) => {
      const next = [...prev];
      const [removed] = next.splice(idx, 1);
      if (removed) URL.revokeObjectURL(removed.preview);
      return next;
    });
  };

  const applySuggestedTime = (time: SuggestedTime) => {
    const date = suggestedTimeToDate(time);
    const pad = (n: number) => String(n).padStart(2, '0');
    setScheduleAt(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
    );
  };

  const uploadMedia = async (): Promise<string[]> => {
    if (!user || media.length === 0) return [];
    const urls: string[] = [];
    for (const m of media) {
      const ext = m.file.name.split('.').pop() || (m.kind === 'video' ? 'mp4' : 'jpg');
      const path = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const { data, error } = await supabase.storage
        .from('media')
        .upload(path, m.file, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      const { data: pub } = supabase.storage.from('media').getPublicUrl(data.path);
      urls.push(pub.publicUrl);
    }
    return urls;
  };

  const submit = async () => {
    if (!user || isEmpty || overLimit || noPlatformSelected) return;
    if (missingRequiredMedia) {
      setPublishState('error');
      setErrorMsg('Instagram, TikTok, and YouTube require at least one media file.');
      return;
    }
    if (tooMuchMedia) {
      setPublishState('error');
      setErrorMsg(`Selected platforms allow max ${mediaMax} media files.`);
      return;
    }
    if (wrongMediaType) {
      setPublishState('error');
      setErrorMsg('TikTok and YouTube require a video, not an image.');
      return;
    }

    setPublishState('uploading');
    setErrorMsg('');

    try {
      const mediaUrls = await uploadMedia();

      let scheduledFor: string;
      if (mode === 'now') {
        scheduledFor = new Date().toISOString();
      } else if (mode === 'schedule') {
        if (!scheduleAt) throw new Error('Pick a date/time to schedule');
        scheduledFor = new Date(scheduleAt).toISOString();
      } else {
        scheduledFor = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      setPublishState('submitting');

      const rows = [...selectedPlatforms].map((platform) => ({
        user_id: user.id,
        platform,
        caption: caption.trim(),
        media_urls: mediaUrls,
        scheduled_date: scheduledFor,
        scheduled_for: scheduledFor,
        status: 'scheduled',
        provider: 'zernio',
        content_type: platform === 'youtube' ? youtubeFormat : 'post',
      }));

      const { error: insertErr } = await supabase.from('content_posts').insert(rows);
      if (insertErr) throw new Error(insertErr.message);

      if (mode === 'now') {
        const { error: invokeErr } = await supabase.functions.invoke('publish-scheduled-posts');
        if (invokeErr) console.warn('Dispatch invoke warning:', invokeErr.message);
      }

      setPublishState('done');
      setTimeout(() => navigate('/office'), 1200);
    } catch (err) {
      setPublishState('error');
      setErrorMsg((err as Error).message);
    }
  };

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
      <div className="flex gap-2 mb-6 flex-wrap">
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
              }}
              title={connected ? '' : 'Connect this platform first in Office'}
            >
              {p.name}
            </button>
          );
        })}
      </div>

      {/* YouTube format toggle */}
      {ytSelected && (
        <div className="mb-6">
          <span className="t-micro block mb-2">YOUTUBE FORMAT</span>
          <div className="flex gap-2">
            {(['short', 'long'] as YouTubeFormat[]).map((f) => {
              const active = youtubeFormat === f;
              const label = f === 'short' ? 'SHORTS · 100 CHAR CAP' : 'LONG-FORM · 5000';
              return (
                <button
                  key={f}
                  onClick={() => setYoutubeFormat(f)}
                  className="font-mono text-[10px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    color: active ? 'var(--accent)' : 'var(--foreground)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Caption */}
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
        <div className="flex justify-between mt-3 items-center">
          <span className="t-micro text-muted-foreground" style={{ fontSize: '9px' }}>
            CAP: {effectiveLimit}{ytSelected && youtubeFormat === 'short' ? ' · YT SHORTS' : ''}
          </span>
          <span
            className="font-mono text-[11px]"
            style={{ color: overLimit ? 'var(--destructive)' : remaining < 50 ? 'var(--accent)' : 'var(--muted-foreground)' }}
          >
            {remaining}
          </span>
        </div>
      </div>

      {/* Media upload */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="t-micro">
            MEDIA · {String(media.length).padStart(2,'0')} / {String(mediaMax === Infinity ? 10 : mediaMax).padStart(2,'0')}
            {mediaRequiredByAny && media.length === 0 && (
              <span className="ml-2" style={{ color: 'var(--destructive)' }}>REQUIRED</span>
            )}
          </span>
          {requiresVideoOnly && (
            <span className="t-micro text-muted-foreground" style={{ fontSize: '9px' }}>
              VIDEO ONLY
            </span>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={requiresVideoOnly ? 'video/*' : 'image/*,video/*'}
          multiple={mediaMax > 1}
          onChange={onFilesPicked}
          className="hidden"
        />

        {media.length === 0 ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full border border-dashed border-border px-4 py-8 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
          >
            <Upload className="w-5 h-5" />
            <span className="t-micro">ADD MEDIA</span>
            <span className="t-micro" style={{ fontSize: '9px' }}>
              {requiresVideoOnly ? 'MP4, MOV' : 'JPG, PNG, MP4, MOV'}
            </span>
          </button>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {media.map((m, idx) => (
              <div key={idx} className="relative aspect-square border border-border overflow-hidden bg-muted/20">
                {m.kind === 'video' ? (
                  <video src={m.preview} className="w-full h-full object-cover" muted />
                ) : (
                  <img src={m.preview} alt="" className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removeMedia(idx)}
                  className="absolute top-1 right-1 w-6 h-6 bg-background/80 border border-border flex items-center justify-center hover:bg-background transition-colors"
                  aria-label="Remove"
                >
                  <XIcon className="w-3 h-3" />
                </button>
                <span
                  className="absolute bottom-1 left-1 font-mono text-[9px] px-1 py-0.5 bg-background/80 uppercase"
                  style={{ color: 'var(--muted-foreground)' }}
                >
                  {m.kind}
                </span>
              </div>
            ))}
            {media.length < mediaMax && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square border border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
              >
                <Upload className="w-4 h-4" />
                <span className="t-micro" style={{ fontSize: '9px' }}>ADD</span>
              </button>
            )}
          </div>
        )}
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

      {/* Schedule mode */}
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

      {mode === 'queue' && (
        <div className="mb-6 border border-border px-4 py-3 t-micro text-muted-foreground">
          NEXT FREE SLOT — Zernio will assign automatically
        </div>
      )}

      {publishState === 'error' && (
        <p className="t-micro mb-4" style={{ color: 'var(--destructive)' }}>
          {errorMsg || 'Something went wrong. Try again.'}
        </p>
      )}

      <button
        onClick={submit}
        disabled={
          isEmpty || overLimit || noPlatformSelected ||
          missingRequiredMedia || tooMuchMedia || wrongMediaType ||
          (mode === 'schedule' && !scheduleAt) ||
          publishState === 'uploading' || publishState === 'submitting'
        }
        className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span className="btn-ie-text">
          {publishState === 'uploading'
            ? 'UPLOADING…'
            : publishState === 'submitting'
            ? 'SUBMITTING…'
            : mode === 'now'
            ? 'PUBLISH NOW'
            : mode === 'queue'
            ? 'ADD TO QUEUE'
            : 'SCHEDULE POST'}
        </span>
        {publishState === 'idle' && <ArrowRight className="w-3 h-3" />}
      </button>

    </div>
  );
}
