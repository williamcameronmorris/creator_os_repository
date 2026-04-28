import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Handles the redirect back from Post for Me after the user authorizes a platform.
 * Post for Me handles the OAuth exchange itself; this page just confirms the
 * session and forwards the user to /office/connections.
 *
 * URL pattern: /auth/postforme/callback?platform=tiktok[&error=...]
 */
export function PostForMeCallback() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    if (!user) return;

    const platform = searchParams.get('platform') || '';
    const errorParam = searchParams.get('error');

    if (errorParam) {
      ranOnce.current = true;
      setStatus('error');
      setErrorMsg(searchParams.get('error_description') || errorParam);
      return;
    }

    ranOnce.current = true;
    navigate('/office/connections?connected=' + encodeURIComponent(platform), { replace: true });
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
