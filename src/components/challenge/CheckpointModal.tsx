import { useEffect, useState } from 'react';
import { X, ArrowRight, Star } from 'lucide-react';
import type { ChallengeTrack, ChallengeMetricSnapshot } from '../../hooks/useChallenge';

interface CheckpointModalProps {
  isOpen: boolean;
  onClose: () => void;
  dayNumber: 7 | 14 | 21 | 30;
  track: ChallengeTrack;
  baseline: ChallengeMetricSnapshot | null; // for delta hints
  onSubmit: (metrics: Record<string, number>, reflection: string) => Promise<void>;
}

/**
 * CheckpointModal — appears when user marks a checkpoint day complete.
 * Re-captures all metrics (delta-vs-baseline) + reflection text.
 * Uses isOpen/onClose pattern to match PaywallModal / DealDetailDrawer.
 */
export function CheckpointModal({
  isOpen,
  onClose,
  dayNumber,
  track,
  baseline,
  onSubmit,
}: CheckpointModalProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [reflection, setReflection] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the modal opens with a fresh checkpoint day.
  useEffect(() => {
    if (isOpen) {
      setValues(Object.fromEntries(track.metric_definitions.map((m) => [m.key, ''])));
      setReflection('');
      setError(null);
    }
  }, [isOpen, dayNumber, track]);

  // Escape to close.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose, submitting]);

  if (!isOpen) return null;

  const allFilled = track.metric_definitions.every((m) => {
    const v = values[m.key];
    return v !== '' && v !== undefined && !Number.isNaN(Number(v));
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!allFilled) {
      setError('Fill every metric. Use the same value as before if nothing changed.');
      return;
    }
    const parsed: Record<string, number> = {};
    for (const m of track.metric_definitions) parsed[m.key] = Number(values[m.key]);
    setSubmitting(true);
    try {
      await onSubmit(parsed, reflection);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Could not save checkpoint.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-stretch md:items-center justify-center">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close checkpoint"
        onClick={() => !submitting && onClose()}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      {/* Panel */}
      <div className="relative bg-card border border-border w-full md:max-w-2xl md:max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="border-b border-border p-5 flex items-start justify-between gap-4 sticky top-0 bg-card z-10">
          <div>
            <div className="flex items-center gap-2 t-micro text-accent mb-1">
              <Star className="w-3 h-3" />
              Checkpoint · Day {dayNumber}
            </div>
            <h2 className="text-2xl font-medium tracking-tight text-foreground">
              How are the numbers moving?
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5">
          {error && (
            <div className="card-industrial p-4 mb-4 text-sm text-destructive border-destructive/40">{error}</div>
          )}

          <div className="space-y-5">
            {track.metric_definitions.map((m) => {
              const baselineValue = baseline?.values?.[m.key];
              const currentValue = Number(values[m.key]);
              const showDelta = !Number.isNaN(currentValue) && values[m.key] !== '' && typeof baselineValue === 'number';
              const delta = showDelta ? currentValue - (baselineValue as number) : null;
              return (
                <label key={m.key} htmlFor={`cp-${m.key}`} className="block">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="t-micro text-muted-foreground">{m.label}</span>
                    {typeof baselineValue === 'number' && (
                      <span className="t-micro text-muted-foreground/80">
                        Baseline: {baselineValue.toLocaleString()}
                        {delta !== null && (
                          <span
                            className={[
                              'ml-2',
                              delta > 0 ? 'text-foreground' : delta < 0 ? 'text-destructive' : 'text-muted-foreground',
                            ].join(' ')}
                          >
                            {delta > 0 ? '+' : ''}
                            {delta.toLocaleString()}
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <input
                    id={`cp-${m.key}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    value={values[m.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [m.key]: e.target.value }))}
                    placeholder={typeof baselineValue === 'number' ? String(baselineValue) : '0'}
                    className="w-full bg-input border border-border text-foreground text-xl font-medium tracking-tight px-4 py-3 focus:outline-none focus:border-foreground transition-colors"
                    required
                  />
                </label>
              );
            })}

            <label htmlFor="cp-reflection" className="block">
              <div className="t-micro text-muted-foreground mb-2">
                Reflection (what worked, what didn&rsquo;t)
              </div>
              <textarea
                id="cp-reflection"
                rows={4}
                value={reflection}
                onChange={(e) => setReflection(e.target.value)}
                placeholder="Optional. One paragraph is plenty."
                className="w-full bg-input border border-border text-foreground text-base px-4 py-3 focus:outline-none focus:border-foreground transition-colors resize-none"
              />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={() => !submitting && onClose()}
              disabled={submitting}
              className="t-micro text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !allFilled}
              className="group flex items-center gap-3 px-6 py-3 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <span className="t-micro tracking-widest">
                {submitting ? 'Saving…' : 'Save checkpoint + mark day complete'}
              </span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
