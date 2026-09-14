import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { mediaRef } from '../../lib/mediaUrls';
import { useAuth } from '../../contexts/AuthContext';
import { useSignedMediaUrl } from '../ui/SignedMedia';
import { Upload, CheckCircle2, Smartphone, Video, AlertTriangle } from 'lucide-react';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

interface CreationStageProps {
  workflowId: string;
  contentType: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function CreationStage({ workflowId, contentType, onComplete, onSkip }: CreationStageProps) {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const mediaHref = useSignedMediaUrl(mediaUrl);

  const isMobileFormat = ['reel', 'story', 'short', 'tiktok'].includes(contentType);

  const [checklist, setChecklist] = useState(
    isMobileFormat
      ? [
          { id: 'lens', label: 'Wipe camera lens', checked: false },
          { id: 'lighting', label: 'Face towards light source', checked: false },
          { id: 'audio', label: 'Background noise minimized', checked: false },
          { id: 'orientation', label: 'Vertical (9:16) format', checked: false }
        ]
      : [
          { id: 'res', label: '4K / 1080p resolution', checked: false },
          { id: 'audio', label: 'Mic check / audio levels', checked: false },
          { id: 'fps', label: 'Frame rate set (24/30/60)', checked: false },
          { id: 'orientation', label: 'Horizontal (16:9) format', checked: false }
        ]
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    const file = e.target.files[0];
    if (!user) {
      setError('Sign in again to upload.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setError(`${file.name} is over the 50 MB limit.`);
      return;
    }
    setUploading(true);
    setError('');
    const fileExt = file.name.split('.').pop();
    // The bucket's insert policy requires the uploader's id as the first
    // folder; the workflow id keeps a project's takes together under it.
    const fileName = `${user.id}/${workflowId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(fileName, file);

    if (uploadError) {
      console.error(uploadError);
      setError(`Upload failed: ${uploadError.message}`);
      setUploading(false);
      return;
    }

    const publicUrl = mediaRef(fileName);

    setMediaUrl(publicUrl);

    // Persist the media link — if this write fails, the upload isn't saved and
    // would be lost on reload, so surface it instead of showing false success.
    const { error: saveError } = await supabase
      .from('content_workflow_stages')
      .update({
        creation_notes: { media_url: publicUrl, checklist_completed: checklist.filter(i => i.checked).map(i => i.id) }
      })
      .eq('id', workflowId);
    if (saveError) setError('Uploaded, but saving it to your workflow failed. Try again before continuing.');
    setUploading(false);
  };

  const toggleCheck = (id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  const FormatIcon = isMobileFormat ? Smartphone : Video;

  return (
    <div className="max-w-4xl mx-auto">
      {error && (
        <p className="mb-4 text-sm" style={{ color: '#B07050' }}>{error}</p>
      )}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 border border-border flex items-center justify-center flex-shrink-0">
            <FormatIcon className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              Production
            </h2>
            <p className="t-body">{isMobileFormat ? 'Mobile-first setup.' : 'Professional setup.'}</p>
          </div>
        </div>
        <button onClick={onSkip} className="t-micro text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
          Skip this step
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className={`border border-dashed flex flex-col items-center justify-center p-8 min-h-[280px] transition-colors ${
          mediaUrl ? 'border-accent bg-card' : 'border-border bg-card hover:border-foreground/60'
        }`}>
          {mediaUrl ? (
            <div className="text-center">
              <div className="w-12 h-12 border border-accent flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-5 h-5 text-accent" />
              </div>
              <p className="text-foreground mb-1" style={{ fontWeight: 500 }}>Media uploaded</p>
              <a href={mediaHref || undefined} target="_blank" rel="noreferrer" className="t-micro text-accent hover:underline block mb-4">View file</a>
              <label className="btn-ie inline-block cursor-pointer">
                <span className="btn-ie-text">Replace file</span>
                <input type="file" className="hidden" accept="video/*,image/*" onChange={handleUpload} />
              </label>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-12 h-12 border border-border flex items-center justify-center mx-auto mb-4">
                {uploading
                  ? <div className="w-5 h-5 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
                  : <Upload className="w-5 h-5 text-foreground" />}
              </div>
              <p className="text-foreground mb-1" style={{ fontWeight: 500 }}>{uploading ? 'Uploading…' : 'Upload draft'}</p>
              <p className="t-body mb-5">Drag & drop or click to browse</p>
              <label className="btn-ie btn-ie-solid inline-block cursor-pointer">
                <span className="btn-ie-text">Select file</span>
                <input type="file" className="hidden" accept="video/*,image/*" onChange={handleUpload} />
              </label>
            </div>
          )}
        </div>

        <div className="bg-card border border-border p-6 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="t-micro text-foreground">Quality check</h3>
            <span className="t-micro text-muted-foreground">{checklist.filter(i => i.checked).length}/{checklist.length}</span>
          </div>

          <div className="divide-y divide-border">
            {checklist.map(item => (
              <label key={item.id} className="flex items-center gap-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleCheck(item.id)}
                  className="w-4 h-4 accent-foreground"
                />
                <span className={`text-sm ${item.checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          {!mediaUrl && (
            <div className="mt-5 flex items-start gap-2 p-3 border border-border text-xs text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <p>You can proceed without uploading, but scheduling automations won't work.</p>
            </div>
          )}

          <button
            onClick={onComplete}
            className="btn-ie btn-ie-solid w-full mt-6"
          >
            <span className="btn-ie-text">Finish creation</span>
          </button>
        </div>
      </div>
    </div>
  );
}
