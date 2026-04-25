import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { CHECKPOINT_DAYS } from '../../hooks/useChallenge';
import type { UseChallengeReturn } from '../../hooks/useChallenge';
import { DayBento } from './DayBento';
import { DayPanel } from './DayPanel';
import { CheckpointModal } from './CheckpointModal';
import { MetricsChart } from './MetricsChart';

interface ChallengeOverviewProps {
  state: UseChallengeReturn;
}

/**
 * ChallengeOverview — the main view once a user has an active challenge with a baseline.
 * Replaces the Phase 2 placeholder.
 */
export function ChallengeOverview({ state }: ChallengeOverviewProps) {
  const {
    activeProgress,
    activeTrack,
    days,
    completions,
    metrics,
    completedDayNumbers,
    completedCount,
    currentDay,
    hooksByDay,
    baseline,
    completeDay,
    captureCheckpoint,
    abandonChallenge,
  } = state;

  const [selectedDay, setSelectedDay] = useState<number>(currentDay);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [pendingCheckpointDay, setPendingCheckpointDay] = useState<7 | 14 | 21 | 30 | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!activeProgress || !activeTrack) return null;

  const selectedDayObj = useMemo(() => days.find((d) => d.day_number === selectedDay) || null, [days, selectedDay]);
  const selectedHooks = useMemo(() => hooksByDay.get(selectedDay) || [], [hooksByDay, selectedDay]);
  const selectedCompletion = completions.find((c) => c.day_number === selectedDay) || null;
  const isSelectedCompleted = !!selectedCompletion;
  const isSelectedCurrent = selectedDay === currentDay && !isSelectedCompleted;
  // We let users open any past or current day; future days beyond currentDay are read-only.
  const isSelectedLocked = selectedDay > currentDay;

  const progressPct = Math.round((completedCount / 30) * 100);

  const handleSimpleComplete = async () => {
    setError(null);
    try {
      await completeDay(selectedDay);
      // Auto-advance the panel to the new current day
      const nextDay = Math.min(selectedDay + 1, 30);
      setSelectedDay(nextDay);
    } catch (e: any) {
      setError(e?.message || 'Could not mark complete.');
    }
  };

  const handleCheckpointStart = () => {
    if (!(CHECKPOINT_DAYS as readonly number[]).includes(selectedDay)) return;
    setPendingCheckpointDay(selectedDay as 7 | 14 | 21 | 30);
    setCheckpointOpen(true);
  };

  const handleCheckpointSubmit = async (vals: Record<string, number>, reflection: string) => {
    if (pendingCheckpointDay == null) return;
    setError(null);
    try {
      await captureCheckpoint(pendingCheckpointDay, vals);
      await completeDay(pendingCheckpointDay, reflection || undefined);
      const nextDay = Math.min(pendingCheckpointDay + 1, 30);
      setSelectedDay(nextDay);
    } catch (e: any) {
      setError(e?.message || 'Could not save checkpoint.');
      throw e;
    }
  };

  const handleAbandon = async () => {
    setError(null);
    try {
      await abandonChallenge();
      setConfirmAbandon(false);
    } catch (e: any) {
      setError(e?.message || 'Could not abandon challenge.');
    }
  };

  const isComplete = activeProgress.status === 'completed';

  return (
    <div className="space-y-6">
      {/* Header: track + progress + abandon */}
      <div className="card-industrial p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <div className="t-micro text-muted-foreground mb-1">
            {isComplete ? 'Completed' : 'Active'} · {activeTrack.name}
          </div>
          <div className="text-2xl md:text-3xl font-medium tracking-tight text-foreground">
            {isComplete
              ? '30 days, done.'
              : completedCount === 0
              ? 'Day 1 is up.'
              : `Day ${currentDay} is up.`}
          </div>
        </div>

        {/* Progress bar */}
        <div className="md:w-72">
          <div className="flex items-baseline justify-between t-micro text-muted-foreground mb-2">
            <span>Progress</span>
            <span>
              {completedCount} / 30 · {progressPct}%
            </span>
          </div>
          <div className="h-1.5 bg-muted relative">
            <div
              className="absolute inset-y-0 left-0 bg-foreground transition-[width]"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        <div className="md:ml-4 shrink-0">
          {!confirmAbandon ? (
            <button
              type="button"
              onClick={() => setConfirmAbandon(true)}
              className="t-micro text-muted-foreground hover:text-destructive transition-colors"
            >
              Abandon
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmAbandon(false)}
                className="t-micro text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAbandon}
                className="t-micro text-destructive hover:underline"
              >
                Yes, abandon
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="card-industrial p-4 text-sm text-destructive border-destructive/40 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Day grid */}
      <DayBento
        days={days}
        hooksByDay={hooksByDay}
        completedDayNumbers={completedDayNumbers}
        currentDay={currentDay}
        selectedDay={selectedDay}
        onSelect={(n) => setSelectedDay(n)}
      />

      {/* Selected-day panel */}
      <DayPanel
        day={selectedDayObj}
        dayNumber={selectedDay}
        hooks={selectedHooks}
        isCompleted={isSelectedCompleted}
        isCurrent={isSelectedCurrent}
        isLocked={isSelectedLocked}
        onComplete={handleSimpleComplete}
        onCheckpointStart={handleCheckpointStart}
      />

      {/* Metrics chart */}
      <MetricsChart metrics={metrics} metricDefinitions={activeTrack.metric_definitions} />

      {/* Checkpoint modal */}
      {pendingCheckpointDay != null && (
        <CheckpointModal
          isOpen={checkpointOpen}
          onClose={() => {
            setCheckpointOpen(false);
            setPendingCheckpointDay(null);
          }}
          dayNumber={pendingCheckpointDay}
          track={activeTrack}
          baseline={baseline}
          onSubmit={handleCheckpointSubmit}
        />
      )}
    </div>
  );
}
