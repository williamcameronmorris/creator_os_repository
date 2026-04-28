import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listPostForMeAccounts, POSTFORME_PLATFORMS, type PostForMeAccount } from '../lib/postforme';

/**
 * Office Connections card — third tile on the OfficeHub right rail.
 * Shows count of connected accounts (Post for Me + legacy direct integrations)
 * and links to /office/connections for management.
 *
 * Sized to match Schedule/Analytics on web; full-width below them on mobile.
 */
export function OfficeConnectionsCard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<PostForMeAccount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    listPostForMeAccounts(user.id, false)
      .then((s) => setAccounts(s.accounts))
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, [user]);

  // Only count accounts on platforms we support in-app
  const supportedIds = new Set(POSTFORME_PLATFORMS.map(p => p.id));
  const supportedAccounts = accounts.filter(a => supportedIds.has(a.platform as any));

  // 7 supported platforms in the v1 spec
  const totalSlots = 7;
  const connectedCount = supportedAccounts.length;
  const connectedDisplay = `${String(connectedCount).padStart(2, '0')}/${String(totalSlots).padStart(2, '0')}`;
  const platformsConnected = [...new Set(supportedAccounts.map((a) => a.platform))];

  return (
    <button
      onClick={() => navigate('/office/connections')}
      className="card-industrial p-6 text-left flex flex-col gap-4 group cursor-pointer w-full"
      style={{ minHeight: 240 }}
    >
      <span className="t-micro">03 · CONNECTIONS</span>
      <div
        className="font-mono text-foreground"
        style={{ fontSize: '2.75rem', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}
      >
        {loading ? '--' : connectedDisplay}
        <span className="text-sm text-muted-foreground ml-1 font-normal tracking-wide" style={{ fontSize: '13px' }}>
          connected
        </span>
      </div>
      <div className="flex-1">
        <div className="text-foreground font-semibold mb-1" style={{ fontSize: '1.2rem', letterSpacing: '-0.015em' }}>
          Connections
        </div>
        <div className="t-body" style={{ maxWidth: '32ch' }}>
          {loading
            ? 'Loading platforms…'
            : connectedCount === 0
            ? 'No platforms connected. Wire up TikTok, Instagram, and more to start publishing.'
            : `${platformsConnected.map((p) => p.toUpperCase()).join(' · ')}`}
        </div>
      </div>
      <span className="t-micro text-foreground group-hover:text-accent transition-colors flex items-center gap-2">
        Manage <ArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}
