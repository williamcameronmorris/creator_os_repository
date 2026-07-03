import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Sparkles, Flame, Check, Plus } from 'lucide-react';
import {
  getCreator,
  getCreatorVideos,
  getTrackedChannelIds,
  trackCreator,
  untrackCreator,
  clioParams,
  formatCount,
  type SuggestedCreator,
  type WatchVideo,
} from '../lib/watch';
import { WatchPlayer } from '../components/WatchPlayer';

const GOLD = '#C8A24B';

function initials(title: string): string {
  return title.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

export function WatchCreator() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [creator, setCreator] = useState<SuggestedCreator | null>(null);
  const [videos, setVideos] = useState<WatchVideo[]>([]);
  const [tracked, setTracked] = useState(false);
  const [savingTrack, setSavingTrack] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<WatchVideo | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const [c, v, trackedIds] = await Promise.all([
          getCreator(id),
          getCreatorVideos(id),
          getTrackedChannelIds(),
        ]);
        if (!active) return;
        setCreator(c);
        // Attach the creator title so the Clio handoff reads correctly.
        setVideos(v.map((vid) => ({ ...vid, creatorTitle: c?.title ?? null })));
        setTracked(c ? trackedIds.has(c.channel_id) : false);
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  const toggleTrack = async () => {
    if (!creator || savingTrack) return;
    setSavingTrack(true);
    const next = !tracked;
    setTracked(next); // optimistic
    try {
      if (next) await trackCreator(creator);
      else await untrackCreator(creator.channel_id);
    } catch (e) {
      setTracked(!next); // revert
      setError((e as Error).message);
    } finally {
      setSavingTrack(false);
    }
  };

  const sendToClio = (v: WatchVideo) => navigate(`/studio/script?${clioParams(v)}`);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center font-mono text-[11px] tracking-wide text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error && !creator) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
        Couldn't load this creator. {error}
      </div>
    );
  }

  if (!creator) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
        Creator not found.
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 pt-4">
      {/* back */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 mb-4 font-mono text-[10px] tracking-widest uppercase text-muted-foreground"
      >
        <ArrowLeft className="w-4 h-4" />
        Watch
      </button>

      {/* creator header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <div
          className="rounded-full flex items-center justify-center font-semibold"
          style={{ width: 48, height: 48, background: '#B07050', color: '#F7F4EE' }}
        >
          {initials(creator.title)}
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-foreground truncate">{creator.title}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {formatCount(creator.subscriber_count)} subs
            {creator.avg_views ? ` · ${formatCount(creator.avg_views)} avg views` : ''}
          </p>
        </div>
        <button
          onClick={toggleTrack}
          disabled={savingTrack}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 border font-mono text-[9px] tracking-widest uppercase disabled:opacity-60"
          style={
            tracked
              ? { borderColor: GOLD, background: GOLD, color: '#43340c' }
              : { borderColor: 'var(--foreground)', color: 'var(--foreground)' }
          }
        >
          {tracked ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
          {tracked ? 'Watching' : 'Watch'}
        </button>
      </div>

      {/* videos */}
      <p className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground my-3">
        Recent · top first
      </p>

      {videos.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No recent videos synced for this creator yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-4">
          {videos.map((v) => (
            <div key={v.id}>
              <button
                onClick={() => setPlaying(v)}
                className="relative w-full block"
                style={{ aspectRatio: '9 / 12', background: '#1A1816' }}
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
                    className="absolute left-1.5 top-1.5 flex items-center gap-1 px-1.5 py-0.5 font-mono text-[7px] font-bold tracking-widest uppercase"
                    style={{ background: GOLD, color: '#43340c' }}
                  >
                    <Flame className="w-2 h-2" />
                    Top
                  </span>
                )}
                <span className="absolute inset-0 flex items-center justify-center">
                  <span
                    className="rounded-full flex items-center justify-center border"
                    style={{ width: 34, height: 34, borderColor: '#F7F4EE', background: 'rgba(0,0,0,0.35)' }}
                  >
                    <Play className="w-4 h-4" style={{ color: '#F7F4EE' }} />
                  </span>
                </span>
              </button>
              <p className="text-[12px] leading-snug text-foreground mt-1.5 line-clamp-2">{v.title}</p>
              <div className="flex items-center justify-between mt-1">
                <span className="font-mono text-[9px] text-muted-foreground">
                  {formatCount(v.view_count)} views
                  {v.packaging_percentile != null && (
                    <span style={{ color: '#8a6d22' }}> · {v.packaging_percentile}pct</span>
                  )}
                </span>
                <button
                  onClick={() => sendToClio(v)}
                  className="flex items-center gap-1 font-mono text-[9px] tracking-wider uppercase"
                  style={{ color: '#8a6d22' }}
                >
                  <Sparkles className="w-3 h-3" />
                  Clio
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {playing && (
        <WatchPlayer
          video={playing}
          onClose={() => setPlaying(null)}
          onSendToClio={(v) => {
            setPlaying(null);
            sendToClio(v);
          }}
        />
      )}
    </div>
  );
}
