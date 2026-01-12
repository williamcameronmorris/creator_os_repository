import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Image as ImageIcon, Video, Upload, Trash2, Download, X } from 'lucide-react';
import { format } from 'date-fns';

interface MediaFile {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size: number;
  uploaded_at: string;
}

export function Media() {
  const { user } = useAuth();
  const { darkMode } = useTheme();
  const [media, setMedia] = useState<MediaFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<MediaFile | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      loadMedia();
    }
  }, [user]);

  const loadMedia = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from('media_library')
      .select('*')
      .eq('user_id', user.id)
      .order('uploaded_at', { ascending: false });

    if (!error && data) {
      setMedia(data);
    }
    setLoading(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);

    for (const file of files) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user!.id}/${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        const { data, error: uploadError } = await supabase.storage
          .from('media')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('media')
          .getPublicUrl(data.path);

        await supabase.from('media_library').insert({
          user_id: user!.id,
          file_name: file.name,
          file_url: publicUrl,
          file_type: file.type.startsWith('video') ? 'video' : 'image',
          file_size: file.size,
        });

      } catch (error) {
        console.error('Upload error:', error);
        alert(`Failed to upload ${file.name}`);
      }
    }

    setUploading(false);
    loadMedia();

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (file: MediaFile) => {
    if (!confirm(`Delete ${file.file_name}?`)) return;

    const path = file.file_url.split('/media/')[1];

    await supabase.storage
      .from('media')
      .remove([path]);

    await supabase
      .from('media_library')
      .delete()
      .eq('id', file.id);

    loadMedia();
    setSelectedFile(null);
  };

  const handleDownload = (file: MediaFile) => {
    const link = document.createElement('a');
    link.href = file.file_url;
    link.download = file.file_name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const filteredMedia = media.filter(file => {
    if (filter === 'all') return true;
    return file.file_type === filter;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Media Library
            </h1>
            <p className="text-muted-foreground">
              Upload and manage your media files
            </p>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors disabled:opacity-50 shadow-md"
          >
            <Upload className="w-5 h-5" />
            {uploading ? 'Uploading...' : 'Upload Media'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm ${
              filter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('image')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm ${
              filter === 'image'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Images
          </button>
          <button
            onClick={() => setFilter('video')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm ${
              filter === 'video'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Videos
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 rounded-xl text-center bg-card border border-border">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      ) : filteredMedia.length === 0 ? (
        <div className="p-12 rounded-xl text-center bg-card border border-border shadow-md">
          <ImageIcon className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-bold mb-2 text-foreground">
            {filter === 'all' ? 'No media files yet' : filter === 'image' ? 'No images' : 'No videos'}
          </h3>
          <p className="mb-6 text-muted-foreground">
            Upload images and videos to use in your social posts
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors shadow-md"
          >
            <Upload className="w-5 h-5" />
            Upload Media
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredMedia.map((file) => (
            <div
              key={file.id}
              onClick={() => setSelectedFile(file)}
              className="rounded-xl overflow-hidden cursor-pointer transition-all hover:scale-105 bg-card border border-border shadow-md hover:shadow-lg"
            >
              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                {file.file_type === 'video' ? (
                  <Video className="w-12 h-12 text-muted-foreground" />
                ) : (
                  <img src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-medium truncate text-foreground">
                  {file.file_name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.file_size)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedFile && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setSelectedFile(null)}>
          <div
            className="w-full max-w-4xl max-h-[90vh] rounded-2xl overflow-hidden bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold truncate text-foreground">
                {selectedFile.file_name}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(selectedFile)}
                  className="p-2 rounded-lg transition-colors hover:bg-accent"
                >
                  <Download className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                </button>
                <button
                  onClick={() => handleDelete(selectedFile)}
                  className="p-2 rounded-lg transition-colors hover:bg-accent"
                >
                  <Trash2 className="w-5 h-5 text-red-500" />
                </button>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="p-2 rounded-lg transition-colors hover:bg-accent"
                >
                  <X className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                </button>
              </div>
            </div>

            <div className="p-4">
              {selectedFile.file_type === 'video' ? (
                <video src={selectedFile.file_url} controls className="w-full max-h-[70vh] rounded-lg" />
              ) : (
                <img src={selectedFile.file_url} alt={selectedFile.file_name} className="w-full max-h-[70vh] object-contain rounded-lg" />
              )}
              <div className="mt-4 p-4 rounded-lg bg-muted">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground mb-1">File Size</p>
                    <p className="font-medium text-foreground">
                      {formatFileSize(selectedFile.file_size)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Uploaded</p>
                    <p className="font-medium text-foreground">
                      {format(new Date(selectedFile.uploaded_at), 'MMM d, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">Type</p>
                    <p className="font-medium text-foreground">
                      {selectedFile.file_type}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground mb-1">URL</p>
                    <a
                      href={selectedFile.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-chart-1 hover:text-chart-1/80 truncate block"
                    >
                      View
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
