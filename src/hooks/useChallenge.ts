import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * useChallenge — single source of truth for the in-app 30-day challenge feature.
 *
 * Tables used:
 *   challenge_tracks          (existing, seeded)
 *   challenge_days            (existing, seeded)
 *   challenge_hooks           (existing, seeded)
 *   challenge_progress        (Phase 1: active/completed/abandoned per user)
 *   challenge_day_completions (Phase 1: per-day check-off + reflection text)
 *   challenge_metrics         (Phase 1: baseline + checkpoint snapshots)
 */

export type MetricDefinition = {
  key: string;
  label: string;
  format: 'number';
  hint?: string;
};

export type ChallengeTrack = {
  id: string;
  code: 'track-a-gear' | 'track-a-launch' | string;
  name: string;
  description: string | null;
  duration_days: number;
  metric_definitions: MetricDefinition[];
};

export type ChallengeDay = {
  id: string;
  track_id: string;
  day_number: number;
  archetype: string;
  week_theme: string | null;
  format_notes: string | null;
};

export type ChallengeHook = {
  id: string;
  day_id: string;
  variation_number: number;
  hook_text: string;
  variation_purpose: string | null;
};

export type ChallengeProgress = {
  id: string;
  user_id: string;
  track_id: string;
  status: 'active' | 'completed' | 'abandoned';
  started_at: string;
  completed_at: string | null;
};

export type ChallengeDayCompletion = {
  id: string;
  progress_id: string;
  day_number: number;
  completed_at: string;
  reflection: string | null;
};

export type ChallengeMetricSnapshot = {
  id: string;
  progress_id: string;
  captured_at_day: 0 | 7 | 14 | 21 | 30;
  values: Record<string, number>;
  captured_at: string;
};

export const CHECKPOINT_DAYS = [7, 14, 21, 30] as const;

type LoadedState = {
  tracks: ChallengeTrack[];
  activeProgress: ChallengeProgress | null;
  activeTrack: ChallengeTrack | null;
  days: ChallengeDay[];
  hooks: ChallengeHook[];
  completions: ChallengeDayCompletion[];
  metrics: ChallengeMetricSnapshot[];
};

const EMPTY: LoadedState = {
  tracks: [],
  activeProgress: null,
  activeTrack: null,
  days: [],
  hooks: [],
  completions: [],
  metrics: [],
};

export function useChallenge() {
  const { user } = useAuth();
  const [state, setState] = useState<LoadedState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setState(EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Always load all tracks (cheap, small)
      const { data: tracks, error: tracksErr } = await supabase
        .from('challenge_tracks')
        .select('id, code, name, description, duration_days, metric_definitions')
        .order('code');
      if (tracksErr) throw tracksErr;

      // 2. Active progress for this user (may be null)
      const { data: progressRows, error: progressErr } = await supabase
        .from('challenge_progress')
        .select('id, user_id, track_id, status, started_at, completed_at')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (progressErr && progressErr.code !== 'PGRST116') throw progressErr;
      const activeProgress = (progressRows as ChallengeProgress | null) || null;

      if (!activeProgress) {
        setState({
          ...EMPTY,
          tracks: (tracks || []) as ChallengeTrack[],
        });
        setLoading(false);
        return;
      }

      const activeTrack = (tracks || []).find((t) => t.id === activeProgress.track_id) as ChallengeTrack | undefined;
      if (!activeTrack) {
        setState({ ...EMPTY, tracks: (tracks || []) as ChallengeTrack[] });
        setLoading(false);
        return;
      }

      // 3. Days for the active track
      const { data: days, error: daysErr } = await supabase
        .from('challenge_days')
        .select('id, track_id, day_number, archetype, week_theme, format_notes')
        .eq('track_id', activeTrack.id)
        .order('day_number');
      if (daysErr) throw daysErr;

      const dayIds = (days || []).map((d) => d.id);

      // 4. Hooks for those days
      const { data: hooks, error: hooksErr } = dayIds.length
        ? await supabase
            .from('challenge_hooks')
            .select('id, day_id, variation_number, hook_text, variation_purpose')
            .in('day_id', dayIds)
            .order('variation_number')
        : { data: [], error: null };
      if (hooksErr) throw hooksErr;

      // 5. This user's completions + metric snapshots for the active challenge
      const [completionsRes, metricsRes] = await Promise.all([
        supabase
          .from('challenge_day_completions')
          .select('id, progress_id, day_number, completed_at, reflection')
          .eq('progress_id', activeProgress.id)
          .order('day_number'),
        supabase
          .from('challenge_metrics')
          .select('id, progress_id, captured_at_day, values, captured_at')
          .eq('progress_id', activeProgress.id)
          .order('captured_at_day'),
      ]);
      if (completionsRes.error) throw completionsRes.error;
      if (metricsRes.error) throw metricsRes.error;

      setState({
        tracks: (tracks || []) as ChallengeTrack[],
        activeProgress,
        activeTrack: activeTrack as ChallengeTrack,
        days: (days || []) as ChallengeDay[],
        hooks: (hooks || []) as ChallengeHook[],
        completions: (completionsRes.data || []) as ChallengeDayCompletion[],
        metrics: (metricsRes.data || []) as ChallengeMetricSnapshot[],
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load challenge data.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // -----------------------------
  // Mutations
  // -----------------------------

  const startChallenge = useCallback(
    async (trackId: string): Promise<ChallengeProgress> => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('challenge_progress')
        .insert({ user_id: user.id, track_id: trackId, status: 'active' })
        .select('id, user_id, track_id, status, started_at, completed_at')
        .single();
      if (error) throw error;
      await load();
      return data as ChallengeProgress;
    },
    [user, load]
  );

  const captureBaseline = useCallback(
    async (values: Record<string, number>) => {
      if (!state.activeProgress) throw new Error('No active challenge');
      const { error } = await supabase
        .from('challenge_metrics')
        .upsert(
          {
            progress_id: state.activeProgress.id,
            captured_at_day: 0,
            values,
          },
          { onConflict: 'progress_id,captured_at_day' }
        );
      if (error) throw error;
      await load();
    },
    [state.activeProgress, load]
  );

  const captureCheckpoint = useCallback(
    async (day: 7 | 14 | 21 | 30, values: Record<string, number>) => {
      if (!state.activeProgress) throw new Error('No active challenge');
      const { error } = await supabase
        .from('challenge_metrics')
        .upsert(
          {
            progress_id: state.activeProgress.id,
            captured_at_day: day,
            values,
          },
          { onConflict: 'progress_id,captured_at_day' }
        );
      if (error) throw error;
      await load();
    },
    [state.activeProgress, load]
  );

  const completeDay = useCallback(
    async (dayNumber: number, reflection?: string) => {
      if (!state.activeProgress) throw new Error('No active challenge');
      const { error } = await supabase
        .from('challenge_day_completions')
        .upsert(
          {
            progress_id: state.activeProgress.id,
            day_number: dayNumber,
            reflection: reflection ?? null,
          },
          { onConflict: 'progress_id,day_number' }
        );
      if (error) throw error;

      // If day 30 is now completed, mark the whole challenge completed.
      if (dayNumber === 30) {
        await supabase
          .from('challenge_progress')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', state.activeProgress.id);
      }
      await load();
    },
    [state.activeProgress, load]
  );

  const uncompleteDay = useCallback(
    async (dayNumber: number) => {
      if (!state.activeProgress) throw new Error('No active challenge');
      const { error } = await supabase
        .from('challenge_day_completions')
        .delete()
        .eq('progress_id', state.activeProgress.id)
        .eq('day_number', dayNumber);
      if (error) throw error;
      await load();
    },
    [state.activeProgress, load]
  );

  const abandonChallenge = useCallback(async () => {
    if (!state.activeProgress) return;
    const { error } = await supabase
      .from('challenge_progress')
      .update({ status: 'abandoned' })
      .eq('id', state.activeProgress.id);
    if (error) throw error;
    await load();
  }, [state.activeProgress, load]);

  // -----------------------------
  // Derived values
  // -----------------------------

  const derived = useMemo(() => {
    const completedDayNumbers = new Set(state.completions.map((c) => c.day_number));
    const completedCount = completedDayNumbers.size;
    const baseline = state.metrics.find((m) => m.captured_at_day === 0) || null;
    const hasBaseline = !!baseline;
    // Current day = first incomplete day, or 30 if all done.
    let currentDay = 1;
    for (let d = 1; d <= 30; d++) {
      if (!completedDayNumbers.has(d)) {
        currentDay = d;
        break;
      }
      if (d === 30) currentDay = 30;
    }
    // Hooks grouped by day_number
    const hooksByDay = new Map<number, ChallengeHook[]>();
    for (const day of state.days) {
      hooksByDay.set(
        day.day_number,
        state.hooks.filter((h) => h.day_id === day.id).sort((a, b) => a.variation_number - b.variation_number)
      );
    }
    return {
      completedDayNumbers,
      completedCount,
      baseline,
      hasBaseline,
      currentDay,
      hooksByDay,
    };
  }, [state]);

  return {
    // data
    ...state,
    ...derived,
    // status
    loading,
    error,
    // mutations
    refresh: load,
    startChallenge,
    captureBaseline,
    captureCheckpoint,
    completeDay,
    uncompleteDay,
    abandonChallenge,
  };
}

export type UseChallengeReturn = ReturnType<typeof useChallenge>;
