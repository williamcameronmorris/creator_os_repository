import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { exchangeMetaCode, type MetaPage } from '../lib/meta';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';

/**
 * MetaCallback
 *
 * Handles the OAuth redirect from Facebook after the user grants permissions.
 * URL pattern: /auth/meta/callback?code=ABC123&state=...
 *
 * Flow:
 *   1. Extract `code` from URL params
 *   2. Call the meta-auth Supabase Edge Function to exchange code for tokens
 *   3. Show success/error and redirect to /settings
 */
export function MetaCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Connecting your Meta account...');
  const [pages, setPages] = useState<MetaPage[]>([]);

  // Pull params at component level so they can be used in dep array
  const code = searchParams.get('code');
  const oauthError = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  useEffect(() => {
    if (oauthError) {
      setStatus('error');
      setMessage(errorDescription || 'Meta authorization was denied or cancelled.');
      setTimeout(() => navigate('/settings'), 4000);
      return;
    }

    if (!code) {
      setStatus('error');
      setMessage('No authorization code received from Meta.');
      setTimeout(() => navigate('/settings'), 4000);
      return;
    }

    if (!user) {
      // Auth not loaded yet — wait for useEffect to re-run
      return;
    }

    const handleExchange = async () => {
      try {
        setMessage('Exchanging authorization code for access tokens...');
        const result = await exchangeMetaCode(code, user.id);

        setPages(result.pages || []);
        setStatus('success');
        setMessage(
          result.primaryPage
            ? `Connected! Facebook Page "${result.primaryPage.name}" and Instagram linked successfully.`
            : 'Meta account connected successfully.'
        );

        // Fire-and-forget: trigger instagram-sync so analytics populate immediately
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ userId: user.id }),
        }).catch(() => {});

        setTimeout(() => navigate('/settings'), 3000);
      } catch (err: any) {
        setStatus('error');
        setMessage((err as Error).message || 'Failed to connect Meta account. Please try again.');
        setTimeout(() => navigate('/settings'), 5000);
      }
    };

    handleExchange();
  }, [code, oauthError, user]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl p-8 text-center shadow-lg">
        {/* Meta / Facebook logo area */}
        <div className="flex items-center justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-md">
            <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
          </div>
        </div>

        <h2 className="text-xl font-bold text-foreground mb-2">
          {status === 'loading' && 'Connecting Meta Account'}
          {status === 'success' && 'Connected!'}
          {status === 'error' && 'Connection Failed'}
        </h2>

        {/* Status icon */}
        <div className="flex justify-center my-4">
          {status === 'loading' && (
            <Loader className="w-8 h-8 text-blue-500 animate-spin" />
          )}
          {status === 'success' && (
            <CheckCircle className="w-8 h-8 text-emerald-500" />
          )}
          {status === 'error' && (
            <AlertCircle className="w-8 h-8 text-destructive" />
          )}
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>

        {/* Show connected pages on success */}
        {status === 'success' && pages.length > 0 && (
          <div className="mt-4 text-left space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Connected Pages
            </p>
            {pages.map((page) => (
              <div
                key={page.id}
                className="flex items-center justify-between p-3 rounded-xl bg-secondary border border-border"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{page.name}</p>
                  {page.instagramUsername && (
                    <p className="text-xs text-muted-foreground">
                      Instagram: @{page.instagramUsername}
                    </p>
                  )}
                </div>
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          {status === 'loading' ? 'Please wait...' : 'Redirecting to Settings...'}
        </p>
      </div>
    </div>
  );
}
