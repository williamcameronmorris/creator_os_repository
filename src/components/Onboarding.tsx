import { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { supabase, type Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useConnectionStatus } from '../contexts/ConnectionStatusContext';
import { PostForMeConnections } from './PostForMeConnections';

/**
 * First-time user onboarding flow. Replaces the pricing-era Onboarding that
 * captured CPM tier / performance averages (now archived).
 *
 * Three internal steps, driven off `profile.onboarding_step`:
 *
 *   1. name_niche  — capture first name + niche (mandatory, written to DB
 *                    and used by Clio's system prompts).
 *   2. connect     — encourage at least one Post for Me connection. Stub
 *                    today (Continue →); replaced in the connection-gate
 *                    task with the real connection list + skip logic.
 *   3. walkthrough — quick "here's what Clio does" pitch. Stub today;
 *                    replaced with sample-prompt + dismiss card later.
 *
 * Each step writes to profiles + advances `onboarding_step`, then calls
 * `onComplete` so App.tsx re-fetches the profile and re-renders this
 * component on the new step. When step becomes 'done', App.tsx routes
 * past Onboarding entirely.
 */

interface Props {
  onComplete: () => void | Promise<void>;
}

export function Onboarding({ onComplete }: Props) {
  const { user } = useAuth();
  const { hasConnected, refresh: refreshConnections } = useConnectionStatus();
  const [profile, setProfile] = useState<Partial<Profile> | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 inputs
  const [firstName, setFirstName] = useState('');
  const [niche, setNiche] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (data) {
        setProfile(data);
        // Pre-fill if the user already typed something and bounced
        if (data.first_name) setFirstName(data.first_name);
        if (data.niche_preference) setNiche(data.niche_preference);
      }
      setLoading(false);
    })();
  }, [user]);

  const advance = async (updates: Partial<Profile>) => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);
      if (updateError) throw updateError;
      await onComplete();
    } catch (err) {
      setError((err as Error).message || 'Something went wrong. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = firstName.trim();
    const trimmedNiche = niche.trim();
    if (!trimmedName) {
      setError('Please enter your first name.');
      return;
    }
    if (!trimmedNiche) {
      setError('Please describe your niche in a few words.');
      return;
    }
    await advance({
      first_name: trimmedName,
      niche_preference: trimmedNiche,
      onboarding_step: 'connect',
    });
  };

  const handleStep2Continue = async () => {
    // Pull the latest connection state in case PostForMeConnections finished
    // a popup-based connect flow but the provider hasn't re-fetched yet.
    await refreshConnections();
    await advance({ onboarding_step: 'walkthrough' });
  };

  const handleStep3Finish = async () => {
    await advance({ onboarding_step: 'done', onboarding_completed: true });
  };

  // ── Layout chrome (shared across steps) ──────────────────────────────────

  const inputClass =
    'w-full bg-transparent border border-border px-3 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-accent transition-colors';

  const pageStyle: React.CSSProperties = {
    background: 'var(--background, #F7F4EE)',
    color: 'var(--foreground, #1a1a1a)',
    minHeight: '100vh',
  };

  if (loading || !profile) {
    return (
      <div style={pageStyle} className="flex items-center justify-center">
        <div className="w-1.5 h-1.5 bg-foreground animate-pulse" />
      </div>
    );
  }

  const step = profile.onboarding_step ?? 'name_niche';

  // 0/3 → 3/3 progress label
  const stepNumber =
    step === 'name_niche' ? 1 : step === 'connect' ? 2 : step === 'walkthrough' ? 3 : 3;

  return (
    <div style={pageStyle} className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Section marker */}
        <div className="t-micro mb-2">
          <span className="text-foreground">0{stepNumber}</span>
          <span className="mx-2 text-muted-foreground">/</span>
          <span>03 · {step === 'name_niche' ? 'YOU' : step === 'connect' ? 'CONNECT' : 'CLIO'}</span>
        </div>

        {/* ── STEP 1 · name + niche ───────────────────────────────────── */}
        {step === 'name_niche' && (
          <>
            <h1
              className="text-foreground mb-3"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
            >
              Tell us <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>who you are.</em>
            </h1>
            <p className="t-body mb-10" style={{ maxWidth: '36ch' }}>
              Clio uses your niche to suggest content ideas, scripts, and angles tailored to your audience.
            </p>

            <form onSubmit={handleStep1Submit} className="space-y-6">
              <div>
                <label htmlFor="first-name" className="t-micro block mb-2">FIRST NAME</label>
                <input
                  id="first-name"
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className={inputClass}
                  placeholder="Cam"
                  autoFocus
                  required
                  maxLength={60}
                />
              </div>

              <div>
                <label htmlFor="niche" className="t-micro block mb-2">YOUR NICHE</label>
                <input
                  id="niche"
                  type="text"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  className={inputClass}
                  placeholder="e.g. fingerstyle guitar tutorials"
                  required
                  maxLength={140}
                />
                <p className="t-micro mt-2 text-muted-foreground" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  Be specific — &ldquo;personal finance for new parents&rdquo; gives Clio more to work with than &ldquo;finance.&rdquo;
                </p>
              </div>

              {error && (
                <p className="t-micro" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span className="btn-ie-text">{submitting ? 'SAVING…' : 'CONTINUE'}</span>
                {!submitting && <ArrowRight className="w-3 h-3" />}
              </button>
            </form>
          </>
        )}

        {/* ── STEP 2 · connect ────────────────────────────────────────── */}
        {step === 'connect' && (
          <>
            <h1
              className="text-foreground mb-3"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
            >
              Connect a <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>platform.</em>
            </h1>
            <p className="t-body mb-10" style={{ maxWidth: '40ch' }}>
              Clio can&rsquo;t schedule posts or read real performance data until you connect at least one social account. You can add more later.
            </p>

            <PostForMeConnections />

            {error && (
              <p className="t-micro mb-6 mt-6" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>
            )}

            <div className="mt-8">
              <button
                type="button"
                onClick={handleStep2Continue}
                disabled={submitting}
                className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <span className="btn-ie-text">
                  {submitting
                    ? 'SAVING…'
                    : hasConnected
                    ? 'CONTINUE'
                    : 'CONTINUE WITHOUT CONNECTING'}
                </span>
                {!submitting && <ArrowRight className="w-3 h-3" />}
              </button>
              {!hasConnected && !submitting && (
                <p className="t-micro mt-3 text-muted-foreground text-center" style={{ textTransform: 'none', letterSpacing: 0 }}>
                  You&rsquo;ll see a reminder inside the app until you connect one.
                </p>
              )}
            </div>
          </>
        )}

        {/* ── STEP 3 · walkthrough (stub) ─────────────────────────────── */}
        {step === 'walkthrough' && (
          <>
            <h1
              className="text-foreground mb-3"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
            >
              Meet <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>Clio.</em>
            </h1>
            <p className="t-body mb-10" style={{ maxWidth: '38ch' }}>
              Clio is your content brain. Ask for video ideas, write scripts, plan your week — all powered by your niche.
            </p>

            <p className="t-micro mb-6 text-muted-foreground" style={{ textTransform: 'none', letterSpacing: 0 }}>
              Walkthrough is wiring up next. For now, finish onboarding and you&rsquo;ll land on Clio&rsquo;s home screen.
            </p>

            {error && (
              <p className="t-micro mb-6" style={{ color: 'var(--destructive, #c44)' }}>{error}</p>
            )}

            <button
              type="button"
              onClick={handleStep3Finish}
              disabled={submitting}
              className="btn-ie btn-ie-solid w-full disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span className="btn-ie-text">{submitting ? 'FINISHING…' : 'TAKE ME TO CLIO'}</span>
              {!submitting && <ArrowRight className="w-3 h-3" />}
            </button>
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
