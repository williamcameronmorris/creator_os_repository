import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';

type AuthView = 'signin' | 'signup' | 'check-email' | 'forgot' | 'reset';

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
    return 'Use at least 10 characters for your password.';
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
  const [submittedEmail, setSubmittedEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const { signIn, signUp, resetPassword, updatePassword, passwordRecovery, endPasswordRecovery } = useAuth();

  useEffect(() => {
    if (passwordRecovery || searchParams.get('reset') === 'true') {
      setView('reset');
    }
  }, [passwordRecovery, searchParams]);

  // Tick the resend cooldown down once a second
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      if (view === 'signup') {
        if (password.length < 10) {
          setError('Use at least 10 characters for your password.');
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          return;
        }
        await signUp(email, password);
        // Transition to the "check your inbox" screen. If the Supabase project
        // has email confirmation OFF, the AuthContext session listener will
        // sign the user in and the app will redirect past this screen before
        // it really renders. If email confirmation is ON, this is what they
        // see while waiting on the link.
        setSubmittedEmail(email);
        setPassword('');
        setConfirmPassword('');
        setView('check-email');
        setResendCooldown(60); // Supabase's stock rate-limit window
      } else if (view === 'signin') {
        await signIn(email, password);
      }
    } catch (err: any) {
      setError(friendlyAuthError(err.message || 'An error occurred', view));
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !submittedEmail) return;
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: submittedEmail,
      });
      if (resendError) throw resendError;
      setSuccess('Sent. Check your inbox.');
      setResendCooldown(60);
    } catch (err: any) {
      setError(friendlyAuthError(err.message || 'An error occurred', 'check-email'));
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
    if (newPassword.length < 10) {
      setError('Use at least 10 characters for your password.');
      return;
    }
    setLoading(true);
    try {
      await updatePassword(newPassword);
      setSuccess('Password updated. Taking you in…');
      // Full reload: clears the recovery flag and the `?reset=true` query in
      // one move, and lands on the home route with a fresh session.
      setTimeout(() => { window.location.replace('/'); }, 1500);
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

  // Section marker label per view
  const sectionLabel =
    view === 'reset' ? 'RESET'
    : view === 'forgot' ? 'RECOVER'
    : view === 'signup' ? 'SIGN UP'
    : view === 'check-email' ? 'CONFIRM EMAIL'
    : 'SIGN IN';

  return (
    <div style={pageStyle} className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Section marker */}
        <div className="t-micro mb-2">
          <span className="text-foreground">00</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>{sectionLabel}</span>
        </div>

        {/* Editorial heading */}
        <h1
          className="text-foreground mb-3"
          style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
        >
          {view === 'signup' ? (
            <>Start your <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>command.</em></>
          ) : view === 'check-email' ? (
            <>Check your <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>inbox.</em></>
          ) : view === 'forgot' ? (
            <>Recover the <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>keys.</em></>
          ) : view === 'reset' ? (
            <>Set a new <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>password.</em></>
          ) : (
            <>Welcome <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>back.</em></>
          )}
        </h1>
        {view !== 'check-email' && (
          <p className="t-body mb-10" style={{ maxWidth: '34ch' }}>
            {view === 'forgot'
              ? 'Enter your email and we’ll send instructions to reset your password.'
              : view === 'reset'
              ? 'Choose a new password to finish resetting your account.'
              : 'Your content studio and business office, unified.'}
          </p>
        )}

        {/* ── CHECK-EMAIL VIEW ────────────────────────────────────── */}
        {view === 'check-email' && (
          <>
            <div className="mb-6">
              <p className="t-body mb-1">We sent a confirmation link to</p>
              <p className="text-foreground font-medium break-all" style={{ fontSize: '1.0625rem' }}>
                {submittedEmail}
              </p>
            </div>
            <p className="t-body mb-8" style={{ maxWidth: '38ch' }}>
              Click the link in the email to finish creating your account. Check your spam folder if it’s not in your inbox within a minute.
            </p>

            {error && <p className="t-micro mb-4" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>}
            {success && <p className="t-micro mb-4" style={{ color: 'var(--accent)' }}>✓ {success}</p>}

            <button
              type="button"
              onClick={handleResend}
              disabled={resendCooldown > 0 || loading}
              className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="btn-ie-text">
                {loading
                  ? 'Sending…'
                  : resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : 'Resend confirmation'}
              </span>
            </button>

            <div className="mt-8 pt-6 border-t border-border text-center">
              <button
                type="button"
                onClick={() => {
                  setView('signin');
                  setError('');
                  setSuccess('');
                  setSubmittedEmail('');
                }}
                className="t-micro text-muted-foreground hover:text-foreground transition-colors"
              >
                BACK TO SIGN IN
              </button>
            </div>
          </>
        )}

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
                <span className="btn-ie-text">{loading ? 'Sending…' : 'Send reset instructions'}</span>
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
                minLength={10}
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
                minLength={10}
              />
            </div>
            {error && <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>}
            {success && <p className="t-micro" style={{ color: 'var(--accent)' }}>✓ {success}</p>}
            <button
              type="submit"
              disabled={loading}
              className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="btn-ie-text">{loading ? 'Updating…' : 'Update password'}</span>
              {!loading && <ArrowRight className="w-3 h-3" />}
            </button>
            {passwordRecovery && (
              <div className="pt-6 border-t border-border text-center">
                <button
                  type="button"
                  onClick={endPasswordRecovery}
                  className="t-micro text-muted-foreground hover:text-foreground transition-colors"
                >
                  KEEP MY CURRENT PASSWORD
                </button>
              </div>
            )}
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
                  autoComplete={view === 'signup' ? 'new-password' : 'current-password'}
                  minLength={view === 'signup' ? 10 : undefined}
                />
                {view === 'signup' && (
                  <p className="t-micro mt-2 text-muted-foreground" style={{ textTransform: 'none', letterSpacing: 0 }}>
                    10 characters or more. A short sentence works well.
                  </p>
                )}
              </div>

              {view === 'signup' && (
                <div>
                  <label htmlFor="confirm-signup-password" className="t-micro block mb-2">CONFIRM PASSWORD</label>
                  <input
                    id="confirm-signup-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                    minLength={10}
                  />
                </div>
              )}

              {error && <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>}
              {success && <p className="t-micro" style={{ color: 'var(--accent)' }}>✓ {success}</p>}

              <button
                type="submit"
                disabled={loading}
                className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span className="btn-ie-text">
                  {loading ? 'Loading…' : view === 'signup' ? 'Create account' : 'Sign in'}
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

        {/* Footer: brand mark and the two pages every platform review asks for */}
        <div className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 t-micro text-muted-foreground">
          <span>CLIOPATRA SOCIAL · v1</span>
          <Link to="/privacy" className="hover:text-foreground transition-colors">PRIVACY</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">TERMS</Link>
        </div>

      </div>
    </div>
  );
}
