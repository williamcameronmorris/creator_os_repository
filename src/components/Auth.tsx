import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';

type AuthView = 'signin' | 'signup' | 'forgot' | 'reset';

// Map raw Supabase error messages to user-friendly copy
function friendlyAuthError(message: string, _view: AuthView): string {
  const m = message.toLowerCase();
  if (m.includes('only request this after') || m.includes('for security purposes')) {
    const seconds = message.match(/after (\d+) second/)?.[1];
    return seconds
      ? `Please wait ${seconds} seconds before trying again.`
      : 'Please wait a moment before trying again.';
  }
  if (m.includes('user already registered') || m.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Incorrect email or password.';
  }
  if (m.includes('email not confirmed')) {
    return 'Please check your inbox and confirm your email before signing in.';
  }
  if (m.includes('password should be at least')) {
    return 'Password must be at least 6 characters.';
  }
  if (m.includes('unable to validate email address') || m.includes('invalid email')) {
    return 'Please enter a valid email address.';
  }
  if (m.includes('signup is disabled')) {
    return 'New sign-ups are temporarily disabled. Please try again later.';
  }
  return message.replace(/^\[.*?\]\s*/, '');
}

export function Auth() {
  const [searchParams] = useSearchParams();
  const [view, setView] = useState<AuthView>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp, resetPassword, updatePassword } = useAuth();

  useEffect(() => {
    if (searchParams.get('reset') === 'true') {
      setView('reset');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (view === 'signup') await signUp(email, password);
      else if (view === 'signin') await signIn(email, password);
    } catch (err: any) {
      setError(friendlyAuthError(err.message || 'An error occurred', view));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await resetPassword(email);
      setSuccess('Password reset instructions sent to your email');
      setEmail('');
    } catch (err: any) {
      setError(friendlyAuthError(err.message || 'An error occurred', 'forgot'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      setSuccess('Password updated successfully. Redirecting…');
      setTimeout(() => { window.location.href = '/dashboard'; }, 2000);
    } catch (err: any) {
      setError(friendlyAuthError(err.message || 'An error occurred', 'reset'));
    } finally {
      setLoading(false);
    }
  };

  // Reusable input styling
  const inputClass =
    'w-full bg-transparent border border-border px-3 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent transition-colors';

  // Force the cream editorial background regardless of theme state
  const pageStyle: React.CSSProperties = {
    background: 'var(--background, #F7F4EE)',
    color: 'var(--foreground, #1a1a1a)',
    minHeight: '100vh',
  };

  return (
    <div style={pageStyle} className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Section marker */}
        <div className="t-micro mb-2">
          <span className="text-foreground">00</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>{view === 'reset' ? 'RESET' : view === 'forgot' ? 'RECOVER' : view === 'signup' ? 'SIGN UP' : 'SIGN IN'}</span>
        </div>

        {/* Editorial heading */}
        <h1
          className="text-foreground mb-3"
          style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          {view === 'signup' ? (
            <>Start your <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>command.</em></>
          ) : view === 'forgot' ? (
            <>Recover the <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>keys.</em></>
          ) : view === 'reset' ? (
            <>Set a new <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>password.</em></>
          ) : (
            <>Welcome <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>back.</em></>
          )}
        </h1>
        <p className="t-body mb-10" style={{ maxWidth: '34ch' }}>
          {view === 'forgot'
            ? 'Enter your email and we’ll send instructions to reset your password.'
            : view === 'reset'
            ? 'Choose a new password to finish resetting your account.'
            : 'Your content studio and business office, unified.'}
        </p>

        {/* ── FORGOT VIEW ─────────────────────────────────────────── */}
        {view === 'forgot' && (
          <>
            <button
              onClick={() => { setView('signin'); setError(''); setSuccess(''); }}
              className="t-micro mb-6 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-3 h-3" />
              BACK TO SIGN IN
            </button>

            <form onSubmit={handleForgotPassword} className="space-y-6">
              <div>
                <label htmlFor="reset-email" className="t-micro block mb-2">EMAIL</label>
                <input
                  id="reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  required
                />
              </div>
              {error && <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>}
              {success && <p className="t-micro" style={{ color: 'var(--accent)' }}>✓ {success}</p>}
              <button
                type="submit"
                disabled={loading}
                className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span className="btn-ie-text">{loading ? 'SENDING…' : 'SEND RESET INSTRUCTIONS'}</span>
                {!loading && <ArrowRight className="w-3 h-3" />}
              </button>
            </form>
          </>
        )}

        {/* ── RESET VIEW ──────────────────────────────────────────── */}
        {view === 'reset' && (
          <form onSubmit={handleUpdatePassword} className="space-y-6">
            <div>
              <label htmlFor="new-password" className="t-micro block mb-2">NEW PASSWORD</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="t-micro block mb-2">CONFIRM PASSWORD</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>
            {error && <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>}
            {success && <p className="t-micro" style={{ color: 'var(--accent)' }}>✓ {success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="btn-ie-text">{loading ? 'UPDATING…' : 'UPDATE PASSWORD'}</span>
              {!loading && <ArrowRight className="w-3 h-3" />}
            </button>
          </form>
        )}

        {/* ── SIGNIN / SIGNUP VIEW ────────────────────────────────── */}
        {(view === 'signin' || view === 'signup') && (
          <>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="email" className="t-micro block mb-2">EMAIL</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="password" className="t-micro">PASSWORD</label>
                  {view === 'signin' && (
                    <button
                      type="button"
                      onClick={() => { setView('forgot'); setError(''); setSuccess(''); }}
                      className="t-micro text-muted-foreground hover:text-foreground transition-colors"
                    >
                      FORGOT?
                    </button>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="••••••••"
                  required
                  minLength={6}
                />
              </div>

              {error && <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>}
              {success && <p className="t-micro" style={{ color: 'var(--accent)' }}>✓ {success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span className="btn-ie-text">
                  {loading ? 'LOADING…' : view === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
                </span>
                {!loading && <ArrowRight className="w-3 h-3" />}
              </button>
            </form>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <button
                type="button"
                onClick={() => {
                  setView(view === 'signin' ? 'signup' : 'signin');
                  setError(''); setSuccess('');
                }}
                className="t-micro text-muted-foreground hover:text-foreground transition-colors"
              >
                {view === 'signup' ? 'ALREADY HAVE AN ACCOUNT? SIGN IN' : 'DON’T HAVE AN ACCOUNT? SIGN UP'}
              </button>
            </div>
          </>
        )}

        {/* Footer brand mark */}
        <div className="mt-12 t-micro text-muted-foreground">
          CLIOPATRA SOCIAL · v1
        </div>

      </div>
    </div>
  );
}
