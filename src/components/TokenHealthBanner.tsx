import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useTokenHealth } from '../hooks/useTokenHealth';
import { useState } from 'react';

/**
 * Renders a dismissible banner when a DIRECT platform grant the app still
 * relies on has expired. The copy names what actually stops working (see
 * src/lib/tokenHealth.ts); it never claims posting or syncing are at risk,
 * because those run through Post for Me. Links to Settings for reconnect.
 */
export function TokenHealthBanner() {
  const navigate = useNavigate();
  const { platformHealth, loading } = useTokenHealth();
  const [dismissed, setDismissed] = useState<string[]>([]);

  if (loading) return null;

  const expiredPlatforms = platformHealth.filter(
    (h) => h.status === 'expired' && !dismissed.includes(h.platform)
  );

  if (expiredPlatforms.length === 0) return null;

  return (
    <div className="space-y-2 mb-4">
      {expiredPlatforms.map((p) => (
        <div
          key={p.platform}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <p className="text-sm font-medium flex-1">
            Your direct <strong>{p.label}</strong> connection has expired
            {p.severity === 'notice' ? '. ' : ' or is expiring soon. '}
            {p.impact}
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <RefreshCw className="w-3 h-3" />
            Reconnect
          </button>
          <button
            onClick={() => setDismissed((prev) => [...prev, p.platform])}
            className="p-1 rounded-lg hover:bg-amber-100 transition-colors flex-shrink-0"
            title="Dismiss"
          >
            <X className="w-4 h-4 text-amber-500" />
          </button>
        </div>
      ))}
    </div>
  );
}
