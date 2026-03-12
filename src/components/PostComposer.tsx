import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Instagram, Youtube, Video, Calendar, Upload, Sparkles, ArrowLeft, AlertCircle, Crop, Eye, EyeOff } from 'lucide-react';
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
  tiktok: { caption: 2200, media: 1 },
  youtube: { caption: 5000, media: 1 },
};

function getUploadError(error: any, fileName: string): string {
  const msg = error?.message || '';
  if (msg.includes('Payload too large') || msg.includes('413')) {
    return `"${fileName}" is too large. Max file size is 50MB.`;
  }
  if (msg.includes('mime') || msg.includes('type')) {
    return `"${fileName}" is not a supported file type.`;
  }
  if (msg.includes('network') || msg.includes('fetch')) {
    return 'Connection error. Check your internet and try again.';
  }
  return `Failed to upload "${fileName}". ${msg || 'Please try again.'}`;
}

function getSaveError(error: any): string {
  const msg = error?.message || '';
  const code = error?.code || '';
  if (code === '23502') return 'Required fields are missing. Please fill in all required fields.';
  if (code === '23503') return 'Invalid reference. Please reload and try again.';
  if (code === '42501' || msg.includes('permission')) return 'Permission denied. Please log out and log back in.';
  if (msg.includes('network') || msg.includes('fetch')) return 'Connection error. Check your internet and try again.';
  if (msg) return msg;
  return 'Failed to save post. Please try again.';
}

export function PostComposer({ onClose, onSuccess, asPage = false, editPost }: PostComposerProps) {
  const { user } = useAuth();
  const { timezone } = useTimezone();

  const [platform, setPlatform] = useState<Platform>(editPost?.platform as Platform || 'instagram');
  const [caption, setCaption] = useState(editPost?.caption || '');
  const [scheduledDate, setScheduledDate] = useState(
    // Convert stored UTC to local datetime-local value in the user's timezone
    editPost?.scheduled_date ? utcToLocalInput(editPost.scheduled_date, timezone) : ''
  );
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>(editPost?.media_urls || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cropperFile, setCropperFile] = useState<File | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saved'>('idle');
  const [abEnabled, setAbEnabled] = useState(false);
  const [scheduledDateB, setScheduledDateB] = useState('');
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Autosave draft to localStorage ──────────────────────────────────────────
  const DRAFT_KEY = editPost ? `draft_edit_${editPost.id}` : `draft_new_${user?.id}`;

  // Restore draft on mount (only for new posts, not edits)
  useEffect(() => {
    if (editPost) return; // don't overwrite edit form with stale draft
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.caption && !caption) setCaption(parsed.caption);
        if (parsed.platform) setPlatform(parsed.platform as Platform);
        if (parsed.scheduledDate) setScheduledDate(parsed.scheduledDate);
      }
    } catch (_) { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced autosave whenever caption/platform/scheduledDate changes
  useEffect(() => {
    if (editPost) return; // only autosave new posts
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ caption, platform, scheduledDate }));
        setAutosaveStatus('saved');
        setTimeout(() => setAutosaveStatus('idle'), 2000);
      } catch (_) { /* ignore */ }
    }, 1000);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [caption, platform, scheduledDate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear draft on successful save
  const clearDraft = () => {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) { /* ignore */ }
  };

  const limits = PLATFORM_LIMITS[platform];
  const charactersRemaining = limits.caption - caption.length;

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (mediaFiles.length + mediaUrls.length + files.length > limits.media) {
      setErrorMessage(`${platform} only allows ${limits.media} media file(s)`);
      return;
    }
    setErrorMessage(null);
    // Open cropper for the first image file; add others directly
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    const otherFiles = files.filter((f) => !f.type.startsWith('image/'));
    if (otherFiles.length > 0) {
      setMediaFiles((prev) => [...prev, ...otherFiles]);
    }
    if (imageFiles.length > 0) {
      // Queue the first image for cropping; remaining added after
      setCropperFile(imageFiles[0]);
      // Store the rest as pending — handled by adding after crop
      if (imageFiles.length > 1) {
        setMediaFiles((prev) => [...prev, ...imageFiles.slice(1)]);
      }
    }
  };

  const handleCropDone = (croppedFile: File) => {
    setMediaFiles((prev) => [...prev, croppedFile]);
    setCropperFile(null);
  };

  const handleCropCancel = () => {
    setCropperFile(null);
  };

  const removeMedia = (index: number, isUrl: boolean) => {
    if (isUrl) {
      setMediaUrls(mediaUrls.filter((_, i) => i !== index));
    } else {
      setMediaFiles(mediaFiles.filter((_, i) => i !== index));
    }
  };

  const uploadMedia = async (): Promise<string[]> => {
    if (!user || mediaFiles.length === 0) return [];

    const uploadedUrls: string[] = [];

    for (const file of mediaFiles) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { data, error } = await supabase.storage
        .from('media')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) {
        console.error('Upload error:', error);
        throw new Error(getUploadError(error, file.name));
      }

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(data.path);

      uploadedUrls.push(publicUrl);

      await supabase.from('media_library').insert({
        user_id: user.id,
        file_name: file.name,
        file_url: publicUrl,
        file_type: file.type.startsWith('video') ? 'video' : 'image',
        file_size: file.size,
      });
    }

    return uploadedUrls;
  };

  const handleSave = async (status: 'draft' | 'scheduled') => {
    if (!user) return;
    setErrorMessage(null);

    if (!caption.trim()) {
      setErrorMessage('Please add a caption before saving.');
      return;
    }
    if (status === 'scheduled' && !scheduledDate) {
      setErrorMessage('Please select a date and time to schedule this post.');
      return;
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

      const basePost = {
        user_id: user.id,
        platform,
        caption: caption.trim(),
        media_url: allMediaUrls[0] || null,
        media_urls: allMediaUrls,
        status,
      };

      // A/B test: create two posts with shared pair ID
      if (status === 'scheduled' && abEnabled && scheduledDateB && !editPost) {
        const pairId = crypto.randomUUID();
        const { error } = await supabase.from('content_posts').insert([
          {
            ...basePost,
            scheduled_date: localInputToUtc(scheduledDate, timezone),
            scheduled_for: localInputToUtc(scheduledDate, timezone),
            ab_test_group: 'A',
            ab_pair_id: pairId,
          },
          {
            ...basePost,
            scheduled_date: localInputToUtc(scheduledDateB, timezone),
            scheduled_for: localInputToUtc(scheduledDateB, timezone),
            ab_test_group: 'B',
            ab_pair_id: pairId,
          },
        ]);
        if (error) throw error;
      } else {
        const postData = {
          ...basePost,
          scheduled_date: status === 'scheduled' ? localInputToUtc(scheduledDate, timezone) : null,
          scheduled_for: status === 'scheduled' ? localInputToUtc(scheduledDate, timezone) : null,
        };

        if (editPost) {
          const { error } = await supabase
            .from('content_posts')
            .update(postData)
            .eq('id', editPost.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('content_posts')
            .insert([postData]);
          if (error) throw error;
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

  const formContent = (
    <>
      {/* Platform */}
      <div>
        <label className="block text-sm font-medium mb-3 text-foreground">Platform</label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.keys(PLATFORM_ICONS) as Platform[]).map((p) => {
            const Icon = PLATFORM_ICONS[p];
            const isSelected = platform === p;
            return (
              <button
                key={p}
                onClick={() => setPlatform(p)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50 hover:bg-accent'
                }`}
              >
                <Icon className={`w-6 h-6 mx-auto mb-2 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className={`text-sm font-medium capitalize ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                  {p}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Caption */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-foreground">Caption</label>
          <span className={`text-sm ${
            charactersRemaining < 0
              ? 'text-red-500'
              : charactersRemaining < 100
              ? 'text-orange-500'
              : 'text-muted-foreground'
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
          Media ({mediaFiles.length + mediaUrls.length}/{limits.media})
        </label>

        <div className="space-y-3">
          {(mediaUrls.length + mediaFiles.length < limits.media) && (
            <label className="flex items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-accent cursor-pointer transition-colors">
              <Upload className="w-6 h-6 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Click to upload or drag and drop
              </span>
              <input
                type="file"
                accept="image/*,video/*"
                multiple={limits.media > 1}
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
                  {file.type.startsWith('video') ? (
                    <div className="w-full h-full bg-accent flex items-center justify-center">
                      <Video className="w-12 h-12 text-muted-foreground" />
                    </div>
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
        <input
          type="datetime-local"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
          min={nowAsLocalInput(timezone)}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
        />

        {/* A/B test toggle (only for new scheduled posts) */}
        {!editPost && scheduledDate && (
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
                  min={nowAsLocalInput(timezone)}
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
          onClick={() => setShowPreview((v) => !v)}
          className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showPreview ? 'Hide Preview' : 'Preview Post'}
        </button>
        {showPreview && (
          <div className="mt-4">
            <PostPreview
              platform={platform}
              caption={caption}
              mediaUrls={mediaUrls}
              mediaFiles={mediaFiles}
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

  const actionButtons = (
    <div className="flex items-center justify-end gap-3">
      <button
        onClick={() => handleSave('draft')}
        disabled={saving || uploading || !caption.trim()}
        className="px-6 py-3 rounded-xl font-medium bg-accent hover:bg-accent/80 text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
      >
        {saving && !uploading ? 'Saving...' : 'Save Draft'}
      </button>
      <button
        onClick={() => handleSave('scheduled')}
        disabled={saving || uploading || !caption.trim() || !scheduledDate}
        className="px-6 py-3 rounded-xl font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
      >
        {uploading ? 'Uploading...' : saving ? 'Scheduling...' : 'Schedule Post'}
      </button>
    </div>
  );

  // ── Image Cropper modal (shared between page + modal modes) ────────────
  const cropperOverlay = cropperFile ? (
    <ImageCropper
      file={cropperFile}
      platform={platform}
      onCrop={handleCropDone}
      onCancel={handleCropCancel}
    />
  ) : null;

  // ── Full-page layout ─────────────────────────────────────────────────────
  if (asPage) {
    return (
      <>
      {cropperOverlay}
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-accent"
          >
            <ArrowLeft className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </button>
          <h1 className="text-3xl font-bold text-foreground">
            {editPost ? 'Edit Post' : 'Create New Post'}
          </h1>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {formContent}
        </div>

        {/* Actions */}
        <div className="mt-8 pt-6 border-t border-border">
          {actionButtons}
        </div>
      </div>
      </>
    );
  }

  // ── Modal layout (original) ──────────────────────────────────────────────
  return (
    <>
    {cropperOverlay}
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-2xl font-bold text-foreground">
            {editPost ? 'Edit Post' : 'Create New Post'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-accent"
          >
            <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-180px)] p-6 space-y-6">
          {formContent}
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          {actionButtons}
        </div>
      </div>
    </div>
    </>
  );
}
