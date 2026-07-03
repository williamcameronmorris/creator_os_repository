import { Compass } from 'lucide-react';
import { formatCount, type WatchVideo } from '../lib/watch';

const GOLD = '#C8A24B';
const CHAR = '#1A1816';

function outlierMult(v: WatchVideo): number | null {
  if (!v.view_count || !v.creator_avg_views) return null;
  return v.view_count / v.creator_avg_views;
}

function packagingRead(p: number): string {
  if (p >= 80) return 'top-tier packaging';
  if (p >= 60) return 'above the niche median';
  if (p >= 45) return 'around the median';
  return 'below the niche median';
}

/** Plain-English takeaway: the lighthouse. Derived from reach vs packaging. */
function surfacedRead(v: WatchVideo): string {
  const mult = outlierMult(v);
  const p = v.packaging_percentile;
  const bigReach = mult != null && mult >= 2;
  if (p != null && p >= 70 && bigReach) return 'Strong on both reach and packaging. A full model to study.';
  if (bigReach && (p == null || p < 50)) return 'Went viral on reach, not packaging. Model the concept, not the thumbnail.';
  if (p != null && p >= 70) return 'The title and thumbnail are doing the work. Study the packaging.';
  if (p != null && p < 45) return 'Surfaced on niche relevance. Packaging sits below the niche median.';
  return 'A solid niche performer worth a look.';
}

/**
 * "Why it surfaced" mini-dashboard shown under each Watch video: the reach and
 * packaging signals with a visual percentile bar, plus a one-line takeaway so
 * a bare number like "41" carries its meaning.
 */
export function WatchVideoStats({ video, niche }: { video: WatchVideo; niche: string }) {
  const p = video.packaging_percentile;
  const mult = outlierMult(video);

  return (
    <div className="mt-2 border border-border">
      <div className="px-3 py-1.5 border-b border-border">
        <span className="font-mono text-[8px] tracking-widest uppercase text-muted-foreground">
          Why it surfaced
        </span>
      </div>

      <div className="grid grid-cols-2">
        {/* Reach */}
        <div className="px-3 py-2 border-r border-border">
          <div className="font-mono text-[8px] tracking-widest uppercase text-muted-foreground">
            Reach
          </div>
          <div className="text-sm font-medium text-foreground mt-1">
            {formatCount(video.view_count)} views
          </div>
          <div className="font-mono text-[10px] text-muted-foreground mt-1">
            {mult != null ? `${mult.toFixed(1)}× creator avg` : 'vs niche'}
          </div>
        </div>

        {/* Packaging */}
        <div className="px-3 py-2">
          <div className="font-mono text-[8px] tracking-widest uppercase text-muted-foreground">
            Packaging
          </div>
          {p != null ? (
            <>
              <div className="text-sm font-medium text-foreground mt-1">
                {p}
                <span className="text-muted-foreground text-[11px]"> / 100</span>
              </div>
              <div className="relative h-1 mt-2" style={{ background: 'rgba(26,24,22,0.12)' }}>
                <div
                  className="absolute inset-y-0 left-0"
                  style={{ width: `${Math.max(2, p)}%`, background: p >= 60 ? GOLD : '#9a978f' }}
                />
                {/* niche median marker */}
                <div
                  className="absolute"
                  style={{ left: '50%', top: -2, bottom: -2, width: 1, background: 'rgba(26,24,22,0.4)' }}
                />
              </div>
              <div
                className="font-mono text-[10px] mt-1.5"
                style={{ color: p >= 60 ? '#8a6d22' : undefined }}
              >
                CTR pctile vs {niche} · {packagingRead(p)}
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground mt-1">Not scored yet</div>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-t border-border flex items-start gap-2">
        <Compass className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: GOLD }} />
        <span className="text-[12px] leading-snug" style={{ color: CHAR }}>
          {surfacedRead(video)}
        </span>
      </div>
    </div>
  );
}
