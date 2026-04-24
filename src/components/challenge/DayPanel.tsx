import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ArrowRight, Pencil, Star } from 'lucide-react';
import type { ChallengeDay, ChallengeHook } from '../../hooks/useChallenge';
import { CHECKPOINT_DAYS } from '../../hooks/useChallenge';

interface DayPanelProps {
  day: ChallengeDay | null;
  dayNumber: number;
  hooks: ChallengeHook[];
  isCompleted: boolean;
  isCurrent: boolean;
  isLocked: boolean; // true if day is in the future and not yet unlocked
  onComplete: () => Promise<void> | void; // for non-checkpoint days, marks complete directly
  onCheckpointStart: () => void; // called instead of onComplete on checkpoint days
}

/**
 * The expanded panel for a selected day. Shows hook(s), archetype/format notes,
 * Send-to-Studio button per hook, and Mark Complete button.
 */
export function DayPanel({
  day,
  dayNumber,
  hooks,
  isCompleted,
  isCurrent,
  isLocked,
  onComplete,
  onCheckpointStart,
}: DayPanelProps) {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCheckpoint = (CHECKPOINT_DAYS as readonly number[]).includes(dayNumber);

  const sendToStudio = (hook: ChallengeHook) => {
    const params = new URLSearchParams();
    params.set('hook', hook.hook_text);
    params.set('idea', hook.hook_text);
    if (day?.format_notes) params.set('reasoning', day.format_notes);
    params.set('platform', 'instagram');
    params.set('type', 'reel');
    navigate(`/studio/workflow?${params.toString()}`);
  };

  const handleMark = async () => {
    setError(null);
    if (isCheckpoint && !isCompleted) {
      onCheckpointStart();
      return;
    }
    setSubmitting(true);
    try {
      await onComplete();
    } catch (e: any) {
      setError(e?.message || 'Could not mark complete.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!day) {
    return (
      <div className="card-industrial p-6 text-muted-foreground">
        <div className="t-micro mb-2">Day {String(dayNumber).padStart(2, '0')}</div>
        <div className="text-sm">No data for this day.</div>
      </div>
    );
  }

  return (
    <div className="card-industrial">
      {/* Header strip */}
      <div className="border-b border-border p-5 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 t-micro text-muted-foreground mb-1">
            <span>Day {String(dayNumber).padStart(2, '0')}</span>
            {isCheckpoint && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1 text-accent">
                  <Star className="w-3 h-3" /> Checkpoint
                </span>
              </>
            )}
            {isCompleted && (
              <>
                <span aria-hidden>·</span>
                <span className="flex items-center gap-1 text-foreground">
                  <Check className="w-3 h-3" /> Completed
                </span>
              </>
            )}
            {isCurrent && !isCompleted && (
              <>
                <span aria-hidden>·</span>
                <span className="text-foreground">Today</span>
              </>
            )}
          </div>
          <h2 className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">{day.archetype}</h2>
          {day.week_theme && (
            <div className="t-micro text-muted-foreground mt-2">Week theme: {day.week_theme}</div>
          )}
        </div>

        {!isLocked && (
          <button
            type="button"
            onClick={handleMark}
            disabled={submitting}
            className={[
              'group flex items-center gap-2 px-5 py-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0',
              isCompleted
                ? 'border border-border text-foreground hover:bg-card-sunken'
                : 'bg-foreground text-background hover:bg-foreground/90',
            ].join(' ')}
          >
            <span className="t-micro tracking-widest">
              {isCompleted
                ? 'Completed'
                : submitting
                ? 'Saving…'
                : isCheckpoint
                ? 'Checkpoint + complete'
                : 'Mark complete'}
            </span>
            {!isCompleted && <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />}
          </button>
        )}
      </div>

      {error && (
        <div className="border-b border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
      )}

      {/* Format notes */}
      {day.format_notes && (
        <div className="border-b border-border p-5">
          <div className="t-micro text-muted-foreground mb-2">Format notes</div>
          <p className="t-body text-foreground/80 whitespace-pre-line">{day.format_notes}</p>
        </div>
      )}

      {/* Hooks */}
      <div className="p-5">
        <div className="t-micro text-muted-foreground mb-3">
          {hooks.length === 1 ? 'Hook' : `${hooks.length} hook variations`}
        </div>
        {hooks.length === 0 ? (
          <p className="t-body text-muted-foreground">No hook content for this day.</p>
        ) : (
          <div className="space-y-px bg-border">
            {hooks.map((h) => (
              <div key={h.id} className="bg-card p-5 flex items-start gap-4">
                <div className="t-micro text-muted-foreground mt-1 shrink-0">
                  {String(h.variation_number).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base md:text-lg text-foreground leading-snug tracking-tight">
                    {h.hook_text}
                  </p>
                  {h.variation_purpose && (
                    <div className="t-micro text-muted-foreground mt-2">{h.variation_purpose}</div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => sendToStudio(h)}
                  className="group flex items-center gap-2 t-micro text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Open this hook in Studio with a pre-filled script"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Send to Studio</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
