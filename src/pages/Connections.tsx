import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  POSTFORME_PLATFORMS,
  initPostForMeConnect,
  listPostForMeAccounts,
  disconnectPostForMeAccount,
  type PostForMeAccount,
  type PostForMePlatformId,
} from '../lib/postforme';

/**
 * /office/connections — page for managing social account connections.
 *
 * V1 wires up Post for Me-only. Future: surfaces existing direct integrations
 * (Meta, Threads, YouTube) here too once they're decommissioned.
 *
 * Layout matches the editorial industrial aesthetic:
 *   - Section marker "04 / CONNECTIONS"
 *   - Heading
 *   - List of connected accounts (hairline-divided rows)
 *   - List of available-to-connect platforms (hairline-divided rows)
 */
export function Connections() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [accounts, setAccounts] = useState<PostForMeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    refresh();
  }, [user]);

  // Show success message if returning from successful OAuth callback
  useEffect(() => {
    const justConnected = searchParams.get('connected');
    if (justConnected) {
      setFlash(`Connected ${justConnected.toUpperCase()}.`);
      const t = setTimeout(() => setFlash(null), 4000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const state = await listPostForMeAccounts(user.id, true);
      setAccounts(state.accounts);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async (platform: PostForMePlatformId) => {
    if (!user) return;
    setBusyPlatform(platform);
    setError(null);
    try {
      const { authUrl } = await initPostForMeConnect(user.id, platform);
      // PFM's hosted OAuth flow ends on their own success page when they're
      // using their own platform credentials (the `redirect_url_override`
      // option only fires when the integration uses our own platform creds).
      // To avoid stranding the user on PFM, open the flow in a new tab and
      // poll our own listing for the new account. As soon as it appears we
      // refresh the UI and surface a "connected" flash.
      const popup = window.open(authUrl, '_blank');
      if (!popup) {
        // Popup blocked — fall back to full-page redirect
        window.location.href = authUrl;
        return;
      }

      const before = new Set(accounts.map((a) => a.platform));
      const startedAt = Date.now();
      const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
      const POLL_MS = 3000;

      const poll = async () => {
        if (Date.now() - startedAt > TIMEOUT_MS) {
          setBusyPlatform(null);
          return;
        }
        try {
          const state = await listPostForMeAccounts(user.id, true);
          const newAccount = state.accounts.find(
            (a) => a.platform === platform && !before.has(platform) && a.status !== 'disconnected'
          );
          if (newAccount) {
            setAccounts(state.accounts);
            setBusyPlatform(null);
            setFlash(`Connected ${platform.toUpperCase()}.`);
            setTimeout(() => setFlash(null), 4000);
            return;
          }
        } catch {
          // Network blip — keep polling
        }
        setTimeout(poll, POLL_MS);
      };
      setTimeout(poll, POLL_MS);
    } catch (err) {
      setError((err as Error).message);
      setBusyPlatform(null);
    }
  };

  const handleDisconnect = async (account: PostForMeAccount) => {
    if (!user) return;
    const confirmed = window.confirm(
      `Disconnect ${account.platform.toUpperCase()} (${account.username || account.id})?\n\nYou can reconnect anytime, but scheduled posts to this account will fail until you do.`
    );
    if (!confirmed) return;
    setBusyAccountId(account.id);
    setError(null);
    try {
      const result = await disconnectPostForMeAccount(user.id, account.id);
      setAccounts(result.accounts);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAccountId(null);
    }
  };

  // Hide accounts on platforms we don't support in-app
  const supportedIds = new Set(POSTFORME_PLATFORMS.map(p => p.id));
  const supportedAccounts = accounts.filter(a => supportedIds.has(a.platform as any));
  const connectedPlatformIds = new Set(supportedAccounts.map((a) => a.platform));
  const availablePlatforms = POSTFORME_PLATFORMS.filter((p) => !connectedPlatformIds.has(p.id));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Section marker + title */}
      <div className="t-micro mb-2">
        <span className="text-foreground">04</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>CONNECTIONS</span>
      </div>
      <h1
        className="text-foreground mb-12"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Where you{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>publish.</em>
      </h1>

      {/* Back to Office link */}
      <button
        onClick={() => navigate('/office')}
        className="t-micro mb-8 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
      >
        <ArrowRight className="w-3 h-3" style={{ transform: 'rotate(180deg)' }} />
        Back to Office
      </button>

      {/* Flash + error messages */}
      {flash && (
        <div className="mb-6 border border-border px-4 py-3 t-micro text-foreground" style={{ background: 'var(--card)' }}>
          ✓ {flash}
        </div>
      )}
      {error && (
        <div className="mb-6 border border-border px-4 py-3 t-micro" style={{ color: 'var(--destructive, #c44)' }}>
          {error}
        </div>
      )}

      {/* Connected accounts */}
      <div className="mb-12">
        <div className="flex items-center justify-between pb-3 border-b border-border mb-1">
          <span className="t-micro">CONNECTED · {String(supportedAccounts.length).padStart(2, '0')}</span>
          {!loading && (
            <button
              onClick={refresh}
              className="t-micro text-muted-foreground hover:text-foreground transition-colors"
            >
              REFRESH
            </button>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center t-micro">LOADING&hellip;</div>
        ) : supportedAccounts.length === 0 ? (
          <div className="py-10 text-center t-micro">NOTHING CONNECTED YET</div>
        ) : (
          <div>
            {supportedAccounts.map((account) => (
              <div
                key={account.id}
                className="grid gap-3 py-4 border-b border-border"
                style={{ gridTemplateColumns: '120px 1fr auto', alignItems: 'baseline' }}
              >
                <span className="t-micro">{account.platform.toUpperCase()}</span>
                <div>
                  <div
                    className="text-foreground font-medium"
                    style={{ fontSize: '14.5px', lineHeight: 1.35 }}
                  >
                    {account.username ? `@${account.username}` : account.displayName || account.id}
                  </div>
                  <div className="t-micro mt-0.5">
                    {account.isActive === false ? 'INACTIVE' : 'ACTIVE'} · VIA POST FOR ME
                  </div>
                </div>
                <button
                  onClick={() => handleDisconnect(account)}
                  disabled={busyAccountId === account.id}
                  className="t-micro text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  {busyAccountId === account.id ? 'DISCONNECTING…' : 'DISCONNECT'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available platforms */}
      <div>
        <div className="flex items-center justify-between pb-3 border-b border-border mb-1">
          <span className="t-micro">AVAILABLE · {String(availablePlatforms.length).padStart(2, '0')}</span>
        </div>

        {availablePlatforms.length === 0 ? (
          <div className="py-10 text-center t-micro">ALL PLATFORMS CONNECTED</div>
        ) : (
          <div>
            {availablePlatforms.map((platform) => (
              <div
                key={platform.id}
                className="grid gap-3 py-4 border-b border-border group"
                style={{ gridTemplateColumns: '120px 1fr auto', alignItems: 'baseline' }}
              >
                <span className="t-micro">{platform.name.toUpperCase()}</span>
                <div className="t-micro text-muted-foreground">VIA POST FOR ME</div>
                <button
                  onClick={() => handleConnect(platform.id)}
                  disabled={busyPlatform === platform.id}
                  className="t-micro text-foreground hover:text-accent transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {busyPlatform === platform.id ? 'OPENING…' : (
                    <>
                      CONNECT <ArrowRight className="w-3 h-3" />
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
