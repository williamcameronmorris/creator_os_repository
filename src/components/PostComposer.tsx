import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  X, Instagram, Youtube, Video, Calendar, Upload,
  Sparkles, ArrowLeft, AlertCircle, Crop, Eye, EyeOff, Zap
} from 'lucide-react';
import { ImageCropper } from './ImageCropper';
import { PostPreview } from './PostPreview';
import { useTimezone } from '../hooks/useTimezone';
import { utcToLocalInput, localInputToUtc, nowAsLocalInput } from '../lib/timezone';

interface PostComposerProps {
  onClose: () => void;
  onSuccess: () => void;
  asPage?: boolean;
  editPost?: {
    id: string;
    platform: string;
    caption: string;
    media_urls: string[];
    scheduled_date: string | null;
    status: string;
  };
}

type Platform = 'instagram' | 'tiktok' | 'youtube';

const PLATFORM_ICONS = {
  instagram: Instagram,
  tiktok: Sparkles,
  youtube: Youtube,
};

const PLATFORM_LIMITS = {
  instagram: { caption: 2200, media: 10 },
  tiktok:    { caption: 2200, media: 1  },
  youtube:   { caption: 5000, media: 1  },
};

/** Minimum minutes in the future a scheduled post must be */
const MIN_SCHEDULE_MINUTES = 20;

function getUploadError(error: any, fileName: string): string {
  const msg = error?.message || '';
  if (msg.includes('Payload too large') || msg.includes('413'))
    return `"${fileName}" is too large. Max file size is 50MB.`;
  if (msg.includes('mime') || msg.includes('type'))
    return `"${fileName}" is not a supported file type.`;
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Connection error. Check your internet and try again.';
  return `Failed to upload "${fileName}". ${msg || 'Please try again.'}`;
}

function getSaveError(error: any): string {
  const msg  = error?.message || '';
  const code = error?.code    || '';
  if (code === '23502') return 'Required fields are missing. Please fill in all required fields.';
  if (code === '23503') return 'Invalid reference. Please reload and try again.';
  if (code === '42501' || msg.includes('permission'))
    return 'Permission denied. Please log out and log back in.';
  if (msg.includes('network') || msg.includes('fetch'))
    return 'Connection error. Check your internet and try again.';
  if (msg) return msg;
  return 'Failed to save post. Please try again.';
}

/** Generate a thumbnail data-URL from the first frame of a video File */
function generateVideoThumbnail(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url    = URL.createObjectURL(file);
    const video  = document.createElement('video');
    video.preload    = 'metadata';
    video.muted      = true;
    video.playsInline = true;
    video.src = url;
    video.addEventListener('loadeddata', () => { video.currentTime = 0; });
    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth  || 320;
      canvas.height = video.videoHeight || 240;
      const ctx = canvas.getContext('2d');
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no ctx')); return; }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    });
    video.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('video load error')); });
  });
}

/**
 * Returns true if the datetime-local string is at least MIN_SCHEDULE_MINUTES
 * from now (in the user's local time).
 */
function isScheduleDateValid(localDatetimeValue: string): boolean {
  if (!localDatetimeValue) return false;
  const selected = new Date(localDatetimeValue).getTime();
  const minAllowed = Date.now() + MIN_SCHEDULE_MINUTES * 60 * 1000;
  return selected >= minAllowed;
}

export function PostComposer({ onClose, onSuccess, asPage = false, editPost }: PostComposerProps) {
  const { user } = useAuth();
  const { timezone } = useTimezone();

  // ── Multi-platform selection ──────────────────────────────────────────────
  const [platforms, setPlatforms] = useState<Set<Platform>>(() => {
    if (editPost?.platform) {
      const saved = editPost.platform.split(',').map(s => s.trim()) as Platform[];
      return new Set(saved.filter(p => p in PLATFORM_ICONS));
    }
    return new Set<Platform>(['instagram']);
  });

  const primaryPlatform: Platform = (['instagram', 'tiktok', 'youtube'] as Platform[])
    .find(p => platforms.has(p)) ?? 'instagram';

  const [previewPlatform, setPreviewPlatform] = useState<Platform>(primaryPlatform);

  const togglePlatform = (p: Platform) => {
    setPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(p)) {
        if (next.size > 1) next.delete(p);
      } else {
        next.add(p);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!platforms.has(previewPlatform)) setPreviewPlatform(primaryPlatform);
  }, [platforms, previewPlatform, primaryPlatform]);

  const [caption,       setCaption]       = useState(editPost?.caption || '');
  const [scheduledDate, setScheduledDate] = useState(
    editPost?.scheduled_date ? utcToLocalInput(editPost.scheduled_date, timezone) : ''
  );
  const [mediaFiles,      setMediaFiles]      = useState<File[]>([]);
  const [mediaUrls,       setMediaUrls]       = useState<string[]>(editPost?.media_urls || []);
  const [videoThumbs,     setVideoThumbs]     = useState<Record<number, string>>({});
  const [uploading,       setUploading]       = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [publishingNow,   setPublishingNow]   = useState(false);
  const [errorMessage,    setErrorMessage]    = useState<string | null>(null);
  const [cropperFile,     setCropperFile]     = useState<File | null>(null);
  const [showPreview,     setShowPreview]     = useState(false);
  const [autosaveStatus,  setAutosaveStatus]  = useState<'idle' | 'saved'>('idle');
  const [abEnabled,       setAbEnabled]       = useState(false);
  const [scheduledDateB,  setScheduledDateB]  = useState('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Autosave draft ────────────────────────────────────────────────────────
  const DRAFT_KEY = editPost ? `draft_edit_${editPost.id}` : `draft_new_${user?.id}`;

  useEffect(() => {
    if (editPost) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.caption      && !caption) setCaption(parsed.caption);
        if (parsed.platforms)                setPlatforms(new Set(parsed.platforms as Platform[]));
        if (parsed.scheduledDate)            setScheduledDate(parsed.scheduledDate);
      }
    } catch (_) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editPost) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ caption, platforms: Array.from(platforms), scheduledDate }));
        setAutosaveStatus('saved');
        setTimeout(() => setAutosaveStatus('idle'), 2000);
      } catch (_) {}
    }, 1000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [caption, platforms, scheduledDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearDraft = () => { try { localStorage.removeItem(DRAFT_KEY); } catch (_) {} };

  // ── Limits ────────────────────────────────────────────────────────────────
  const lowestCaptionLimit = Math.min(...Array.from(platforms).map(p => PLATFORM_LIMITS[p].caption));
  const lowestMediaLimit   = Math.min(...Array.from(platforms).map(p => PLATFORM_LIMITS[p].media));
  const charactersRemaining = lowestCaptionLimit - caption.length;

  // ── Schedule date validation ──────────────────────────────────────────────
  const scheduleDateTooSoon = scheduledDate !== '' && !isScheduleDateValid(scheduledDate);

  // Compute the minimum allowed datetime-local string for the input's min= attribute
  const minScheduleDatetime = (() => {
    const d = new Date(Date.now() + MIN_SCHEDULE_MINUTES * 60 * 1000);
    // Format as YYYY-MM-DDTHH:MM (datetime-local format)
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  // ── Video thumbnails ──────────────────────────────────────────────────────
  useEffect(() => {
    mediaFiles.forEach((file, index) => {
      if (file.type.startsWith('video/') && !videoThumbs[index]) {
        generateVideoThumbnail(file)
          .then(thumb => setVideoThumbs(prev => ({ ...prev, [index]: thumb })))
          .catch(() => {});
      }
    });
  }, [mediaFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Media handlers ────────────────────────────────────────────────────────
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (mediaFiles.length + mediaUrls.length + files.length > lowestMediaLimit) {
      setErrorMessage(`Selected platforms only allow ${lowestMediaLimit} media file(s)`);
      return;
    }
    setErrorMessage(null);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    const otherFiles = files.filter(f => !f.type.startsWith('image/'));
    if (otherFiles.length > 0) setMediaFiles(prev => [...prev, ...otherFiles]);
    if (imageFiles.length > 0) {
      setCropperFile(imageFiles[0]);
      if (imageFiles.length > 1) setMediaFiles(prev => [...prev, ...imageFiles.slice(1)]);
    }
  };

  const handleCropDone   = (croppedFile: File) => { setMediaFiles(prev => [...prev, croppedFile]); setCropperFile(null); };
  const handleCropCancel = () => setCropperFile(null);

  const removeMedia = (index: number, isUrl: boolean) => {
    if (isUrl) {
      setMediaUrls(mediaUrls.filter((_, i) => i !== index));
    } else {
      setMediaFiles(mediaFiles.filter((_, i) => i !== index));
      setVideoThumbs(prev => {
        const next: Record<number, string> = {};
        Object.entries(prev).forEach(([k, v]) => {
          const ki = Number(k);
          if (ki < index)  next[ki]     = v;
          if (ki > index)  next[ki - 1] = v;
        });
        return next;
      });
    }
  };

  // ── Upload media ──────────────────────────────────────────────────────────
  const uploadMedia = async (): Promise<string[]> => {
    if (!user || mediaFiles.length === 0) return [];
    const uploadedUrls: string[] = [];
    for (const file of mediaFiles) {
      const fileExt  = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, file, { cacheControl: '3600', upsert: false });
      if (error) throw new Error(getUploadError(error, file.name));
      const { data: { publicUrl } } = supabase.storage.from('media').getPublicUrl(data.path);
      uploadedUrls.push(publicUrl);
      await supabase.from('media_library').insert({
        user_id:   user.id,
        file_name: file.name,
        file_url:  publicUrl,
        file_type: file.type.startsWith('video') ? 'video' : 'image',
        file_size: file.size,
      });
    }
    return uploadedUrls;
  };

  // ── Save (draft or scheduled) ─────────────────────────────────────────────
  const handleSave = async (status: 'draft' | 'scheduled') => {
    if (!user) return;
    setErrorMessage(null);
    if (!caption.trim()) { setErrorMessage('Please add a caption before saving.'); return; }
    if (status === 'scheduled') {
      if (!scheduledDate) { setErrorMessage('Please select a date and time to schedule this post.'); return; }
      if (!isScheduleDateValid(scheduledDate)) {
        setErrorMessage(`Posts must be scheduled at least ${MIN_SCHEDULE_MINUTES} minutes from now. Use "Publish Now" to post immediately.`);
        return;
      }
    }
    if (status === 'scheduled' && abEnabled && !scheduledDateB) {
      setErrorMessage('Please select an alternate time for Version B, or disable A/B testing.');
      return;
    }
    setSaving(true);
    setUploading(mediaFiles.length > 0);
    try {
      const newMediaUrls = await uploadMedia();
      const allMediaUrls = [...mediaUrls, ...newMediaUrls];
      const platformArray = Array.from(platforms);

      for (const p of platformArray) {
        const basePost = {
          user_id:    user.id,
          platform:   p,
          caption:    caption.trim(),
          media_url:  allMediaUrls[0] || null,
          media_urls: allMediaUrls,
          status,
        };

        if (status === 'scheduled' && abEnabled && scheduledDateB && !editPost) {
          const pairId = crypto.randomUUID();
          const { error } = await supabase.from('content_posts').insert([
            { ...basePost, scheduled_date: localInputToUtc(scheduledDate,  timezone), scheduled_for: localInputToUtc(scheduledDate,  timezone), ab_test_group: 'A', ab_pair_id: pairId },
            { ...basePost, scheduled_date: localInputToUtc(scheduledDateB, timezone), scheduled_for: localInputToUtc(scheduledDateB, timezone), ab_test_group: 'B', ab_pair_id: pairId },
          ]);
          if (error) throw error;
        } else {
          const postData = {
            ...basePost,
            scheduled_date: status === 'scheduled' ? localInputToUtc(scheduledDate, timezone) : null,
            scheduled_for:  status === 'scheduled' ? localInputToUtc(scheduledDate, timezone) : null,
          };
          if (editPost) {
            const { error } = await supabase.from('content_posts').update(postData).eq('id', editPost.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('content_posts').insert([postData]);
            if (error) throw error;
          }
        }
      }

      clearDraft();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error saving post:', error);
      setErrorMessage(error.message || getSaveError(error));
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  // ── Publish Now ───────────────────────────────────────────────────────────
  // Inserts the post with scheduled_for = now and immediately triggers the
  // publish-scheduled-posts edge function to dispatch it.
  const handlePublishNow = async () => {
    if (!user) return;
    setErrorMessage(null);
    if (!caption.trim()) { setErrorMessage('Please add a caption before publishing.'); return; }
    setPublishingNow(true);
    setUploading(mediaFiles.length > 0);
    try {
      const newMediaUrls = await uploadMedia();
      const allMediaUrls = [...mediaUrls, ...newMediaUrls];
      const platformArray = Array.from(platforms);
      const nowUtc = new Date().toISOString();

      // Insert one row per platform, all scheduled for right now
      const rows = platformArray.map(p => ({
        user_id:        user.id,
        platform:       p,
        caption:        caption.trim(),
        media_url:      allMediaUrls[0] || null,
        media_urls:     allMediaUrls,
        status:         'scheduled' as const,
        scheduled_date: nowUtc,
        scheduled_for:  nowUtc,
      }));

      const { error: insertError } = await supabase.from('content_posts').insert(rows);
      if (insertError) throw insertError;

      // Immediately invoke the scheduler so it doesn't wait for the next cron tick
      const { error: invokeError } = await supabase.functions.invoke('publish-scheduled-posts');
      if (invokeError) {
        // Non-fatal — the cron will pick it up within the next minute
        console.warn('Could not invoke publish-scheduled-posts immediately:', invokeError.message);
      }

      clearDraft();
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error publishing now:', error);
      setErrorMessage(error.message || getSaveError(error));
    } finally {
      setPublishingNow(false);
      setUploading(false);
    }
  };

  // ── Username for preview ──────────────────────────────────────────────────
  const displayUsername: string = (() => {
    const meta = (user as any)?.user_metadata;
    return meta?.username || meta?.full_name || user?.email?.split('@')[0] || 'your_account';
  })();

  // ── Form content ──────────────────────────────────────────────────────────
  const formContent = (
    <>
      {/* Platform — multi-select */}
      <div>
        <label className="block text-sm font-medium mb-3 text-foreground">Platform</label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(PLATFORM_ICONS) as Platform[]).map((p) => {
            const Icon       = PLATFORM_ICONS[p];
            const isSelected = platforms.has(p);
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`p-4 rounded-xl border-2 transition-all relative ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-2 right-2 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
                <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium capitalize ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {p}
                </span>
              </button>
            );
          })}
        </div>
        {platforms.size > 1 && (
          <p className="text-xs text-muted-foreground mt-2">
            {platforms.size} platforms selected — one post will be created per platform
          </p>
        )}
      </div>

      {/* Caption */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-foreground">Caption</label>
          <span className={`text-sm ${
            charactersRemaining < 0   ? 'text-red-500'    :
            charactersRemaining < 100 ? 'text-orange-500' : 'text-muted-foreground'
          }`}>
            {charactersRemaining} characters remaining
          </span>
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Write your caption here... Include @mentions"
          rows={6}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        />
      </div>

      {/* Media */}
      <div>
        <label className="block text-sm font-medium mb-3 text-foreground">
          Media ({mediaFiles.length + mediaUrls.length}/{lowestMediaLimit})
        </label>
        <div className="space-y-3">
          {(mediaUrls.length + mediaFiles.length < lowestMediaLimit) && (
            <label className="flex items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent cursor-pointer transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Click to upload or drag and drop
              </span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple={lowestMediaLimit > 1}
                onChange={handleMediaChange}
                className="hidden"
              />
            </label>
          )}
          {(mediaUrls.length > 0 || mediaFiles.length > 0) && (
            <div className="grid grid-cols-2 gap-3">
              {mediaUrls.map((url, index) => (
                <div key={`url-${index}`} className="relative aspect-square rounded-xl overflow-hidden group border border-border">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeMedia(index, true)}
                    className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {mediaFiles.map((file, index) => (
                <div key={`file-${index}`} className="relative aspect-square rounded-xl overflow-hidden group border border-border">
                  {file.type.startsWith('video/') ? (
                    videoThumbs[index] ? (
                      <div className="relative w-full h-full">
                        <img src={videoThumbs[index]} alt="Video thumbnail" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white ml-0.5" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M5 3.5l8 4.5-8 4.5V3.5z"/>
                            </svg>
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Video className="w-2.5 h-2.5" />
                          Video
                        </div>
                      </div>
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center animate-pulse">
                        <Video className="w-12 h-12 text-white/40" />
                      </div>
                    )
                  ) : (
                    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    {file.type.startsWith('image/') && (
                      <button
                        onClick={() => setCropperFile(file)}
                        className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-lg shadow-lg"
                        title="Crop"
                      >
                        <Crop className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => removeMedia(index, false)}
                      className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Schedule (Optional)
          </div>
        </label>
        <div className="space-y-1.5">
          <input
            type="datetime-local"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            min={minScheduleDatetime}
            className={`w-full px-4 py-3 rounded-xl border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${
              scheduleDateTooSoon ? 'border-orange-400 bg-orange-50/10' : 'border-border'
            }`}
          />
          {scheduleDateTooSoon && (
            <div className="flex items-center gap-2 text-orange-500 text-xs font-medium px-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              Must be at least {MIN_SCHEDULE_MINUTES} minutes from now. Use "Publish Now" to post immediately.
            </div>
          )}
        </div>

        {/* A/B test toggle */}
        {!editPost && scheduledDate && !scheduleDateTooSoon && (
          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={abEnabled}
                  onChange={(e) => setAbEnabled(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-10 h-5 rounded-full transition-colors ${abEnabled ? 'bg-primary' : 'bg-border'}`} />
                <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${abEnabled ? 'translate-x-5' : ''}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">A/B Time Test</p>
                <p className="text-xs text-muted-foreground">Post to two time slots and compare performance after 7 days</p>
              </div>
            </label>
            {abEnabled && (
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                  Version B — Alternate time slot
                </label>
                <input
                  type="datetime-local"
                  value={scheduledDateB}
                  onChange={(e) => setScheduledDateB(e.target.value)}
                  min={minScheduleDatetime}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Autosave indicator */}
      {!editPost && autosaveStatus === 'saved' && (
        <p className="text-xs text-emerald-600 text-right">Draft autosaved</p>
      )}

      {/* Post preview toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowPreview(v => !v)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPreview ? 'Hide Preview' : 'Preview Post'}
        </button>
        {showPreview && (
          <div className="mt-4">
            {platforms.size > 1 && (
              <div className="flex gap-2 mb-3">
                {(Object.keys(PLATFORM_ICONS) as Platform[])
                  .filter(p => platforms.has(p))
                  .map(p => {
                    const Icon = PLATFORM_ICONS[p];
                    return (
                      <button
                        key={p}
                        onClick={() => setPreviewPlatform(p)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          previewPlatform === p
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span className="capitalize">{p}</span>
                      </button>
                    );
                  })}
              </div>
            )}
            <PostPreview
              platform={previewPlatform}
              caption={caption}
              mediaUrls={mediaUrls}
              mediaFiles={mediaFiles}
              username={displayUsername}
            />
          </div>
        )}
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm font-medium">{errorMessage}</p>
        </div>
      )}
    </>
  );

  const isWorking = saving || uploading || publishingNow;

  const actionButtons = (
    <div className="flex items-center justify-end gap-3 flex-wrap">
      {/* Save Draft */}
      <button
        onClick={() => handleSave('draft')}
        disabled={isWorking || !caption.trim()}
        className="px-6 py-3 rounded-xl font-medium bg-accent hover:bg-accent/80 text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {saving && !uploading ? 'Saving...' : 'Save Draft'}
      </button>

      {/* Publish Now */}
      <button
        onClick={handlePublishNow}
        disabled={isWorking || !caption.trim()}
        className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-emerald-600 hover:bg-emerald-700 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        <Zap className="w-4 h-4" />
        {publishingNow ? (uploading ? 'Uploading...' : 'Publishing...') : 'Publish Now'}
      </button>

      {/* Schedule Post */}
      <button
        onClick={() => handleSave('scheduled')}
        disabled={isWorking || !caption.trim() || !scheduledDate || scheduleDateTooSoon}
        className="px-6 py-3 rounded-xl font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        {uploading ? 'Uploading...' : saving ? 'Scheduling...' : 'Schedule Post'}
      </button>
    </div>
  );

  const cropperOverlay = cropperFile ? (
    <ImageCropper
      file={cropperFile}
      platform={primaryPlatform}
      onCrop={handleCropDone}
      onCancel={handleCropCancel}
    />
  ) : null;

  // ── Full-page layout ──────────────────────────────────────────────────────
  if (asPage) {
    return (
      <>
        {cropperOverlay}
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-4 mb-8">
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-accent">
              <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
            <h1 className="text-3xl font-bold text-foreground">
              {editPost ? 'Edit Post' : 'Create New Post'}
            </h1>
          </div>
          <div className="space-y-6">{formContent}</div>
          <div className="mt-8 pt-6 border-t border-border">{actionButtons}</div>
        </div>
      </>
    );
  }

  // ── Modal layout ──────────────────────────────────────────────────────────
  return (
    <>
      {cropperOverlay}
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <h2 className="text-2xl font-bold text-foreground">
              {editPost ? 'Edit Post' : 'Create New Post'}
            </h2>
            <button onClick={onClose} className="p-2 rounded-lg transition-colors hover:bg-accent">
              <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6 space-y-6">
            {formContent}
          </div>
          <div className="p-6 border-t border-border">
            {actionButtons}
          </div>
        </div>
      </div>
    </>
  );
}
