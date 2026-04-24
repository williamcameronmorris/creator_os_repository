import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useChallenge } from '../hooks/useChallenge';
import { TrackPicker } from '../components/challenge/TrackPicker';
import { BaselineForm } from '../components/challenge/BaselineForm';
import { ChallengeOverview } from '../components/challenge/ChallengeOverview';

/**
 * StudioChallenge — /studio/challenge
 *
 * States this page handles:
 *   1. Loading (skeleton)
 *   2. Error
 *   3. No active challenge → TrackPicker
 *   4. Active challenge, no baseline yet → BaselineForm
 *   5. Active challenge, baseline captured → ChallengeOverview (full Phase 3 view)
 */
export function StudioChallenge() {
  const navigate = useNavigate();
  const challenge = useChallenge();
  const {
    loading,
    error,
    tracks,
    activeProgress,
    activeTrack,
    hasBaseline,
    startChallenge,
    captureBaseline,
  } = challenge;

  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async (trackId: string) => {
    setStartError(null);
    try {
      await startChallenge(trackId);
    } catch (e: any) {
      setStartError(e?.message || 'Could not start challenge.');
      throw e; // let TrackPicker show its own error too
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header row — always visible */}
      <div className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/studio')}
            className="flex items-center gap-2 t-micro text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Studio
          </button>
          <div className="t-micro text-muted-foreground">30-Day Challenge</div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-12">
        {loading && <LoadingState />}

        {!loading && error && (
          <div className="card-industrial p-6 text-destructive border-destructive/40">
            <div className="t-micro mb-2">Error loading challenge</div>
            <div className="text-sm">{error}</div>
          </div>
        )}

        {!loading && !error && !activeProgress && (
          <>
            {startError && (
              <div className="card-industrial p-4 mb-6 text-sm text-destructive border-destructive/40 max-w-5xl mx-auto">
                {startError}
              </div>
            )}
            <TrackPicker tracks={tracks} onStart={handleStart} />
          </>
         )}

        {!loading && !error && activeProgress && activeTrack && !hasBaseline && (
          <BaselineForm
            track={activeTrack}
            onSubmit={async (values) => {
              await captureBaseline(values);
            }}
          />
        )}

        {!loading && !error && activeProgress && activeTrack && hasBaseline && (
          <ChallengeOverview state={challenge} />
        )}
      </div>
    </div>
  );
}

// -----------------------------

function LoadingState() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="t-micro text-muted-foreground mb-2">Loading…</div>
      <div className="h-10 bg-muted w-2/3 mb-3 animate-pulse" />
      <div className="h-5 bg-muted w-1/2 mb-8 animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border">
        <div className="h-[360px] bg-card animate-pulse" />
        <div className="h-[360px] bg-card animate-pulse" />
      </div>
    </div>
  );
}
