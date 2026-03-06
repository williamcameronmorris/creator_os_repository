import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Upload, CheckCircle2, Smartphone, Video, AlertTriangle } from 'lucide-react';

interface CreationStageProps {
  workflowId: string;
  contentType: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function CreationStage({ workflowId, contentType, onComplete, onSkip }: CreationStageProps) {
  const [uploading, setUploading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);

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
          { id: 'res', label: '4K / 1080p Resolution', checked: false },
          { id: 'audio', label: 'Mic check / Audio levels', checked: false },
          { id: 'fps', label: 'Frame rate set (24/30/60)', checked: false },
          { id: 'orientation', label: 'Horizontal (16:9) format', checked: false }
        ]
  );

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;

    setUploading(true);
    const file = e.target.files[0];
    const fileExt = file.name.split('.').pop();
    const fileName = `${workflowId}/${Math.random()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(fileName, file);

    if (uploadError) {
      console.error(uploadError);
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('media')
      .getPublicUrl(fileName);

    setMediaUrl(publicUrl);
    setUploading(false);

    await supabase
      .from('content_workflow_stages')
      .update({
        creation_notes: { media_url: publicUrl, checklist_completed: checklist.filter(i => i.checked).map(i => i.id) }
      })
      .eq('id', workflowId);
  };

  const toggleCheck = (id: string) => {
    setChecklist(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-xl ${isMobileFormat ? 'bg-pink-100 text-pink-600' : 'bg-blue-100 text-blue-600'}`}>
            {isMobileFormat ? <Smartphone className="w-6 h-6" /> : <Video className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Production</h2>
            <p className="text-gray-500 text-sm">
              {isMobileFormat ? 'Mobile-first setup' : 'Professional setup'}
            </p>
          </div>
        </div>

        <button onClick={onSkip} className="text-gray-400 hover:text-gray-600 text-sm">
          Skip this step
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className={`border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-8 transition-colors ${
          mediaUrl ? 'border-green-300 bg-green-50' : 'border-gray-300 bg-violet-50 hover:border-blue-400'
        }`}>
          {mediaUrl ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <p className="text-green-800 font-medium mb-4">Media Uploaded</p>
              <a href={mediaUrl} target="_blank" rel="noreferrer" className="text-xs text-green-600 hover:underline block mb-4">
                View File
              </a>
              <label className="cursor-pointer text-sm font-semibold text-gray-600 bg-white px-4 py-2 rounded-lg border border-gray-200 hover:bg-violet-50 shadow-sm">
                Replace File
                <input type="file" className="hidden" accept="video/*,image/*" onChange={handleUpload} />
              </label>
            </div>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                {uploading ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" /> : <Upload className="w-8 h-8 text-blue-600" />}
              </div>
              <p className="text-gray-900 font-medium mb-1">{uploading ? 'Uploading...' : 'Upload Draft'}</p>
              <p className="text-gray-500 text-sm mb-4">Drag & drop or click to browse</p>
              <label className="cursor-pointer bg-violet-600 text-white px-6 py-2 rounded-xl text-sm font-medium hover:bg-violet-700 transition-colors shadow-lg">
                Select File
                <input type="file" className="hidden" accept="video/*,image/*" onChange={handleUpload} />
              </label>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            Quality Check
            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
              {checklist.filter(i => i.checked).length}/{checklist.length}
            </span>
          </h3>

          <div className="space-y-3">
            {checklist.map(item => (
              <label key={item.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-gray-200 hover:bg-violet-50 transition-all cursor-pointer">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggleCheck(item.id)}
                  className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                />
                <span className={`text-sm ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700 font-medium'}`}>
                  {item.label}
                </span>
              </label>
            ))}
          </div>

          {!mediaUrl && (
            <div className="mt-6 flex items-start gap-3 p-3 bg-amber-50 text-amber-800 rounded-lg text-xs">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <p>You can proceed without uploading, but scheduling automations won't work.</p>
            </div>
          )}

          <button
            onClick={onComplete}
            className="w-full mt-6 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors shadow-lg"
          >
            Finish Creation
          </button>
        </div>
      </div>
    </div>
  );
}
