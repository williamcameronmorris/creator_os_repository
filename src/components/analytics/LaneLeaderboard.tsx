import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { formatCompact } from './format';
import type { LaneStat } from '../../lib/postPerformance';

/**
 * Band 3: what should I make next.
 *
 * Lanes come from the creator's own Starter Kit taxonomy (Education, Reviews,
 * Behind-the-Scenes, Opinion, Entertainment) rather than a generated one, so
 * `winning_looks_like` hands back their own guidance verbatim.
 *
 * Ranked by MEDIAN views within the selected platform. Post count is always
 * visible: the right lane differs sharply per platform, and a lane with six
 * posts behind it deserves less weight than one with twenty-four.
 */
export function LaneLeaderboard({
  lanes,
  platformLabel,
}: {
  lanes: LaneStat[];
  platformLabel: string;
}) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState<string | null>(null);

  if (lanes.length === 0) {
    return (
      <div className="border border-border bg-card px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          Not enough classified posts on {platformLabel} yet to rank your lanes.
        </p>
      </div>
    );
  }

  const top = lanes[0].medViews || 1;

  return (
    <div className="border border-border bg-card">
      <ul>
        {lanes.map((lane, idx) => {
          const open = openId === lane.lane_id;
          const share = Math.max(0.04, lane.medViews / top);
          return (
            <li key={lane.lane_id} className="border-b border-border last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenId(open ? null : lane.lane_id)}
                className="w-full text-left px-5 py-4 hover:bg-muted transition-colors"
                aria-expanded={open}
              >
                <div className="flex items-baseline gap-3">
                  <span className="t-micro tabular-nums shrink-0">{idx + 1}</span>
                  <span className="text-sm font-semibold flex-1 min-w-0 truncate">
                    {lane.lane_name}
                  </span>
                  <span className="text-base font-bold tabular-nums shrink-0">
                    {formatCompact(lane.medViews)}
                  </span>
                </div>

                {/* Bar is relative to the top lane, so the gap between first and
                    last is legible without reading the numbers. */}
                <div className="mt-2 h-1 bg-muted">
                  <div
                    className="h-full"
                    style={{
                      width: `${share * 100}%`,
                      background: idx === 0 ? 'var(--accent)' : 'var(--foreground)',
                    }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 t-micro">
                  <span>{lane.posts} posts</span>
                  <span>{formatCompact(lane.medSaves)} med saves</span>
                  <span>{lane.medEr.toFixed(1)}% med engagement</span>
                </div>
              </button>

              {open && (
                <div className="px-5 pb-5 -mt-1">
                  {lane.winning_looks_like && (
                    <div
                      className="px-4 py-3 mb-3"
                      style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
                    >
                      <p className="t-micro" style={{ color: 'var(--accent)' }}>
                        What winning looks like
                      </p>
                      <p className="text-sm mt-2 leading-relaxed">{lane.winning_looks_like}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        `/studio/workflow?autostart=1&lane=${encodeURIComponent(lane.lane_name)}`
                      )
                    }
                    className="inline-flex items-center gap-2 px-4 py-2 border text-sm font-semibold"
                    style={{ borderColor: 'var(--accent)', color: 'var(--foreground)' }}
                  >
                    Make one <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
