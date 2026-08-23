import { useEffect, useState } from 'react';
import { Youtube, AlertTriangle, Check } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Button } from './ui/Button';
import { startYouTubeConnect, isYouTubeOAuthConfigured } from '../lib/youtubeOAuth';

/**
 * The direct Google grant for YouTube, shown alongside the Post for Me
 * connections but deliberately kept distinct from them.
 *
 * Post for Me publishes and supplies per-post metrics for all five platforms.
 * It exposes no follower or subscriber field anywhere in its API, so this grant
 * exists for exactly one number. Presenting them as the same connection would
 * make "YouTube is connected" mean two different things depending on which half
 * of the page you were looking at.
 */
export function YouTubeAnalyticsConnect() {
  const { user } = useAuth();
  const [handle, setHandle] = useState<string | null>(null);
  const [subs, setSubs] = useState<number | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [hasToken, setHasToken] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    supabase
      .from('profiles')
      .select('youtube_handle, youtube_followers, last_youtube_sync, youtube_refresh_token')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setHandle(data?.youtube_handle || null);
        setSubs(data?.youtube_followers ?? null);
        setLastSync(data?.last_youtube_sync ?? null);
        setHasToken(Boolean(data?.youtube_refresh_token));
        setLoading(false);
      });
  }, [user]);

  if (loading) return null;

  // A sync that has not run in over two days means the grant is failing even
  // though a token is on file — which is exactly the state Google leaves behind
  // when it revokes a refresh token issued by an app still in Testing mode.
  const staleDays = lastSync
    ? Math.floor((Date.now() - new Date(lastSync).getTime()) / 86_400_000)
    : null;
  const isStale = staleDays === null || staleDays > 2;
  const needsAttention = !hasToken || isStale;

  return (
    <section className="border border-border bg-card mt-8">
      <header className="px-5 pt-5 pb-4 border-b border-border">
        <p className="t-micro">Analytics connection</p>
        <div className="flex items-start gap-3 mt-2">
          <Youtube className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground" />
          <div className="min-w-0">
            <h2 className="text-base font-semibold">YouTube subscriber count</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Separate from publishing above. Post for Me handles posts and their
              metrics, but reports no subscriber count, so this grant supplies it.
            </p>
          </div>
        </div>
      </header>

      <div className="px-5 py-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {needsAttention ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            {hasToken ? 'Connected, but not syncing' : 'Not connected'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 text-sm">
            <Check className="w-4 h-4" />
            {handle ? `@${handle}` : 'Connected'}
          </span>
        )}

        {subs !== null && subs > 0 && (
          <span className="t-micro tabular-nums">{subs.toLocaleString()} subscribers</span>
        )}
        {lastSync && (
          <span className="t-micro">
            Synced {staleDays === 0 ? 'today' : `${staleDays}d ago`}
          </span>
        )}
      </div>

      {needsAttention && (
        <div
          className="px-5 py-4"
          style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
        >
          <p className="text-sm leading-relaxed">
            Publish the Google OAuth consent screen to Production{' '}
            <strong>before</strong> reconnecting. While it sits in Testing, Google
            expires every refresh token after seven days, so a fresh connection
            breaks again within the week.
          </p>
        </div>
      )}

      <div className="px-5 py-4 border-t border-border">
        {isYouTubeOAuthConfigured() ? (
          <Button onClick={startYouTubeConnect}>
            {hasToken ? 'Reconnect YouTube' : 'Connect YouTube'}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Set <code className="t-mono">VITE_YOUTUBE_CLIENT_ID</code> to enable this
            connection.
          </p>
        )}
      </div>
    </section>
  );
}
