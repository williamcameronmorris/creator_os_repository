import { format, parseISO } from 'date-fns';
import { ExternalLink } from 'lucide-react';
import { Takeaway, StatNumber } from '../ui/tac';
import { formatCompact } from './format';
import {
  fmtMultiple,
  verdictSentence,
  type PostPerformance,
} from '../../lib/postPerformance';

/**
 * Band 1: was that post good or bad.
 *
 * The hero number is the MULTIPLE, not the view count. A raw count cannot be
 * read without a baseline, which was the core complaint about the old screen:
 * every number floated with nothing to compare it against.
 */

function permalink(p: PostPerformance): string | null {
  if (!p.platform_post_id) return null;
  switch (p.platform) {
    case 'instagram': return `https://www.instagram.com/p/${p.platform_post_id}/`;
    case 'youtube':   return `https://www.youtube.com/watch?v=${p.platform_post_id}`;
    case 'tiktok':    return `https://www.tiktok.com/video/${p.platform_post_id}`;
    default:          return null;
  }
}

export function VerdictCard({ post }: { post: PostPerformance }) {
  const link = permalink(post);
  const text = (post.title || post.caption || '').trim();
  const scored = post.views_multiple !== null;

  return (
    <div className="border border-border bg-card">
      <div className="p-5 flex gap-4">
        {post.thumbnail_url ? (
          <img
            src={post.thumbnail_url}
            alt=""
            className="w-24 h-24 sm:w-28 sm:h-28 object-cover shrink-0 border border-border"
            onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
          />
        ) : (
          <div className="w-24 h-24 sm:w-28 sm:h-28 bg-muted border border-border shrink-0" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="t-micro">
              {post.platform} · {post.media_type ?? 'post'}
            </span>
            {post.published_at && (
              <span className="t-micro">{format(parseISO(post.published_at), 'MMM d')}</span>
            )}
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                title="View post"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <p className="text-sm mt-2 line-clamp-2">{text || 'No caption'}</p>
        </div>
      </div>

      {/* Stat row in the Starter Kit cover treatment: big numeral, micro label.
          Gold is reserved for the multiple, which is the number that carries
          the whole verdict. */}
      <div className="px-5 pb-5 grid grid-cols-2 sm:grid-cols-4 gap-5">
        <StatNumber
          value={scored ? fmtMultiple(post.views_multiple!) : '—'}
          label={scored ? 'vs your median' : 'not enough history'}
          tone="accent"
          hint={
            scored && post.med_views
              ? `Median ${Math.round(post.med_views).toLocaleString()} across your last ${post.baseline_n}`
              : undefined
          }
        />
        <StatNumber value={formatCompact(post.views)} label="views" />
        <StatNumber
          value={formatCompact(post.saves)}
          label={post.outlier_metric === 'saves' ? 'saves · outlier' : 'saves'}
          tone={post.outlier_metric === 'saves' ? 'accent' : 'default'}
        />
        <StatNumber value={`${post.engagement_rate.toFixed(1)}%`} label="engagement" />
      </div>

      <Takeaway>{verdictSentence(post)}</Takeaway>
    </div>
  );
}

/** The posts under the hero, each carrying its own multiple so the band reads
 *  as a run of verdicts rather than a table of counts. */
export function VerdictRow({ post }: { post: PostPerformance }) {
  const scored = post.views_multiple !== null;
  const strong = scored && post.views_multiple! >= 1.2;
  const weak = scored && post.views_multiple! <= 0.6;

  return (
    <li className="flex items-center gap-3 px-5 py-3 border-b border-border last:border-b-0">
      {post.thumbnail_url ? (
        <img
          src={post.thumbnail_url}
          alt=""
          className="w-11 h-11 object-cover shrink-0 border border-border"
          onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }}
        />
      ) : (
        <div className="w-11 h-11 bg-muted border border-border shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm truncate">{(post.title || post.caption || 'No caption').trim()}</p>
        <p className="t-micro mt-1">
          {post.platform} · {post.published_at ? format(parseISO(post.published_at), 'MMM d') : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div
          className="text-base font-bold tabular-nums"
          style={{
            color: strong ? 'var(--accent)' : weak ? 'var(--muted-foreground)' : 'var(--foreground)',
          }}
        >
          {scored ? fmtMultiple(post.views_multiple!) : '—'}
        </div>
        <div className="t-micro">{formatCompact(post.views)} views</div>
      </div>
    </li>
  );
}
