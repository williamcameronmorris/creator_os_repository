import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * 404. Unknown paths used to redirect home, which made a mistyped or stale
 * link look like a page that worked. Say so instead.
 */
export function NotFound() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="t-micro mb-2">
        <span className="text-foreground">404</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>NOT FOUND</span>
      </div>
      <h1
        className="text-foreground mb-3"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Nothing <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>here.</em>
      </h1>
      <p className="t-body mb-10" style={{ maxWidth: '44ch' }}>
        That link does not go anywhere. Check the address, or head back to Clio.
      </p>
      <Link to="/" className="btn-ie btn-ie-solid inline-flex items-center gap-2">
        <ArrowLeft className="w-3 h-3" />
        <span className="btn-ie-text">Back to Clio</span>
      </Link>
    </div>
  );
}
