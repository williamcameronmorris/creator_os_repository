import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  ArrowLeft, ArrowRight, Check, Upload, X as XIcon,
  Instagram, Youtube, Facebook, Twitter, Sparkles, AtSign, Cloud, Globe,
} from 'lucide-react';
import {
  listPostForMeAccounts,
  createPostForMePost,
  listConnectedAccounts,
  type PostForMeAccount,
  POSTFORME_PLATFORMS,
} from '../lib/postforme';
import {
  getSuggestedTimes,
  suggestedTimeToDate,
  formatSuggestedTime,
  type SuggestedTime,
} from '../lib/suggestedTimes';
import { useTimezone } from '../hooks/useTimezone';
import { localInputToUtc } from '../lib/timezone';

/**
 * ComposePost — Post for Me-backed quick publisher.
 *
 * Multi-select across all connected ACCOUNTS (Sprout-style: a user can link
 * several accounts per platform and checkbox exactly which ones a post goes
 * to), with three modes:
 *   - NOW       : scheduled_at omitted so PFM publishes immediately
 *   - SCHEDULE  : datetime picker, optionally autofilled by Suggested Times chips
 *   - QUEUE     : +24h fallback (PFM has no native "next free slot" yet)
 *
 * Posts are created via PFM's /v1/social-posts and mirrored into
 * content_posts (one row per selected account, stamped with
 * social_account_id + account_username) so OfficeHub can render them
 * with per-account attribution.
 */

type Mode = 'now' | 'schedule' | 'queue';
type PublishState = 'idle' | 'uploading' | 'submitting' | 'done' | 'error';

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
  // Keyed by PFM platform id ('x', not 'twitter' — the old 'twitter' key never
  // matched, so X posts got the 2200-char fallback instead of 280).
  x:         { captionLimit: 280,    mediaRequired: false, mediaMax: 4,  mediaTypes: 'both' },
  threads:   { captionLimit: 500,    mediaRequired: false, mediaMax: 10, mediaTypes: 'both' },
  bluesky:   { captionLimit: 300,    mediaRequired: false, mediaMax: 4,  mediaTypes: 'both' },
  linkedin:  { captionLimit: 3000,   mediaRequired: false, mediaMax: 9,  mediaTypes: 'both' },
  instagram: { captionLimit: 2200,   mediaRequired: true,  mediaMax: 10, mediaTypes: 'both' },
  tiktok:    { captionLimit: 4000,   mediaRequired: true,  mediaMax: 1,  mediaTypes: 'video' },
  youtube:   { captionLimit: 100,    mediaRequired: true,  mediaMax: 1,  mediaTypes: 'video' },
  facebook:  { captionLimit: 63000,  mediaRequired: false, mediaMax: 10, mediaTypes: 'both' },
};

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  youtube: Youtube,
  facebook: Facebook,
  x: Twitter,
  tiktok: Sparkles,
  threads: AtSign,
  bluesky: Cloud,
};

const PLATFORM_NAMES: Record<string, string> = Object.fromEntries(
  POSTFORME_PLATFORMS.map((p) => [p.id, p.name]),
);


export function ComposePost() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { timezone } = useTimezone();

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Synchronous in-flight guard: the disabled state only updates after a
  // re-render, so a fast double-tap can enter submit() twice before then and
  // publish the post twice to the user's real accounts.
  const inFlight = useRef(false);

  const [accounts, setAccounts] = useState<PostForMeAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  // Per-ACCOUNT selection (not per-platform): a user may have several accounts
  // on the same platform and picks exactly which ones this post goes to.
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

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
    listPostForMeAccounts(user.id, false)
      .then((s) => {
        setAccounts(s.accounts);
        const connected = listConnectedAccounts(s.accounts);
        if (connected.length > 0) {
          setSelectedAccountIds([connected[0].id]);
        }
      })
      .catch(() => setAccounts([]))
      .finally(() => setLoadingAccounts(false));
  }, [user]);

  const connectedAccounts = listConnectedAccounts(accounts);
  const selectedAccounts = connectedAccounts.filter((a) => selectedAccountIds.includes(a.id));
  // Union of platforms across the selected accounts — validation rules derive
  // from this (two accounts on the same platform contribute it once).
  const selectedPlatforms = [...new Set(selectedAccounts.map((a) => a.platform))];

  useEffect(() => {
    if (!user || selectedPlatforms.length === 0) {
      setSuggestedTimes([]);
      return;
    }
    const primary = selectedPlatforms[0];
    getSuggestedTimes(user.id, primary).then((r) => {
      setSuggestedTimes(r.times);
      setSuggestedSource(r.source);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedPlatforms.join(',')]);

  useEffect(() => {
    return () => {
      media.forEach((m) => URL.revokeObjectURL(m.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Strictest caption limit across selected platforms wins; remember WHICH
  // platform imposes it so the helper text can name it.
  const { limit: captionLimit, limitedBy } = selectedPlatforms.reduce(
    (acc, p) => {
      const lim = PLATFORM_RULES[p]?.captionLimit ?? 2200;
      return lim < acc.limit ? { limit: lim, limitedBy: p } : acc;
    },
    { limit: Infinity, limitedBy: null as string | null },
  );

  const effectiveLimit = captionLimit === Infinity ? 2200 : captionLimit;
  const remaining = effectiveLimit - caption.length;
  const overLimit = remaining < 0;

  const platformsRequiringMedia = selectedPlatforms.filter((p) => PLATFORM_RULES[p]?.mediaRequired);
  const mediaRequiredByAny = platformsRequiringMedia.length > 0;
  const mediaMax = selectedPlatforms
    .map((p) => PLATFORM_RULES[p]?.mediaMax ?? 10)
    .reduce((min, n) => Math.min(min, n), Infinity);
  const platformsRequiringVideo = selectedPlatforms.filter((p) => PLATFORM_RULES[p]?.mediaTypes === 'video');
  const requiresVideoOnly = platformsRequiringVideo.length > 0;

  const platformNames = (ids: string[]) => ids.map((p) => PLATFORM_NAMES[p] ?? p).join(', ');

  const isEmpty = caption.trim().length === 0;
  const noAccountSelected = selectedAccountIds.length === 0;
  const missingRequiredMedia = mediaRequiredByAny && media.length === 0;
  const tooMuchMedia = mediaMax !== Infinity && media.length > mediaMax;
  const wrongMediaType = requiresVideoOnly && media.some((m) => m.kind !== 'video');

  const toggleAccount = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId],
    );
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
    if (inFlight.current) return;
    if (!user || isEmpty || overLimit || noAccountSelected) return;
    if (missingRequiredMedia) {
      setPublishState('error');
      setErrorMsg(`${platformNames(platformsRequiringMedia)} require${platformsRequiringMedia.length === 1 ? 's' : ''} at least one media file.`);
      return;
    }
    if (tooMuchMedia) {
      setPublishState('error');
      setErrorMsg(`Selected platforms allow max ${mediaMax} media files.`);
      return;
    }
    if (wrongMediaType) {
      setPublishState('error');
      setErrorMsg(`${platformNames(platformsRequiringVideo)} require${platformsRequiringVideo.length === 1 ? 's' : ''} a video, not an image.`);
      return;
    }

    inFlight.current = true;
    setPublishState('uploading');
    setErrorMsg('');

    try {
      const mediaUrls = await uploadMedia();

      let scheduledAt: string | undefined;
      let scheduledForRow: string;
      if (mode === 'now') {
        scheduledAt = undefined;
        scheduledForRow = new Date().toISOString();
      } else if (mode === 'schedule') {
        if (!scheduleAt) throw new Error('Pick a date/time to schedule');
        // Interpret the datetime-local value in the user's profile timezone,
        // matching how OfficeHub/Schedule display it. Using new Date(...) here
        // would interpret it in the browser's timezone and publish at the wrong
        // wall-clock time whenever the two differ.
        scheduledAt = localInputToUtc(scheduleAt, timezone);
        scheduledForRow = scheduledAt;
      } else {
        scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        scheduledForRow = scheduledAt;
      }

      setPublishState('submitting');

      // Re-derive from live account state so a mid-compose disconnect can't
      // send to a stale account id.
      const targets = connectedAccounts.filter((a) => selectedAccountIds.includes(a.id));

      if (targets.length === 0) {
        throw new Error('No connected accounts found for the selected accounts.');
      }

      const post = await createPostForMePost({
        userId: user.id,
        caption: caption.trim(),
        mediaUrls,
        socialAccountIds: targets.map((a) => a.id),
        scheduledAt,
      });

      // Classify media so Analytics/format rendering don't mislabel videos as images.
      const mediaType = media.some((m) => m.kind === 'video')
        ? 'video'
        : media.length > 1
          ? 'carousel'
          : 'image';

      // One mirror row PER SELECTED ACCOUNT (not per platform) so two accounts
      // on the same platform each get their own attributable row.
      const rows = targets.map((account) => ({
        user_id: user.id,
        platform: account.platform,
        social_account_id: account.id,
        account_username: account.username || null,
        caption: caption.trim(),
        media_urls: mediaUrls,
        media_type: mediaType,
        scheduled_date: scheduledForRow,
        scheduled_for: scheduledForRow,
        status: mode === 'now' ? 'publishing' : 'scheduled',
        provider: 'postforme',
        postforme_post_id: post.id,
        content_type: account.platform === 'youtube' ? 'short' : 'post',
      }));

      const { error: insertErr } = await supabase.from('content_posts').insert(rows);
      if (insertErr) {
        // The post already published via PostForMe, but the local mirror insert
        // failed — so it would be invisible to Office/Schedule/Analytics with no
        // trace. Surface it rather than swallowing (previously a console.warn).
        throw new Error(
          `Published to the platform, but saving it to your dashboard failed: ${insertErr.message}. ` +
          `The post is live; it just won't appear in Office until the next sync.`
        );
      }

      setPublishState('done');
      setTimeout(() => navigate('/office'), 1200);
    } catch (err) {
      setPublishState('error');
      setErrorMsg((err as Error).message);
    } finally {
      inFlight.current = false;
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

  if (!loadingAccounts && connectedAccounts.length === 0) {
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

      {/* Account multi-select — one checkbox row per connected account,
          grouped by platform (multiple accounts per platform supported) */}
      <div className="mb-2">
        <span className="t-micro">ACCOUNTS · {String(selectedAccountIds.length).padStart(2,'0')}</span>
      </div>
      <div className="border border-border mb-6">
        {POSTFORME_PLATFORMS.map((p) => {
          const platformAccounts = connectedAccounts.filter((a) => a.platform === p.id);
          if (platformAccounts.length === 0) return null;
          const Icon = PLATFORM_ICONS[p.id] ?? Globe;
          return (
            <div key={p.id} className="border-b border-border last:border-b-0">
              <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="t-micro text-muted-foreground">{p.name.toUpperCase()} · {String(platformAccounts.length).padStart(2,'0')}</span>
              </div>
              {platformAccounts.map((account) => {
                const selected = selectedAccountIds.includes(account.id);
                return (
                  <label
                    key={account.id}
                    className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/20 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleAccount(account.id)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className="w-4 h-4 border flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        borderColor: selected ? 'var(--accent)' : 'var(--border)',
                        background: selected ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      {selected && <Check className="w-3 h-3" style={{ color: 'var(--background)' }} />}
                    </span>
                    <span
                      className="font-mono text-[11px] uppercase tracking-widest truncate"
                      style={{ color: selected ? 'var(--accent)' : 'var(--foreground)' }}
                    >
                      {account.username ? `@${account.username}` : account.id}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

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
            CAP: {effectiveLimit}
            {limitedBy && ` · LIMITED BY ${(PLATFORM_NAMES[limitedBy] ?? limitedBy).toUpperCase()}`}
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
          QUEUED FOR +24H — PFM will publish then
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
          isEmpty || overLimit || noAccountSelected ||
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
