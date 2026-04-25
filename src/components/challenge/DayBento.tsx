import { Check, Star } from 'lucide-react';
import type { ChallengeDay, ChallengeHook } from '../../hooks/useChallenge';
import { CHECKPOINT_DAYS } from '../../hooks/useChallenge';

interface DayBentoProps {
  days: ChallengeDay[];
  hooksByDay: Map<number, ChallengeHook[]>;
  completedDayNumbers: Set<number>;
  currentDay: number;
  selectedDay: number;
  onSelect: (dayNumber: number) => void;
}

/**
 * 30-day bento grid. Each cell shows:
 *  - day number
 *  - archetype label (small)
 *  - status icon (completed checkmark, current dot, checkpoint star)
 *  - selected state border
 */
export function DayBento({
  days,
  hooksByDay,
  completedDayNumbers,
  currentDay,
  selectedDay,
  onSelect,
}: DayBentoProps) {
  // Build a map for quick lookup; days array might be sparse if track has fewer days
  const byNumber = new Map<number, ChallengeDay>();
  for (const d of days) byNumber.set(d.day_number, d);
  const checkpoints = new Set<number>(CHECKPOINT_DAYS as readonly number[]);

  return (
    <div>
      <div className="t-micro text-muted-foreground mb-3">All 30 days</div>
      <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-10 gap-px bg-border">
        {Array.from({ length: 30 }, (_, i) => i + 1).map((n) => {
          const day = byNumber.get(n);
          const isCompleted = completedDayNumbers.has(n);
          const isCurrent = n === currentDay && !isCompleted;
          const isCheckpoint = checkpoints.has(n);
          const isSelected = n === selectedDay;
          const hookCount = hooksByDay.get(n)?.length || 0;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onSelect(n)}
              aria-current={isCurrent ? 'step' : undefined}
              aria-pressed={isSelected}
              className={[
                'relative aspect-square bg-card text-left p-3 transition-colors',
                'hover:bg-card-sunken focus:outline-none focus:ring-1 focus:ring-foreground',
                isSelected ? 'bg-card-sunken' : '',
                isCompleted ? 'text-foreground' : 'text-muted-foreground',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {/* Top row: day number + status icon */}
              <div className="flex items-start justify-between">
                <div className={['text-base font-medium tracking-tight', isCurrent ? 'text-foreground' : ''].join(' ')}>
                  {String(n).padStart(2, '0')}
                </div>
                <div className="flex items-center gap-1">
                  {isCheckpoint && <Star className="w-3 h-3 text-accent" aria-label="Checkpoint" />}
                  {isCompleted && <Check className="w-3.5 h-3.5 text-foreground" aria-label="Completed" />}
                </div>
              </div>

              {/* Bottom: archetype micro-label */}
              <div className="absolute bottom-2 left-3 right-3 t-micro truncate" title={day?.archetype || ''}>
                {day?.archetype || '—'}
              </div>

              {/* Current-day indicator: thin gold underline */}
              {isCurrent && <div className="absolute left-0 right-0 bottom-0 h-px bg-accent" aria-hidden />}
              {hookCount > 1 && (
                <div className="absolute top-2 right-2 hidden md:block t-micro text-muted-foreground">×{hookCount}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
