import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useConnectionStatus } from '../contexts/ConnectionStatusContext';
import {
  POSTFORME_PLATFORMS,
  initPostForMeConnect,
  listPostForMeAccounts,
  disconnectPostForMeAccount,
  type PostForMeAccount,
  type PostForMePlatformId,
} from '../lib/postforme';

interface Props {
  /**
   * Optional flash message from a parent (e.g. an OAuth callback redirect with
   * `?connected=instagram`). The component still emits its own flashes when
   * the in-app popup flow finishes.
   */
  initialFlash?: string | null;
}

export function PostForMeConnections({ initialFlash }: Props) {
  const { user } = useAuth();
  const ctx = useConnectionStatus();
  // Seed from the global ConnectionStatusProvider so we don't double-fetch
  // PFM's account list on every mount. The provider already loaded this
  // when the user signed in. Only fall back to a local fetch if the
  // provider hasn't finished yet (rare — first paint after sign-in).
  const [accounts, setAccounts] = useState<PostForMeAccount[]>(ctx.accounts);
  const [loading, setLoading] = useState(ctx.loading);
  const [busyPlatform, setBusyPlatform] = useState<string | null>(null);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(initialFlash ?? null);

  useEffect(() => {
    if (!user) return;
    if (ctx.loading) {
      refresh();
    } else {
      setAccounts(ctx.accounts);
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

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
      const popup = window.open(authUrl, '_blank');
      if (!popup) {
        window.location.href = authUrl;
        return;
      }

      const before = new Set(accounts.map((a) => a.platform));
      const startedAt = Date.now();
      const TIMEOUT_MS = 5 * 60 * 1000;
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
            // Keep the global ConnectionStatusProvider in sync so the
            // gate banner disappears immediately on other pages too.
            ctx.refresh();
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
      // Sync the global provider so the banner re-appears if this was
      // their last account.
      ctx.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyAccountId(null);
    }
  };

  const supportedIds = new Set(POSTFORME_PLATFORMS.map((p) => p.id));
  const supportedAccounts = accounts.filter(
    (a) => supportedIds.has(a.platform as PostForMePlatformId) && a.status !== 'disconnected'
  );
  const connectedPlatformIds = new Set(supportedAccounts.map((a) => a.platform));
  const availablePlatforms = POSTFORME_PLATFORMS.filter((p) => !connectedPlatformIds.has(p.id));

  return (
    <div>
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
                  <div className="text-foreground font-medium" style={{ fontSize: '14.5px', lineHeight: 1.35 }}>
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
