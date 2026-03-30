import {
  Instagram, Youtube, Sparkles, Video, Image as ImageIcon,
  Heart, MessageCircle, Bookmark, Share2, ThumbsUp, Eye,
} from 'lucide-react';

interface PostPreviewProps {
  platform: 'instagram' | 'tiktok' | 'youtube';
  caption: string;
  mediaUrls: string[];
  mediaFiles: File[];
  scheduledDate?: string;
  /** Real account handle — falls back to 'your_account' if omitted */
  username?: string;
}

/**
 * Mock platform-specific post preview.
 * Shows a realistic representation of how the post will look on each platform.
 */
export function PostPreview({ platform, caption, mediaUrls, mediaFiles, username = 'your_account' }: PostPreviewProps) {
  const allMedia: string[] = [
    ...mediaUrls,
    ...mediaFiles.map(f => URL.createObjectURL(f)),
  ];
  const firstMedia = allMedia[0] || null;
  const isVideo    = mediaFiles[0]?.type?.startsWith('video/');

  if (platform === 'instagram') {
    return <InstagramPreview caption={caption} media={firstMedia} isVideo={isVideo} mediaCount={allMedia.length} username={username} />;
  }
  if (platform === 'tiktok') {
    return <TikTokPreview caption={caption} media={firstMedia} username={username} />;
  }
  return <YouTubePreview caption={caption} media={firstMedia} username={username} />;
}

// ── Instagram ─────────────────────────────────────────────────────────────────
function InstagramPreview({
  caption, media, isVideo, mediaCount, username,
}: {
  caption: string;
  media: string | null;
  isVideo: boolean;
  mediaCount: number;
  username: string;
}) {
  const truncatedCaption = caption.length > 125 ? caption.slice(0, 125) + '... more' : caption;
  const handle = username.startsWith('@') ? username.slice(1) : username;

  return (
    <div className="w-full max-w-[375px] mx-auto font-sans bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-50">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center">
          <Instagram className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-gray-900 leading-none">{handle}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">Preview</p>
        </div>
        <button className="text-gray-400 text-xl leading-none">···</button>
      </div>

      {/* Media */}
      <div className="aspect-square bg-gray-100 relative">
        {media ? (
          isVideo ? (
            <div className="w-full h-full flex items-center justify-center bg-black">
              <Video className="w-12 h-12 text-white/50" />
            </div>
          ) : (
            <img src={media} alt="Preview" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-300">
            <ImageIcon className="w-16 h-16" />
            <p className="text-sm font-medium">No image selected</p>
          </div>
        )}
        {mediaCount > 1 && (
          <div className="absolute top-3 right-3 bg-black/60 text-white text-[10px] font-bold px-2 py-1 rounded-full">
            1/{mediaCount}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-4">
            <Heart          className="w-6 h-6 text-gray-800" />
            <MessageCircle  className="w-6 h-6 text-gray-800" />
            <Share2         className="w-6 h-6 text-gray-800" />
          </div>
          <Bookmark className="w-6 h-6 text-gray-800" />
        </div>
        <p className="text-[13px] font-semibold text-gray-900 mb-1">0 likes</p>
        {caption && (
          <p className="text-[13px] text-gray-900 leading-snug">
            <span className="font-semibold">{handle} </span>
            {truncatedCaption}
          </p>
        )}
      </div>
    </div>
  );
}

// ── TikTok ────────────────────────────────────────────────────────────────────
function TikTokPreview({
  caption, media, username,
}: {
  caption: string;
  media: string | null;
  username: string;
}) {
  const handle = username.startsWith('@') ? username : `@${username}`;

  return (
    <div
      className="w-full max-w-[280px] mx-auto bg-black rounded-2xl overflow-hidden shadow-lg relative"
      style={{ aspectRatio: '9/16' }}
    >
      {/* Background */}
      <div className="absolute inset-0">
        {media ? (
          <img src={media} alt="Preview" className="w-full h-full object-cover opacity-80" />
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-gray-800 to-gray-900 flex items-center justify-center">
            <Video className="w-16 h-16 text-white/20" />
          </div>
        )}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />

      {/* Right-side actions */}
      <div className="absolute right-3 bottom-32 flex flex-col items-center gap-5">
        <div className="flex flex-col items-center gap-1">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 to-cyan-400 flex items-center justify-center border-2 border-white">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
        </div>
        {[
          { Icon: Heart,         label: '0'     },
          { Icon: MessageCircle, label: '0'     },
          { Icon: Bookmark,      label: '0'     },
          { Icon: Share2,        label: 'Share' },
        ].map(({ Icon, label }) => (
          <div key={label} className="flex flex-col items-center gap-0.5">
            <Icon className="w-7 h-7 text-white" />
            <span className="text-white text-[10px] font-semibold">{label}</span>
          </div>
        ))}
      </div>

      {/* Bottom caption */}
      <div className="absolute bottom-4 left-3 right-16">
        <p className="text-white text-[12px] font-semibold mb-1">{handle}</p>
        {caption && (
          <p className="text-white text-[11px] leading-snug line-clamp-3">{caption}</p>
        )}
      </div>
    </div>
  );
}

// ── YouTube ───────────────────────────────────────────────────────────────────
function YouTubePreview({
  caption, media, username,
}: {
  caption: string;
  media: string | null;
  username: string;
}) {
  const title       = caption?.split('\n')[0]?.slice(0, 80)               || 'Untitled Video';
  const description = caption?.split('\n').slice(1).join(' ')?.slice(0, 120) || '';
  const channelName = username.startsWith('@') ? username.slice(1) : username;

  return (
    <div className="w-full max-w-[375px] mx-auto bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100">
      {/* Thumbnail */}
      <div className="aspect-video bg-black relative">
        {media ? (
          <img src={media} alt="Thumbnail" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <Youtube className="w-12 h-12 text-red-500" />
            <p className="text-white/40 text-sm">No thumbnail</p>
          </div>
        )}
        <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
          0:00
        </div>
      </div>

      {/* Metadata */}
      <div className="p-3 flex gap-3">
        <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <Youtube className="w-4 h-4 text-red-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-gray-900 line-clamp-2 leading-snug mb-1">{title}</p>
          <p className="text-[11px] text-gray-500">{channelName} · 0 views · Just now</p>
          {description && (
            <p className="text-[11px] text-gray-400 mt-1 line-clamp-2">{description}</p>
          )}
        </div>
      </div>

      {/* Engagement row */}
      <div className="flex items-center justify-around py-2 border-t border-gray-100 text-gray-500">
        <div className="flex items-center gap-1.5">
          <ThumbsUp className="w-4 h-4" /><span className="text-[11px]">0</span>
        </div>
        <div className="flex items-center gap-1.5">
          <MessageCircle className="w-4 h-4" /><span className="text-[11px]">0</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Eye className="w-4 h-4" /><span className="text-[11px]">0 views</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Share2 className="w-4 h-4" /><span className="text-[11px]">Share</span>
        </div>
      </div>
    </div>
  );
}
