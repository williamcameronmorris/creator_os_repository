import { useState } from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import type { ChallengeTrack } from '../../hooks/useChallenge';

interface BaselineFormProps {
  track: ChallengeTrack;
  onSubmit: (values: Record<string, number>) => Promise<void> | void;
  onSkip?: () => void; // optional escape hatch — saves zeros
  onBack?: () => void; // e.g., re-pick track (not typical, but available)
}

/**
 * BaselineForm — captures the starting numbers before the challenge actually kicks off.
 * Reads metric schema from the track's metric_definitions column.
 */
export function BaselineForm({ track, onSubmit, onSkip, onBack }: BaselineFormProps) {
  const initial: Record<string, string> = Object.fromEntries(
    track.metric_definitions.map((m) => [m.key, ''])
  );
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allFilled = track.metric_definitions.every((m) => values[m.key] !== '' && !Number.isNaN(Number(values[m.key])));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allFilled) {
      setError('Fill every metric. Use 0 if you have none yet.');
      return;
    }
    const parsed: Record<string, number> = {};
    for (const m of track.metric_definitions) {
      parsed[m.key] = Number(values[m.key]);
    }
    setSubmitting(true);
    try {
      await onSubmit(parsed);
    } catch (e: any) {
      setError(e?.message || 'Could not save baseline.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!onSkip) return;
    const zeros: Record<string, number> = Object.fromEntries(
      track.metric_definitions.map((m) => [m.key, 0])
    );
    setSubmitting(true);
    try {
      await onSubmit(zeros);
      onSkip();
    } catch (e: any) {
      setError(e?.message || 'Could not save baseline.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="t-micro text-muted-foreground mb-2">Baseline · Day 0 · {track.name}</div>
      <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mb-3">
        Where you are today.
      </h1>
      <p className="t-body text-muted-foreground mb-8 max-w-xl">
        Write down the numbers as they stand right now. You&rsquo;ll re-capture these at days 7, 14,
        21, and 30 so you can see the actual shape of your progress.
      </p>

      {error && (
        <div className="card-industrial p-4 mb-6 text-sm text-destructive border-destructive/40">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card-industrial p-8">
        <div className="space-y-6">
          {track.metric_definitions.map((m) => (
            <div key={m.key}>
              <label htmlFor={`metric-${m.key}`} className="block">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="t-micro text-muted-foreground">{m.label}</span>
                  {m.hint && <span className="t-micro text-muted-foreground/70">{m.hint}</span>}
                </div>
                <input
                  id={`metric-${m.key}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values[m.key]}
                  onChange={(e) => setValues((v) => ({ ...v, [m.key]: e.target.value }))}
                  placeholder="0"
                  className="w-full bg-input border border-border text-foreground text-xl md:text-2xl font-medium tracking-tight px-4 py-3 focus:outline-none focus:border-foreground transition-colors"
                  required
                />
              </label>
            </div>
          ))}
        </div>

        <div className="mt-10 flex items-center justify-between gap-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={submitting}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors t-micro"
            >
              <ArrowLeft className="w-4 h-4" />
              Change track
            </button>
          ) : <span />}

          <div className="flex items-center gap-4">
            {onSkip && (
              <button
                type="button"
                onClick={handleSkip}
                disabled={submitting}
                className="t-micro text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip — record all zeros
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || !allFilled}
              className="group flex items-center gap-3 px-6 py-3 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="t-micro tracking-widest">
                {submitting ? 'Saving…' : 'Lock in baseline'}
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
