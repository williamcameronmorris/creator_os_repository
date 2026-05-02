import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useConnectionStatus } from '../contexts/ConnectionStatusContext';

/**
 * Persistent reminder shown across the app when the user has zero connected
 * social platforms. Clio can't actually do anything useful for them yet, so
 * this is the "continual reroute" — visible above the fold on every page
 * except the auth/onboarding/connections pages where it'd be redundant.
 */

const HIDDEN_PATH_PREFIXES = [
  '/auth',
  '/onboarding',
  '/office/connections',
];

export function ConnectionGateBanner() {
  const { hasConnected, loading } = useConnectionStatus();
  const location = useLocation();
  const navigate = useNavigate();

  // Don't render on pages where the message would duplicate or interfere.
  if (HIDDEN_PATH_PREFIXES.some((p) => location.pathname.startsWith(p))) return null;
  if (loading || hasConnected) return null;

  return (
    <div
      className="border-b border-border px-4 sm:px-6 lg:px-8 py-3"
      style={{ background: 'var(--card, #FFF)' }}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="t-micro text-foreground">CONNECT A PLATFORM</span>
          <span className="mx-2 text-muted-foreground">·</span>
          <span className="text-sm text-muted-foreground">
            Clio can&rsquo;t schedule posts or read real performance data until you connect at least one social account.
          </span>
        </div>
        <button
          type="button"
          onClick={() => navigate('/office/connections')}
          className="t-micro text-foreground hover:text-accent transition-colors flex items-center gap-2 flex-shrink-0"
        >
          CONNECT
          <ArrowRight className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
