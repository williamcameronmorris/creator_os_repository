import { Eyebrow } from '../ui/tac';
import { fmtCompact, type PublicKitPost } from '../../lib/mediaKit';
import { platformLabel } from './platformMeta';

/** Top posts by their headline metric. Square tiles, hairline borders, no chrome. */
export function PostGrid({ posts }: { posts: PublicKitPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section>
      <Eyebrow>TOP POSTS</Eyebrow>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
        {posts.map((p, i) => {
          const tile = (
            <>
              <div className="aspect-square bg-muted border border-border overflow-hidden">
                <img src={p.thumbnail_url} alt="" loading="lazy" className="w-full h-full object-cover" />
              </div>
              <div className="t-micro mt-1.5 flex items-center justify-between gap-2">
                <span className="text-foreground">{fmtCompact(p.metric_value)} {p.metric_label.toUpperCase()}</span>
                <span className="text-muted-foreground truncate">{platformLabel(p.platform).toUpperCase()}</span>
              </div>
            </>
          );
          return p.permalink ? (
            <a key={i} href={p.permalink} target="_blank" rel="noopener noreferrer" className="block group">
              {tile}
            </a>
          ) : (
            <div key={i}>{tile}</div>
          );
        })}
      </div>
    </section>
  );
}
