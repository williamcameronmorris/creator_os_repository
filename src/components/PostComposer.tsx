import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { X, Instagram, Youtube, Video, Calendar, Upload, Sparkles } from 'lucide-react';

interface PostComposerProps {
  onClose: () => void;
  onSuccess: () => void;
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

export function PostComposer({ onClose, onSuccess, editPost }: PostComposerProps) {
  const { user } = useAuth();

  const [platform, setPlatform] = useState<Platform>(editPost?.platform as Platform || 'instagram');
  const [caption, setCaption] = useState(editPost?.caption || '');
  const [scheduledDate, setScheduledDate] = useState(
    editPost?.scheduled_date ? new Date(editPost.scheduled_date).toISOString().slice(0, 16) : ''
  );
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [mediaUrls, setMediaUrls] = useState<string[]>(editPost?.media_urls || []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const limits = PLATFORM_LIMITS[platform];
  const charactersRemaining = limits.caption - caption.length;

  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (mediaFiles.length + mediaUrls.length + files.length > limits.media) {
      alert(`${platform} only allows ${limits.media} media file(s)`);
      return;
    }
    setMediaFiles([...mediaFiles, ...files]);
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
        throw new Error(`Failed to upload ${file.name}`);
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
    if (!caption.trim()) {
      alert('Please add a caption');
      return;
    }
    if (status === 'scheduled' && !scheduledDate) {
      alert('Please select a date and time for scheduling');
      return;
    }

    setSaving(true);
    setUploading(true);

    try {
      const newMediaUrls = await uploadMedia();
      const allMediaUrls = [...mediaUrls, ...newMediaUrls];

      const postData = {
        user_id: user.id,
        platform,
        caption: caption.trim(),
        media_urls: allMediaUrls,
        scheduled_date: status === 'scheduled' ? new Date(scheduledDate).toISOString() : null,
        status,
        mentions: caption.match(/@\w+/g) || [],
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

      onSuccess();
      onClose();
    } catch (error) {
      console.error('Error saving post:', error);
      alert('Failed to save post. Please try again.');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
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
          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">
              Platform
            </label>
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
                    <Icon className={`w-6 h-6 mx-auto mb-2 ${
                      isSelected ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <span className={`text-sm font-medium capitalize ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}>
                      {p}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-foreground">
                Caption
              </label>
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
                      <button
                        onClick={() => removeMedia(index, false)}
                        className="absolute top-2 right-2 p-2 bg-red-500 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 text-foreground">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Schedule (Optional)
              </div>
            </label>
            <input
              type="datetime-local"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving || uploading || !caption.trim()}
            className="px-6 py-3 rounded-xl font-medium bg-accent hover:bg-accent/80 text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            onClick={() => handleSave('scheduled')}
            disabled={saving || uploading || !caption.trim() || !scheduledDate}
            className="px-6 py-3 rounded-xl font-medium bg-primary hover:bg-primary/90 text-primary-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
          >
            {uploading ? 'Uploading...' : saving ? 'Scheduling...' : 'Schedule Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
