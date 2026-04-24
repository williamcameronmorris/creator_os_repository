import { useState } from 'react';
import { Flame, Mic, ArrowRight } from 'lucide-react';
import type { ChallengeTrack } from '../../hooks/useChallenge';

interface TrackPickerProps {
  tracks: ChallengeTrack[];
  onStart: (trackId: string) => Promise<void> | void;
}

/**
 * TrackPicker — shown when the user has no active challenge.
 * Two cards side-by-side, industrial editorial style, matching the app design system.
 */
export function TrackPicker({ tracks, onStart }: TrackPickerProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gear = tracks.find((t) => t.code === 'track-a-gear');
  const launch = tracks.find((t) => t.code === 'track-a-launch');

  const handleStart = async (trackId: string) => {
    setPending(trackId);
    setError(null);
    try {
      await onStart(trackId);
    } catch (e: any) {
      setError(e?.message || 'Could not start challenge.');
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Eyebrow */}
      <div className="t-micro text-muted-foreground mb-2">30-Day Challenge</div>
      <h1 className="text-3xl md:text-4xl font-medium tracking-tight text-foreground mb-3">
        Pick a track. Start today.
      </h1>
      <p className="t-body text-muted-foreground max-w-2xl mb-8">
        One challenge at a time. Daily hook archetypes, weekly checkpoints, and a
        baseline-vs-progress view of the metrics that actually matter for what you&rsquo;re building.
      </p>

      {error && (
        <div className="card-industrial p-4 mb-6 text-sm text-destructive border-destructive/40">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        {gear && (
          <TrackCard
            track={gear}
            icon={<Flame className="w-5 h-5" />}
            tagline="For the gear-content side of the brain"
            pitch="Saves, followers, and comments over 30 days. Three hook variations per day for A/B/C testing."
            stat="90 hooks"
            statSub="3 variations × 30 days"
            pending={pending === gear.id}
            disabled={pending !== null}
            onStart={() => handleStart(gear.id)}
          />
        )}
        {launch && (
          <TrackCard
            track={launch}
            icon={<Mic className="w-5 h-5" />}
            tagline="For the release cycle"
            pitch="Monthly listeners, track saves, short-form views. One high-conviction hook per day — pick the format, run it."
            stat="30 hooks"
            statSub="1 hook · 30 days · 1 release"
            pending={pending === launch.id}
            disabled={pending !== null}
            onStart={() => handleStart(launch.id)}
          />
        )}
      </div>

      <p className="t-micro text-muted-foreground mt-6">
        One-and-done: you can only run one challenge at a time. Abandon the active one to switch tracks.
      </p>
    </div>
  );
}

// -----------------------------

interface TrackCardProps {
  track: ChallengeTrack;
  icon: React.ReactNode;
  tagline: string;
  pitch: string;
  stat: string;
  statSub: string;
  pending: boolean;
  disabled: boolean;
  onStart: () => void;
}

function TrackCard({ track, icon, tagline, pitch, stat, statSub, pending, disabled, onStart }: TrackCardProps) {
  return (
    <div className="card-industrial p-8 flex flex-col min-h-[360px]">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 flex items-center justify-center border border-border text-foreground">
          {icon}
        </div>
        <div>
          <div className="t-micro text-muted-foreground">{tagline}</div>
          <div className="text-lg font-medium tracking-tight text-foreground">{track.name}</div>
        </div>
      </div>

      <p className="t-body text-foreground/80 mb-8 flex-1">{pitch}</p>

      <div className="grid grid-cols-2 gap-px bg-border mb-8">
        <div className="bg-card p-4">
          <div className="t-micro text-muted-foreground mb-1">Volume</div>
          <div className="text-2xl font-medium tracking-tight text-foreground">{stat}</div>
          <div className="t-micro text-muted-foreground mt-1">{statSub}</div>
        </div>
        <div className="bg-card p-4">
          <div className="t-micro text-muted-foreground mb-1">Metrics tracked</div>
          <div className="text-2xl font-medium tracking-tight text-foreground">
            {track.metric_definitions.length}
          </div>
          <div className="t-micro text-muted-foreground mt-1">baseline + 4 checkpoints</div>
        </div>
      </div>

      <button
        type="button"
        onClick={onStart}
        disabled={disabled}
        className="group flex items-center justify-between w-full px-5 py-4 bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <span className="t-micro tracking-widest">
          {pending ? 'Starting…' : `Start ${track.name}`}
        </span>
        <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </button>
    </div>
  );
}
