import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

/**
 * YoutubeCallback
 *
 * Handles the OAuth redirect from Google after the user grants YouTube permissions.
 * URL pattern: /auth/youtube/callback?code=ABC123
 *
 * Flow:
 *   1. Extract `code` from URL params
 *   2. Call the youtube-auth Supabase Edge Function to exchange code for tokens
 *   3. Show success/error with channel info and redirect to /settings
 */
export function YoutubeCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting your YouTube channel...');
  const [channel, setChannel] = useState<{ name: string; subscribers: number } | null>(null);

  const code = searchParams.get('code');
  const oauthError = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  useEffect(() => {
    if (oauthError) {
      setStatus('error');
      setMessage(errorDescription || 'YouTube authorization was denied or cancelled.');
      setTimeout(() => navigate('/settings'), 4000);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received from Google.');
      setTimeout(() => navigate('/settings'), 4000);
      return;
    }

    if (!user) {
      // Auth not loaded yet — wait for re-render
      return;
    }

    const handleExchange = async () => {
      try {
        setMessage('Exchanging authorization code for access tokens...');

        const redirectUri = `${window.location.origin}/auth/youtube/callback`;

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/youtube-auth`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({ code, redirect_uri: redirectUri, userId: user.id }),
          }
        );

        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to connect YouTube account.');
        }

        setChannel(data.channel || null);
        setStatus('success');
        setMessage(
          data.channel?.name
            ? `Connected! "${data.channel.name}" linked successfully. Your videos are syncing now.`
            : 'YouTube channel connected successfully.'
        );

        setTimeout(() => navigate('/settings'), 3000);
      } catch (err: any) {
        setStatus('error');
        setMessage((err as Error).message || 'Failed to connect YouTube account. Please try again.');
        setTimeout(() => navigate('/settings'), 5000);
      }
    };

    handleExchange();
  }, [code, oauthError, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatSubscribers = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
        {/* YouTube logo */}
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">
          {status === 'loading' && 'Connecting YouTube'}
          {status === 'success' && 'Connected!'}
          {status === 'error' && 'Connection Failed'}
        </h2>

        <div className="flex justify-center my-4">
          {status === 'loading' && (
            <Loader className="w-8 h-8 text-red-500 animate-spin" />
          )}
          {status === 'success' && (
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          )}
          {status === 'error' && (
            <AlertCircle className="w-8 h-8 text-destructive" />
          )}
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>

        {status === 'success' && channel && (
          <div className="mt-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border">
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">{channel.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSubscribers(channel.subscribers)} subscribers
                </p>
              </div>
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          {status === 'loading' ? 'Please wait...' : 'Redirecting to Settings...'}
        </p>
      </div>
    </div>
  );
}
