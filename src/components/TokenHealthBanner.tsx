import { useNavigate } from 'react-router-dom';
import { AlertTriangle, X, RefreshCw } from 'lucide-react';
import { useTokenHealth } from '../hooks/useTokenHealth';
import { useState } from 'react';

/**
 * Renders a dismissible warning banner when any connected platform token
 * is expired or expiring soon. Links directly to Settings for reconnect.
 */
export function TokenHealthBanner() {
  const navigate = useNavigate();
  const { platformHealth, loading, refresh } = useTokenHealth();
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
            Your <strong>{p.label}</strong> connection has expired or is expiring soon.
            Reconnect to keep posting and syncing.
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
