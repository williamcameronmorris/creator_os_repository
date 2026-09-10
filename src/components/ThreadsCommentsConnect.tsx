import { useEffect, useState } from 'react';
import { MessageCircle, AlertTriangle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { getThreadsAuthUrl } from '../lib/meta';
import { assessGrant, DIRECT_GRANTS } from '../lib/tokenHealth';

/**
 * The direct Threads grant, shown alongside the Post for Me connections but
 * deliberately kept distinct from them.
 *
 * Post for Me publishes to Threads and reports each post's metrics. The only
 * thing it cannot do is read replies, so Threads comments in the inbox come
 * from this grant (fetch-comments). Its token lasts 60 days and refresh-tokens
 * renews it nightly while it is still valid; one that has lapsed cannot be
 * refreshed and has to be reconnected here. Until this card existed there was
 * no way to do that in the app: the connect button went with the PostForMe
 * migration, so the token-health banner pointed at a page with nothing on it.
 */
export function ThreadsCommentsConnect() {
  const { user } = useAuth();
  const [handle, setHandle] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      // token_health carries derived booleans + expiry only, so the raw
      // token never reaches the browser.
      const [{ data: health }, { data: profile }] = await Promise.all([
        supabase
          .from('token_health')
          .select('threads_connected, threads_token_expires_at')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('threads_handle, last_threads_sync')
          .eq('id', user.id)
          .maybeSingle(),
      ]);
      if (!active) return;
      setConnected(Boolean(health?.threads_connected));
      setExpiresAt(health?.threads_token_expires_at ?? null);
      setHandle(profile?.threads_handle || null);
      setLastSync(profile?.last_threads_sync ?? null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading) return null;

  const grant = DIRECT_GRANTS.find((g) => g.platform === 'threads');
  const status = grant ? assessGrant(grant, connected, expiresAt).status : connected ? 'connected' : 'missing';
  const expired = status === 'expired';
  const needsAttention = !connected || expired;

  const staleDays = lastSync
    ? Math.floor((Date.now() - new Date(lastSync).getTime()) / 86_400_000)
    : null;

  const startConnect = () => {
    try {
      window.location.href = getThreadsAuthUrl();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="border border-border bg-card mt-8">
      <header className="px-5 pt-5 pb-4 border-b border-border">
        <p className="t-micro">Inbox connection</p>
        <div className="flex items-start gap-3 mt-2">
          <MessageCircle className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Threads comments</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Separate from publishing above. Post for Me publishes to Threads and
              reports post metrics, but cannot read replies, so comments in the
              inbox come from this grant.
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {needsAttention ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            {connected ? 'Connected, but the token has expired' : 'Not connected'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm">
            <Check className="w-4 h-4" />
            {handle ? `@${handle}` : 'Connected'}
          </span>
        )}

        {expiresAt && !expired && (
          <span className="t-micro">
            Renews before {new Date(expiresAt).toLocaleDateString()}
          </span>
        )}
        {lastSync && (
          <span className="t-micro">
            Comments synced {staleDays === 0 ? 'today' : `${staleDays}d ago`}
          </span>
        )}
      </div>

      {expired && (
        <div
          className="px-5 py-4"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <p className="text-sm leading-relaxed">
            Threads tokens last 60 days and renew on their own while valid. This one
            lapsed
            {expiresAt ? ` on ${new Date(expiresAt).toLocaleDateString()}` : ''}, and a
            lapsed token cannot be refreshed, so reconnect once. Posting and metrics
            were never affected; they run through Post for Me.
          </p>
        </div>
      )}

      <div className="px-5 py-4 border-t border-border">
        <Button onClick={startConnect}>
          {connected ? 'Reconnect Threads' : 'Connect Threads'}
        </Button>
        {error && <p className="text-sm text-destructive mt-3">{error}</p>}
      </div>
    </section>
  );
}
