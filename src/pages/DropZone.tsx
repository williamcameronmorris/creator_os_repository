import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBrand } from '../contexts/BrandContext';
import { useAccount } from '../contexts/AccountContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import { mediaRef } from '../lib/mediaUrls';
import {
  ArrowLeft, ArrowRight, Check, Upload, X as XIcon, RefreshCw,
  Instagram, Youtube, Facebook, Twitter, Sparkles, AtSign, Cloud, Globe,
} from 'lucide-react';
import {
  createPostForMePost,
  type PostForMeAccount,
  POSTFORME_PLATFORMS,
} from '../lib/postforme';
import { getAIQuota, formatResetTime, type AIQuotaInfo } from '../lib/aiQuota';
import { useTimezone } from '../hooks/useTimezone';
import { localInputToUtc, utcToLocalInput } from '../lib/timezone';
import {
  fileTooLargeMessage,
  readVideoDuration,
  youtubeContentType,
  YOUTUBE_TITLE_LIMIT,
  MIN_SCHEDULE_LEAD_MINUTES,
  scheduleLeadTimeMessage,
  scheduleCapMessage,
  countScheduledPosts,
} from '../lib/postingRules';

/**
 * DropZone — drop a finished video, Clio preps every platform's post.
 *
 * Flow:
 *   01 DROP      one video (image allowed) into the target
 *   02 CONTEXT   one optional line about it + pick accounts (default: all)
 *   03 PACKAGES  "LET CLIO TAKE OVER" → generate-post-packages returns one
 *                platform-tailored package per platform; rendered as one
 *                editable card PER ACCOUNT (same-platform accounts share the
 *                platform's package initially)
 *   04 SEND      now/schedule + "SEND TO ALL"
 *
 * Publishing fan-out: PFM's createPost takes ONE caption for a set of
 * accounts, but Drop Zone captions DIFFER per account — so we create one PFM
 * post PER ACCOUNT, each with its own caption + the single uploaded media +
 * the same scheduled_at, and mirror one content_posts row per account exactly
 * like ComposePost does. Failed accounts stay retryable on their card.
 */

type CardStatus = 'idle' | 'sending' | 'done' | 'error';

interface MediaItem {
  file: File;
  preview: string;
  kind: 'image' | 'video';
  /** Seconds, once the metadata has been read; null when unreadable. */
  durationSeconds?: number | null;
}

interface PostPackage {
  platform: string;
  caption: string;
  hashtags: string;
  title?: string;
  notes: string;
}

interface AccountCard {
  accountId: string;
  platform: string;
  username: string | null;
  caption: string;
  hashtags: string;
  title: string; // YouTube only; '' elsewhere
  notes: string;
  status: CardStatus;
  error?: string;
  warn?: string;
}

// Caption caps per platform — aligned with what generate-post-packages
// instructs the model to produce. The count is caption + hashtags combined
// (hashtags are appended to the caption on send, and X's 280 is a TOTAL).
const DROP_CAPS: Record<string, number> = {
  instagram: 2200,
  youtube: 5000, // description; the title has its own cap (YOUTUBE_TITLE_LIMIT)
  tiktok: 2200,
  x: 280,
  threads: 500,
  facebook: 2200,
  bluesky: 300,
};
const YT_TITLE_CAP = YOUTUBE_TITLE_LIMIT;

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

const ACCEPT = 'video/mp4,video/quicktime,video/webm,image/*';

/** Combined character load for a card: caption + appended hashtags block. */
function cardCharCount(card: Pick<AccountCard, 'caption' | 'hashtags'>): number {
  const tags = card.hashtags.trim();
  return card.caption.length + (tags ? tags.length + 2 : 0);
}

/** What actually gets sent as the PFM caption (hashtags appended). */
function buildFinalCaption(card: Pick<AccountCard, 'caption' | 'hashtags'>): string {
  const tags = card.hashtags.trim();
  return tags ? `${card.caption.trim()}\n\n${tags}` : card.caption.trim();
}

/** Pull the server's error message out of a FunctionsHttpError, if present. */
async function fnErrorMessage(err: unknown): Promise<string> {
  const anyErr = err as { context?: Response; message?: string };
  try {
    if (anyErr?.context && typeof anyErr.context.json === 'function') {
      const body = await anyErr.context.json();
      if (body?.error) return String(body.error);
    }
  } catch {
    // fall through to the generic message
  }
  return anyErr?.message || 'Something went wrong. Try again.';
}

export function DropZone() {
  const { user } = useAuth();
  const { activeBrand, accountBrandMap } = useBrand();
  // Brand-filtered: only the active brand's accounts are offered, and a brand
  // switch resets the selection below.
  const { accounts: connectedAccounts, loading: loadingAccounts } = useAccount();
  const { tier } = useSubscription();
  const isPremium = tier === 'paid';
  const navigate = useNavigate();
  const { timezone } = useTimezone();

  const fileInputRef = useRef<HTMLInputElement>(null);
  // Synchronous in-flight guard (same rationale as ComposePost): the disabled
  // state only updates after a re-render, so a fast double-tap could otherwise
  // publish to the user's real accounts twice.
  const sendInFlight = useRef(false);
  const genInFlight = useRef(false);
  // The video is uploaded ONCE; every per-account PFM post reuses these URLs
  // (retries included — never re-upload).
  const uploadedUrls = useRef<string[] | null>(null);

  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

  const [media, setMedia] = useState<MediaItem | null>(null);
  const [fileError, setFileError] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [description, setDescription] = useState('');

  const [quota, setQuota] = useState<AIQuotaInfo | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  // Last generated per-platform packages — kept so toggling an account after
  // generation can seed its card without another AI call.
  const [packages, setPackages] = useState<Record<string, PostPackage> | null>(null);
  const [cards, setCards] = useState<AccountCard[]>([]);

  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [scheduleAt, setScheduleAt] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [allSent, setAllSent] = useState(false);

  useEffect(() => {
    if (!user) return;
    getAIQuota(user.id).then(setQuota).catch(() => setQuota(null));
  }, [user]);

  // Default: ALL of the brand's connected accounts checked — Drop Zone's whole
  // point is "everywhere at once". A brand switch changes the account list, so
  // the selection and any generated cards start over for the new brand.
  const accountsKey = connectedAccounts.map((a) => a.id).join(',');
  useEffect(() => {
    setSelectedAccountIds(connectedAccounts.map((a) => a.id));
    setCards([]);
    setPackages(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBrand?.id, accountsKey]);

  useEffect(() => {
    return () => {
      if (media) URL.revokeObjectURL(media.preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedAccounts = connectedAccounts.filter((a) => selectedAccountIds.includes(a.id));
  const selectedPlatforms = [...new Set(selectedAccounts.map((a) => a.platform))];

  const setFile = (file: File) => {
    // The bucket refuses anything over the cap; say so now, not after a long
    // upload fails.
    const tooLarge = fileTooLargeMessage(file);
    if (tooLarge) {
      setFileError(tooLarge);
      return;
    }
    setFileError('');
    if (media) URL.revokeObjectURL(media.preview);
    const kind: 'image' | 'video' = file.type.startsWith('video') ? 'video' : 'image';
    setMedia({ file, preview: URL.createObjectURL(file), kind });
    uploadedUrls.current = null; // a new file must be uploaded fresh
    if (kind === 'video') {
      // Decides Short vs video for YouTube once the metadata is in.
      readVideoDuration(file).then((d) => {
        setMedia((prev) => (prev && prev.file === file ? { ...prev, durationSeconds: d } : prev));
      });
    }
  };

  const onFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const removeMedia = () => {
    if (media) URL.revokeObjectURL(media.preview);
    setMedia(null);
    uploadedUrls.current = null;
  };

  const toggleAccount = (accountId: string) => {
    const nowSelected = !selectedAccountIds.includes(accountId);
    setSelectedAccountIds((prev) =>
      nowSelected ? [...prev, accountId] : prev.filter((id) => id !== accountId),
    );
    // Keep cards in sync once packages exist: unchecking removes the card
    // (edits on other cards are preserved); re-checking seeds a fresh card
    // from that platform's package when we have one.
    if (packages) {
      setCards((prev) => {
        if (!nowSelected) return prev.filter((c) => c.accountId !== accountId);
        if (prev.some((c) => c.accountId === accountId)) return prev;
        const account = connectedAccounts.find((a) => a.id === accountId);
        const pkg = account ? packages[account.platform] : undefined;
        if (!account || !pkg) return prev; // platform wasn't in the last generation — regenerate to include it
        return [...prev, packageToCard(account, pkg)];
      });
    }
  };

  const packageToCard = (account: PostForMeAccount, pkg: PostPackage): AccountCard => ({
    accountId: account.id,
    platform: account.platform,
    username: account.username || null,
    caption: pkg.caption,
    hashtags: pkg.hashtags,
    title: account.platform === 'youtube' ? (pkg.title || '') : '',
    notes: pkg.notes,
    status: 'idle',
  });

  const updateCard = (accountId: string, patch: Partial<AccountCard>) => {
    setCards((prev) => prev.map((c) => (c.accountId === accountId ? { ...c, ...patch } : c)));
  };

  const generate = async () => {
    if (genInFlight.current) return;
    // activeBrand is null until the brand context has loaded; the server
    // refuses a request with no brand rather than guessing one.
    if (!user || !activeBrand || !media || selectedAccounts.length === 0) return;
    genInFlight.current = true;
    setGenerating(true);
    setGenError('');
    setAllSent(false);
    try {
      const { data, error } = await supabase.functions.invoke('generate-post-packages', {
        body: {
          brandId: activeBrand.id,
          description: description.trim() || undefined,
          platforms: selectedPlatforms,
          mediaType: media.kind,
        },
      });
      if (error) throw new Error(await fnErrorMessage(error));
      if (!data?.success || !Array.isArray(data.packages)) {
        throw new Error(data?.error || 'Generation failed. Try again.');
      }
      const byPlatform: Record<string, PostPackage> = {};
      for (const pkg of data.packages as PostPackage[]) byPlatform[pkg.platform] = pkg;
      setPackages(byPlatform);
      // One editable card per selected ACCOUNT — accounts on the same platform
      // start from that platform's package and diverge from there.
      setCards(
        selectedAccounts
          .filter((a) => byPlatform[a.platform])
          .map((a) => packageToCard(a, byPlatform[a.platform])),
      );
    } catch (err) {
      setGenError((err as Error).message);
    } finally {
      genInFlight.current = false;
      setGenerating(false);
      if (user) getAIQuota(user.id).then(setQuota).catch(() => {});
    }
  };

  const uploadOnce = async (): Promise<string[]> => {
    if (uploadedUrls.current) return uploadedUrls.current;
    if (!user || !media) throw new Error('No media to upload.');
    const ext = media.file.name.split('.').pop() || (media.kind === 'video' ? 'mp4' : 'jpg');
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const { data, error } = await supabase.storage
      .from('media')
      .upload(path, media.file, { cacheControl: '3600', upsert: false });
    if (error) throw new Error(`Upload failed: ${error.message}`);
    uploadedUrls.current = [mediaRef(data.path)];
    return uploadedUrls.current;
  };

  /** Send to every card still pending (or a single account when retrying). */
  const sendAll = async (onlyAccountId?: string) => {
    if (sendInFlight.current) return;
    if (!user || !activeBrand || !media || cards.length === 0) return;
    if (mode === 'schedule' && !scheduleAt) {
      setSendError('Pick a date/time to schedule.');
      return;
    }

    sendInFlight.current = true;
    setSending(true);
    setSendError('');

    try {
      // Everything that can refuse the batch is checked BEFORE the upload.
      let scheduledAt: string | undefined;
      let scheduledForRow: string;
      if (mode === 'now') {
        scheduledAt = undefined;
        scheduledForRow = new Date().toISOString();
      } else {
        // Interpret the datetime-local value in the user's profile timezone
        // (same as ComposePost) — new Date(...) would use the browser TZ.
        scheduledAt = localInputToUtc(scheduleAt, timezone);
        scheduledForRow = scheduledAt;
        const tooSoon = scheduleLeadTimeMessage(scheduledAt);
        if (tooSoon) throw new Error(tooSoon);
      }

      const targets = cards.filter(
        (c) => c.status !== 'done' && (!onlyAccountId || c.accountId === onlyAccountId),
      );

      if (mode === 'schedule') {
        const scheduledCount = await countScheduledPosts(user.id, activeBrand.id);
        const capped = scheduleCapMessage(scheduledCount, targets.length, isPremium);
        if (capped) throw new Error(capped);
      }

      const mediaUrls = await uploadOnce();

      for (const card of targets) {
        updateCard(card.accountId, { status: 'sending', error: undefined, warn: undefined });
        try {
          // Never stamp another brand's account with this brand id: refuse
          // before anything reaches Post for Me, so nothing goes live unmirrored.
          if (accountBrandMap.get(card.accountId) !== activeBrand.id) {
            throw new Error(
              `${card.username ? `@${card.username}` : card.platform} is not part of ${activeBrand.name}. Switch brand or move the account under Connections.`,
            );
          }
          const finalCaption = buildFinalCaption(card);
          // One PFM post PER ACCOUNT: captions differ per account, and PFM's
          // createPost takes a single caption for a whole set of accounts.
          const post = await createPostForMePost({
            userId: user.id,
            caption: finalCaption,
            mediaUrls,
            socialAccountIds: [card.accountId],
            scheduledAt,
            // YouTube gets a real title; the caption is its description.
            platformConfigurations:
              card.platform === 'youtube' && card.title.trim()
                ? { youtube: { title: card.title.trim(), description: finalCaption } }
                : undefined,
          });

          // Mirror row — same shape as ComposePost's insert so Office/Schedule/
          // Analytics render it with per-account attribution.
          const { error: insertErr } = await supabase.from('content_posts').insert({
            user_id: user.id,
            brand_id: activeBrand.id,
            platform: card.platform,
            social_account_id: card.accountId,
            account_username: card.username,
            caption: finalCaption,
            title: card.platform === 'youtube' ? card.title.trim() : null,
            media_urls: mediaUrls,
            media_type: media.kind === 'video' ? 'video' : 'image',
            scheduled_date: scheduledForRow,
            scheduled_for: scheduledForRow,
            status: mode === 'now' ? 'publishing' : 'scheduled',
            provider: 'postforme',
            postforme_post_id: post.id,
            content_type: card.platform === 'youtube' ? youtubeContentType(media.durationSeconds) : 'post',
          });

          if (insertErr) {
            // The post IS live/scheduled at PFM — marking this an error would
            // invite a retry that double-publishes. Mark done with a warning.
            updateCard(card.accountId, {
              status: 'done',
              warn: 'Live on the platform, but saving to your dashboard failed — it will appear after the next sync.',
            });
          } else {
            updateCard(card.accountId, { status: 'done' });
          }
        } catch (err) {
          updateCard(card.accountId, { status: 'error', error: (err as Error).message });
        }
      }
    } catch (err) {
      // Upload / schedule-level failure: nothing was sent.
      setSendError((err as Error).message);
    } finally {
      sendInFlight.current = false;
      setSending(false);
      setCards((latest) => {
        if (latest.length > 0 && latest.every((c) => c.status === 'done')) {
          setAllSent(true);
          // Schedule shows what just went out; /office redirects to Patra.
          setTimeout(() => navigate('/schedule'), 1600);
        }
        return latest;
      });
    }
  };

  // ── Derived validation ─────────────────────────────────────────────────────
  const quotaEmpty = quota !== null && quota.requestsRemaining <= 0;
  const canGenerate = !!activeBrand && !!media && selectedAccounts.length > 0 && !generating && !quotaEmpty;
  const minScheduleAt = utcToLocalInput(
    new Date(Date.now() + MIN_SCHEDULE_LEAD_MINUTES * 60_000).toISOString(),
    timezone,
  );

  const cardProblems = cards.some((c) => {
    const cap = DROP_CAPS[c.platform] ?? 2200;
    if (cardCharCount(c) > cap) return true;
    if (c.caption.trim().length === 0) return true;
    if (c.platform === 'youtube' && (c.title.trim().length === 0 || c.title.length > YT_TITLE_CAP)) return true;
    return false;
  });
  const pendingCount = cards.filter((c) => c.status !== 'done').length;
  const canSend =
    cards.length > 0 && pendingCount > 0 && !cardProblems && !sending &&
    !(mode === 'schedule' && !scheduleAt);

  // ── Done screen ────────────────────────────────────────────────────────────
  if (allSent) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
        <div
          className="w-12 h-12 flex items-center justify-center border border-border"
          style={{ color: 'var(--accent)' }}
        >
          <Check className="w-6 h-6" />
        </div>
        <span className="t-micro">
          {mode === 'now' ? 'PUBLISHING EVERYWHERE' : 'SCHEDULED EVERYWHERE'}
        </span>
        <span className="t-micro text-muted-foreground">
          {String(cards.length).padStart(2, '0')} ACCOUNTS
        </span>
      </div>
    );
  }

  // ── Empty state: nothing connected ─────────────────────────────────────────
  if (!loadingAccounts && connectedAccounts.length === 0) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="t-micro mb-2">
          <span className="text-foreground">00</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>DROP ZONE</span>
        </div>
        <h1
          className="text-foreground mb-8"
          style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          Connect your accounts{' '}
          <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>first.</em>
        </h1>
        <p className="t-body mb-8" style={{ maxWidth: '40ch' }}>
          Drop Zone preps a post for every account you've linked. Wire them up, then come back with a video.
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
          <span>DROP ZONE</span>
        </div>
      </div>

      {/* 01 — Drop target */}
      <div className="mb-8">
        <span className="t-micro block mb-2">01 · YOUR VIDEO</span>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          onChange={onFilesPicked}
          className="hidden"
        />
        {!media ? (
          <button
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className="w-full border border-dashed px-4 py-14 flex flex-col items-center gap-3 transition-colors"
            style={{
              borderColor: dragActive ? 'var(--accent)' : 'var(--border)',
              color: dragActive ? 'var(--accent)' : 'var(--muted-foreground)',
              background: dragActive ? 'color-mix(in srgb, var(--accent) 6%, transparent)' : 'transparent',
            }}
          >
            <Upload className="w-6 h-6" />
            <span className="t-micro">DROP YOUR VIDEO</span>
            <span className="t-micro">
              MP4, MOV, WEBM — OR CLICK TO BROWSE. IMAGES WORK TOO.
            </span>
          </button>
        ) : (
          <div className="flex items-start gap-4 border border-border p-3">
            <div className="w-24 aspect-[9/16] border border-border overflow-hidden bg-muted/20 flex-shrink-0">
              {media.kind === 'video' ? (
                <video src={media.preview} className="w-full h-full object-cover" muted playsInline />
              ) : (
                <img src={media.preview} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0 py-1">
              <span className="t-micro block truncate text-foreground">{media.file.name}</span>
              <span className="t-micro text-muted-foreground block mt-1">
                {media.kind.toUpperCase()} · {(media.file.size / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
            <button
              onClick={removeMedia}
              className="w-7 h-7 border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              aria-label="Remove media"
            >
              <XIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {fileError && (
          <p className="t-micro mt-2" style={{ color: 'var(--destructive)' }}>
            {fileError}
          </p>
        )}
      </div>

      {/* 02 — One line + accounts */}
      <div className="mb-2">
        <span className="t-micro block mb-2">02 · WHAT'S THIS ONE ABOUT?</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="One line — optional. Clio fills the gaps."
          className="w-full bg-transparent border border-border px-3 py-3 text-foreground outline-none focus:border-accent transition-colors placeholder:text-muted-foreground"
          style={{ fontSize: '0.95rem', letterSpacing: '-0.01em' }}
        />
      </div>

      <div className="mb-2 mt-6">
        <span className="t-micro">ACCOUNTS · {String(selectedAccountIds.length).padStart(2, '0')}</span>
      </div>
      <div className="border border-border mb-8">
        {POSTFORME_PLATFORMS.map((p) => {
          const platformAccounts = connectedAccounts.filter((a) => a.platform === p.id);
          if (platformAccounts.length === 0) return null;
          const Icon = PLATFORM_ICONS[p.id] ?? Globe;
          return (
            <div key={p.id} className="border-b border-border last:border-b-0">
              <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="t-micro text-muted-foreground">
                  {p.name.toUpperCase()} · {String(platformAccounts.length).padStart(2, '0')}
                </span>
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
                      className="font-mono text-[12px] uppercase tracking-widest truncate"
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

      {/* 03 — Let Clio take over */}
      <div className="mb-8">
        {genError && (
          <p className="t-micro mb-3" style={{ color: 'var(--destructive)' }}>
            {genError}
          </p>
        )}
        <button
          onClick={generate}
          disabled={!canGenerate}
          className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <span className="btn-ie-text inline-flex items-center gap-2">
            {generating && <RefreshCw className="w-3 h-3 animate-spin" />}
            {generating
              ? 'Clio is working…'
              : cards.length > 0
              ? 'Regenerate all'
              : 'Let Clio take over'}
          </span>
          {!generating && <ArrowRight className="w-3 h-3" />}
        </button>
        <div className="flex justify-between mt-2">
          <span className="t-micro text-muted-foreground">
            ONE AI CREDIT PREPS EVERY PLATFORM
          </span>
          {quota && (
            <span
              className="t-micro"
              style={{ color: quotaEmpty ? 'var(--destructive)' : 'var(--muted-foreground)' }}
            >
              {quotaEmpty
                ? `NO CREDITS LEFT · ${formatResetTime(quota.resetAt).toUpperCase()}`
                : `${String(quota.requestsRemaining).padStart(2, '0')} / ${String(quota.dailyLimit).padStart(2, '0')} CREDITS TODAY`}
            </span>
          )}
        </div>
      </div>

      {/* 04 — Preview cards */}
      {cards.length > 0 && (
        <>
          <div className="mb-2">
            <span className="t-micro">
              03 · YOUR POSTS · {String(cards.length).padStart(2, '0')}
            </span>
          </div>
          <div className="flex flex-col gap-4 mb-8">
            {cards.map((card) => {
              const Icon = PLATFORM_ICONS[card.platform] ?? Globe;
              const cap = DROP_CAPS[card.platform] ?? 2200;
              const count = cardCharCount(card);
              const over = count > cap;
              const titleOver = card.title.length > YT_TITLE_CAP;
              return (
                <div key={card.accountId} className="bg-card border border-border">
                  {/* Card header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                      <span className="t-micro text-muted-foreground">
                        {(PLATFORM_NAMES[card.platform] ?? card.platform).toUpperCase()}
                      </span>
                      <span className="font-mono text-[12px] uppercase tracking-widest truncate text-foreground">
                        {card.username ? `@${card.username}` : card.accountId}
                      </span>
                    </div>
                    {card.status === 'done' && (
                      <span className="t-micro flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--accent)' }}>
                        <Check className="w-3 h-3" /> SENT
                      </span>
                    )}
                    {card.status === 'sending' && (
                      <span className="t-micro flex items-center gap-1 flex-shrink-0 text-muted-foreground">
                        <RefreshCw className="w-3 h-3 animate-spin" /> SENDING
                      </span>
                    )}
                    {card.status === 'error' && (
                      <span className="t-micro flex-shrink-0" style={{ color: 'var(--destructive)' }}>
                        FAILED
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    {/* YouTube title */}
                    {card.platform === 'youtube' && (
                      <div className="mb-4">
                        <div className="flex justify-between mb-1">
                          <span className="t-micro text-muted-foreground">TITLE</span>
                          <span
                            className="font-mono text-[12px]"
                            style={{ color: titleOver ? 'var(--destructive)' : 'var(--muted-foreground)' }}
                          >
                            {card.title.length}/{YT_TITLE_CAP}
                          </span>
                        </div>
                        <input
                          type="text"
                          value={card.title}
                          disabled={card.status === 'done' || card.status === 'sending'}
                          onChange={(e) => updateCard(card.accountId, { title: e.target.value })}
                          className="w-full bg-transparent border px-3 py-2 text-foreground outline-none transition-colors disabled:opacity-60"
                          style={{
                            borderColor: titleOver ? 'var(--destructive)' : 'var(--border)',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                          }}
                        />
                      </div>
                    )}

                    {/* Caption */}
                    <div className="flex justify-between mb-1">
                      <span className="t-micro text-muted-foreground">
                        {card.platform === 'youtube' ? 'DESCRIPTION' : 'CAPTION'}
                      </span>
                      <span
                        className="font-mono text-[12px]"
                        style={{ color: over ? 'var(--destructive)' : 'var(--muted-foreground)' }}
                      >
                        {count}/{cap}
                      </span>
                    </div>
                    <textarea
                      value={card.caption}
                      disabled={card.status === 'done' || card.status === 'sending'}
                      onChange={(e) => updateCard(card.accountId, { caption: e.target.value })}
                      rows={card.platform === 'x' || card.platform === 'bluesky' ? 3 : 5}
                      className="w-full bg-transparent border resize-none outline-none px-3 py-2 text-foreground transition-colors disabled:opacity-60"
                      style={{
                        borderColor: over ? 'var(--destructive)' : 'var(--border)',
                        fontSize: '0.9rem',
                        lineHeight: 1.55,
                      }}
                    />
                    {over && (
                      <p className="t-micro mt-1" style={{ color: 'var(--destructive)' }}>
                        OVER {(PLATFORM_NAMES[card.platform] ?? card.platform).toUpperCase()}'S {cap}-CHAR LIMIT (CAPTION + HASHTAGS)
                      </p>
                    )}

                    {/* Hashtags */}
                    {card.platform !== 'x' && card.platform !== 'threads' && (
                      <div className="mt-3">
                        <span className="t-micro text-muted-foreground block mb-1">HASHTAGS</span>
                        <input
                          type="text"
                          value={card.hashtags}
                          disabled={card.status === 'done' || card.status === 'sending'}
                          onChange={(e) => updateCard(card.accountId, { hashtags: e.target.value })}
                          placeholder="#one #two #three"
                          className="w-full bg-transparent border border-border px-3 py-2 font-mono text-[12px] text-foreground outline-none focus:border-accent transition-colors disabled:opacity-60"
                        />
                      </div>
                    )}

                    {/* Why this fits */}
                    {card.notes && (
                      <p className="t-body text-muted-foreground mt-3" style={{ fontSize: '0.8rem' }}>
                        {card.notes}
                      </p>
                    )}

                    {/* Per-account failure — stays retryable */}
                    {card.status === 'error' && (
                      <div className="mt-3 border px-3 py-2" style={{ borderColor: 'var(--destructive)' }}>
                        <p className="t-micro mb-2" style={{ color: 'var(--destructive)' }}>
                          {card.error || 'Sending failed.'}
                        </p>
                        <button
                          onClick={() => sendAll(card.accountId)}
                          disabled={sending}
                          className="btn-ie disabled:opacity-40"
                          style={{ padding: '0.35rem 1rem' }}
                        >
                          <span className="btn-ie-text">Retry this account</span>
                        </button>
                      </div>
                    )}
                    {card.warn && (
                      <p className="t-micro mt-3" style={{ color: 'var(--destructive)' }}>
                        {card.warn}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 05 — When + send */}
          <div className="mb-6">
            <span className="t-micro block mb-2">04 · WHEN</span>
            <div className="flex gap-2 flex-wrap">
              {(['now', 'schedule'] as const).map((m) => {
                const active = mode === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className="font-mono text-[12px] font-medium uppercase tracking-widest px-3 py-2 border transition-colors"
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

          {mode === 'schedule' && (
            <div className="mb-6">
              <label className="t-micro block mb-2">SCHEDULE FOR</label>
              <input
                type="datetime-local"
                value={scheduleAt}
                min={minScheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="w-full bg-transparent border border-border px-3 py-2 font-mono text-sm text-foreground outline-none focus:border-accent transition-colors"
              />
            </div>
          )}

          {sendError && (
            <p className="t-micro mb-4" style={{ color: 'var(--destructive)' }}>
              {sendError}
            </p>
          )}

          <button
            onClick={() => sendAll()}
            disabled={!canSend}
            className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span className="btn-ie-text">
              {sending
                ? 'Sending…'
                : pendingCount < cards.length
                ? `Send remaining · ${String(pendingCount).padStart(2, '0')}`
                : `Send to all · ${String(cards.length).padStart(2, '0')}`}
            </span>
            {!sending && <ArrowRight className="w-3 h-3" />}
          </button>
        </>
      )}

    </div>
  );
}
