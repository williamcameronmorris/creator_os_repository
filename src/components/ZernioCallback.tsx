import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { completeZernioConnect } from '../lib/zernio';

/**
 * Handles the redirect back from Zernio after the user authorizes a platform.
 * URL pattern: /auth/zernio/callback?platform=tiktok&code=...&state=...
 *
 * Validates session matches the userId encoded in state (the edge function
 * does the cryptographic verification — we just pass it along).
 * On success, navigates to /office/connections so the user sees the new account.
 */
export function ZernioCallback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    if (!user) return;

    const platform = searchParams.get('platform');
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      ranOnce.current = true;
      setStatus('error');
      setErrorMsg(searchParams.get('error_description') || errorParam);
      return;
    }

    if (!platform || !code || !state) {
      ranOnce.current = true;
      setStatus('error');
      setErrorMsg('Missing platform, code, or state in callback URL');
      return;
    }

    ranOnce.current = true;
    completeZernioConnect({ userId: user.id, platform, code, state })
      .then(() => {
        navigate('/office/connections?connected=' + platform, { replace: true });
      })
      .catch((err: Error) => {
        setStatus('error');
        setErrorMsg(err.message);
      });
  }, [user, searchParams, navigate]);

  if (status === 'working') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-1.5 h-1.5 bg-foreground animate-pulse mx-auto mb-4" />
          <div className="t-micro">CONNECTING&hellip;</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="max-w-md text-center">
        <div className="t-micro mb-3 text-foreground">CONNECTION FAILED</div>
        <p className="text-foreground mb-6" style={{ fontSize: '15px', lineHeight: 1.5 }}>
          {errorMsg || 'Something went wrong while completing the connection.'}
        </p>
        <button
          onClick={() => navigate('/office/connections', { replace: true })}
          className="btn-ie"
        >
          <span className="btn-ie-text">Back to Connections</span>
        </button>
      </div>
    </div>
  );
}
