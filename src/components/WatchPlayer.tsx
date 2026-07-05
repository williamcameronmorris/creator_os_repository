import { X, Sparkles } from 'lucide-react';
import type { WatchVideo } from '../lib/watch';

const GOLD = '#C8A24B';

interface Props {
  video: WatchVideo;
  onClose: () => void;
  onSendToClio: (v: WatchVideo) => void;
}

/** In-app YouTube playback (the official embed player) plus a Clio handoff. */
export function WatchPlayer({ video, onClose, onSendToClio }: Props) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end mb-2">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center"
            style={{ color: '#F7F4EE' }}
            aria-label="Close player"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div style={{ aspectRatio: '9 / 16', maxHeight: '78vh' }} className="mx-auto">
          <iframe
            title={video.title}
            src={`https://www.youtube.com/embed/${video.video_id}?autoplay=1&playsinline=1`}
            className="w-full h-full"
            style={{ border: 0 }}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
        <button
          onClick={() => onSendToClio(video)}
          className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 font-mono text-[10px] tracking-widest uppercase"
          style={{ background: GOLD, color: '#43340c' }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Make my version — in my voice
        </button>
      </div>
    </div>
  );
}
