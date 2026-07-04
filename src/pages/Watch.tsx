import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Play, Sparkles, Flame, Heart, MessageCircle } from 'lucide-react';
import {
  getSuggestedCreators,
  getWatchFeed,
  getMyInstagramPosts,
  ensureWatchNiche,
  formatCount,
  clioParams,
  WATCH_NICHE,
  type SuggestedCreator,
  type WatchVideo,
  type MyPost,
} from '../lib/watch';
import { WatchPlayer } from '../components/WatchPlayer';
import { WatchVideoStats } from '../components/WatchVideoStats';

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
  const [myPosts, setMyPosts] = useState<MyPost[]>([]);
  const [niche, setNiche] = useState<string | null>(null);
  const [needsNiche, setNeedsNiche] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState<WatchVideo | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setNeedsNiche(false);
    (async () => {
      try {
        if (platform === 'youtube') {
          // Resolve the user's niche (runs discovery on demand for a cold niche).
          const resolved = await ensureWatchNiche();
          if (!active) return;
          setNiche(resolved.niche);
          if (resolved.needsNiche || !resolved.niche) {
            setNeedsNiche(true);
            setCreators([]);
            setFeed([]);
            return;
          }
          const [c, f] = await Promise.all([
            getSuggestedCreators('youtube', resolved.niche),
            getWatchFeed('youtube', resolved.niche),
          ]);
          if (!active) return;
          setCreators(c);
          setFeed(f);
        } else if (platform === 'instagram') {
          const posts = await getMyInstagramPosts();
          if (!active) return;
          setMyPosts(posts);
        }
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

  const sendToClio = (v: WatchVideo) => navigate(`/studio/script?${clioParams(v)}`);

  const remixToClio = (p: MyPost) => {
    const firstLine = (p.caption || '').split('\n')[0].trim().slice(0, 120) || 'One of my past posts';
    const params = new URLSearchParams({
      autostart: '1',
      idea: firstLine,
      platform: 'instagram',
      type: 'reel',
      reasoning: 'Remix of one of your past posts',
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
        {platform !== 'instagram' && (niche || !needsNiche) && (
          <span
            className="font-mono text-[9px] tracking-widest uppercase px-2 py-1 border"
            style={{ borderColor: GOLD, color: '#8a6d22' }}
          >
            {niche ?? WATCH_NICHE}
          </span>
        )}
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
          {platform === 'youtube' ? 'Finding creators in your niche…' : 'Loading…'}
        </div>
      )}

      {error && !loading && (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Couldn't load the feed. {error}
        </div>
      )}

      {!loading && !error && platform === 'youtube' && needsNiche && (
        <div className="py-16 text-center">
          <p className="text-sm text-foreground mb-1">Set your niche to see creators</p>
          <p className="text-xs text-muted-foreground mb-4">
            Watch uses your niche to find creators worth studying.
          </p>
          <Link
            to="/profile"
            className="inline-block font-mono text-[10px] tracking-widest uppercase px-3 py-2 border"
            style={{ borderColor: GOLD, color: '#8a6d22' }}
          >
            Set niche in profile
          </Link>
        </div>
      )}

      {!loading && !error && platform === 'tiktok' && (
        <div className="py-16 text-center">
          <p className="text-sm text-foreground mb-1">TikTok is coming next</p>
          <p className="text-xs text-muted-foreground">Watch creators from TikTok here soon.</p>
        </div>
      )}

      {!loading && !error && platform === 'instagram' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-[9px] tracking-widest uppercase text-muted-foreground">
              My posts · newest first
            </span>
          </div>
          {myPosts.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No published Instagram posts yet. Connect Instagram in Settings to sync them.
            </div>
          ) : (
            <div className="flex flex-col">
              {myPosts.map((p) => (
                <div key={p.id} className="flex gap-3 py-3 border-b border-border">
                  <div
                    className="flex-shrink-0 relative"
                    style={{ width: 70, height: 88, background: '#1A1816' }}
                  >
                    {p.thumbnail_url && (
                      <img
                        src={p.thumbnail_url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    )}
                    {p.media_type === 'video' && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <Play className="w-4 h-4" style={{ color: '#F7F4EE' }} />
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <p className="text-[13px] leading-snug text-foreground line-clamp-2">
                      {p.caption || 'Untitled post'}
                    </p>
                    <span className="font-mono text-[10px] text-muted-foreground mt-1">
                      {p.published_at
                        ? new Date(p.published_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })
                        : ''}
                      {p.media_type ? ` · ${p.media_type}` : ''}
                    </span>
                    <div className="flex items-center gap-4 mt-auto pt-2">
                      {p.views ? (
                        <span className="flex items-center gap-1 text-[11px] text-foreground">
                          <Play className="w-3 h-3 text-muted-foreground" />
                          {formatCount(p.views)}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1 text-[11px] text-foreground">
                        <Heart className="w-3 h-3 text-muted-foreground" />
                        {formatCount(p.likes)}
                      </span>
                      <span className="flex items-center gap-1 text-[11px] text-foreground">
                        <MessageCircle className="w-3 h-3 text-muted-foreground" />
                        {formatCount(p.comments)}
                      </span>
                      <button
                        onClick={() => remixToClio(p)}
                        className="ml-auto flex items-center gap-1 font-mono text-[9px] tracking-wider uppercase"
                        style={{ color: '#8a6d22' }}
                      >
                        <Sparkles className="w-3 h-3" />
                        Remix
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && !error && platform === 'youtube' && !needsNiche && creators.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-sm text-foreground mb-1">No creators for {niche ?? 'your niche'} yet</p>
          <p className="text-xs text-muted-foreground">We're still gathering them. Check back soon.</p>
        </div>
      )}

      {!loading && !error && platform === 'youtube' && !needsNiche && creators.length > 0 && (
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
              <Link
                key={c.id}
                to={`/watch/creator/${c.id}`}
                className="flex flex-col items-center gap-1.5 w-16 flex-shrink-0"
              >
                <div
                  className="rounded-full flex items-center justify-center font-semibold text-sm"
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
              </Link>
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
                <div className="mt-1.5 text-[11px] text-muted-foreground">{v.creatorTitle}</div>
                <WatchVideoStats video={v} niche={niche ?? WATCH_NICHE} />
              </div>
            ))}
          </div>
        </>
      )}

      {/* in-app player */}
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
