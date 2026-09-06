import { useState } from 'react';
import { Eyebrow } from '../ui/tac';
import { fmtCompact, type PublicKitPost } from '../../lib/mediaKit';
import { platformLabel } from './platformMeta';

/**
 * Top posts by their headline metric. Square tiles, hairline borders, no chrome.
 *
 * Instagram and Facebook thumbnails are signed CDN URLs that expire; a post
 * outside the sync window can carry a dead one. A tile whose image fails to
 * load is dropped and the next candidate takes its place, so the grid never
 * shows a black square to a brand.
 */
export function PostGrid({ posts, limit }: { posts: PublicKitPost[]; limit: number }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set());
  const visible = posts.filter((p) => !broken.has(p.thumbnail_url)).slice(0, Math.max(1, limit));
  if (visible.length === 0) return null;
  const markBroken = (url: string) => setBroken((prev) => new Set(prev).add(url));

  return (
    <section>
      <Eyebrow>TOP POSTS</Eyebrow>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        {visible.map((p) => {
          const tile = (
            <>
              <div className="aspect-square bg-muted border border-border overflow-hidden">
                <img
                  src={p.thumbnail_url}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={() => markBroken(p.thumbnail_url)}
                />
              </div>
              <div className="t-micro mt-1.5 flex items-center justify-between gap-2">
                <span className="text-foreground">{fmtCompact(p.metric_value)} {p.metric_label.toUpperCase()}</span>
                <span className="text-muted-foreground truncate">{platformLabel(p.platform).toUpperCase()}</span>
              </div>
            </>
          );
          return p.permalink ? (
            <a key={p.thumbnail_url} href={p.permalink} target="_blank" rel="noopener noreferrer" className="block group">
              {tile}
            </a>
          ) : (
            <div key={p.thumbnail_url}>{tile}</div>
          );
        })}
      </div>
    </section>
  );
}
