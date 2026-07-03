import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Sparkles, Flame, X } from 'lucide-react';
import {
  getSuggestedCreators,
  getWatchFeed,
  formatCount,
  WATCH_NICHE,
  type SuggestedCreator,
  type WatchVideo,
} from '../lib/watch';

const GOLD = '#C8A24B';
const ACCENTS = ['#B07050', '#7A9E89', '#C8A24B', '#1A1816'];

type Platform = 'youtube' | 'tiktok' | 'instagram';

function initials(title: string): string {
  return title
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function Watch() {
  const navigate = useNavigate();
  const [platform, setPlatform] = useState<Platform>('youtube');
  const [creators, setCreators] = useState<SuggestedCreator[]>([]);
  const [feed, setFeed] = useState<WatchVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<WatchVideo | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (platform !== 'youtube') {
      setCreators([]);
      setFeed([]);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const [c, f] = await Promise.all([
          getSuggestedCreators('youtube'),
          getWatchFeed('youtube'),
        ]);
        if (!active) return;
        setCreators(c);
        setFeed(f);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [platform]);

  const sendToClio = (v: WatchVideo) => {
    const params = new URLSearchParams({
      autostart: '1',
      idea: v.title,
      platform: 'youtube',
      type: 'short',
      reasoning: `Modeled from ${v.creatorTitle ?? 'a top creator'}'s top-performing short`,
    });
    navigate(`/studio/script?${params.toString()}`);
  };

  return (
    <div className="max-w-md mx-auto px-4 pt-4">
      {/* header row */}
      <div className="flex items-center justify-between mb-4">
        <span className="font-mono text-[10px] tracking-widest uppercase text-muted-foreground">
          Watching
        </span>
        <span
          className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border"
          style={{ borderColor: GOLD, color: '#8a6d22' }}
        >
          {WATCH_NICHE}
        </span>
      </div>

      {/* platform tabs */}
      <div className="flex gap-6 border-b border-border mb-4">
        {(['youtube', 'tiktok', 'instagram'] as Platform[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className="relative pb-3 font-mono text-[10px] tracking-widest uppercase transition-colors"
            style={{ color: platform === p ? 'var(--foreground)' : undefined }}
          >
            <span className={platform === p ? '' : 'text-muted-foreground'}>{p}</span>
            {platform === p && (
              <span
                className="absolute left-0 right-0 -bottom-px h-0.5"
                style={{ background: GOLD }}
              />
            )}
          </button>
        ))}
      </div>

      {loading && (
        <div className="py-16 text-center font-mono text-[11px] tracking-wide text-muted-foreground">
          Loading…
        </div>
      )}

      {error && !loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Couldn't load the feed. {error}
        </div>
      )}

      {!loading && !error && platform !== 'youtube' && (
        <div className="py-16 text-center">
          <p className="text-sm text-foreground mb-1">
            {platform === 'instagram' ? 'Instagram' : 'TikTok'} is coming next
          </p>
          <p className="text-xs text-muted-foreground">
            {platform === 'instagram'
              ? 'This tab will show your own posts, newest first.'
              : 'Watch creators from TikTok here soon.'}
          </p>
        </div>
      )}

      {!loading && !error && platform === 'youtube' && (
        <>
          {/* suggested creators rail */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">
              Suggested creators
            </span>
            <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">
              Refreshed weekly
            </span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4 mb-2 border-b border-border -mx-4 px-4">
            {creators.map((c, i) => (
              <div key={c.id} className="flex flex-col items-center gap-1.5 w-16 flex-shrink-0">
                <div
                  className="w-13 h-13 rounded-full flex items-center justify-center text-cream font-semibold text-sm"
                  style={{
                    width: 52,
                    height: 52,
                    background: ACCENTS[i % ACCENTS.length],
                    color: '#F7F4EE',
                  }}
                >
                  {initials(c.title)}
                </div>
                <span className="text-[10px] text-center leading-tight text-foreground line-clamp-2 h-6">
                  {c.title}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground">
                  {formatCount(c.subscriber_count)}
                </span>
              </div>
            ))}
          </div>

          {/* feed */}
          <div className="flex flex-col gap-5 pt-4 pb-4">
            {feed.map((v) => (
              <div key={v.id}>
                <button
                  onClick={() => setPlaying(v)}
                  className="relative w-full block"
                  style={{ aspectRatio: '16 / 9', background: '#1A1816' }}
                  aria-label={`Play ${v.title}`}
                >
                  {v.thumbnail_url && (
                    <img
                      src={v.thumbnail_url}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                  {v.is_top && (
                    <span
                      className="absolute left-2 top-2 flex items-center gap-1 px-2 py-0.5 font-mono text-[8px] font-bold tracking-widest uppercase"
                      style={{ background: GOLD, color: '#43340c' }}
                    >
                      <Flame className="w-2.5 h-2.5" />
                      Top short
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span
                      className="w-11 h-11 rounded-full flex items-center justify-center border"
                      style={{ borderColor: '#F7F4EE', background: 'rgba(0,0,0,0.35)' }}
                    >
                      <Play className="w-5 h-5" style={{ color: '#F7F4EE' }} />
                    </span>
                  </span>
                </button>
                <div className="flex items-start gap-3 pt-2.5">
                  <p className="flex-1 text-sm font-medium leading-snug text-foreground">
                    {v.title}
                  </p>
                  <button
                    onClick={() => sendToClio(v)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 border font-mono text-[9px] tracking-wider uppercase"
                    style={{ borderColor: GOLD, color: '#8a6d22' }}
                  >
                    <Sparkles className="w-3 h-3" />
                    Clio
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                  <span>{v.creatorTitle}</span>
                  <span className="w-0.5 h-0.5 rounded-full bg-current opacity-50" />
                  <span>{formatCount(v.view_count)} views</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* in-app player */}
      {playing && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center px-4"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPlaying(null)}
        >
          <div className="w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setPlaying(null)}
                className="w-8 h-8 flex items-center justify-center"
                style={{ color: '#F7F4EE' }}
                aria-label="Close player"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div style={{ aspectRatio: '9 / 16', maxHeight: '78vh' }} className="mx-auto">
              <iframe
                title={playing.title}
                src={`https://www.youtube.com/embed/${playing.video_id}?autoplay=1&playsinline=1`}
                className="w-full h-full"
                style={{ border: 0 }}
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
            <button
              onClick={() => {
                const v = playing;
                setPlaying(null);
                sendToClio(v);
              }}
              className="w-full mt-3 flex items-center justify-center gap-2 py-2.5 font-mono text-[10px] tracking-widest uppercase"
              style={{ background: GOLD, color: '#43340c' }}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Turn into a Clio idea
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
