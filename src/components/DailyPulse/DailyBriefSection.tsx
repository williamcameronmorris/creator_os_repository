import { useNavigate } from 'react-router-dom';
import { RefreshCw, Sparkles, ArrowRight, Loader2, AlertCircle, Zap } from 'lucide-react';
import { useRecommendations, type Recommendation } from '../../hooks/useRecommendations';

// ── Framework → accent color mapping ────────────────────────────────────────
const FRAMEWORK_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Proof-First':     { bg: 'bg-emerald-500/10', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-500/20' },
  'Curiosity Gap':   { bg: 'bg-violet-500/10',  text: 'text-violet-600 dark:text-violet-400',  border: 'border-violet-500/20' },
  'Pain Point':      { bg: 'bg-red-500/10',     text: 'text-red-600 dark:text-red-400',        border: 'border-red-500/20' },
  'Challenge':       { bg: 'bg-orange-500/10',  text: 'text-orange-600 dark:text-orange-400',  border: 'border-orange-500/20' },
  'Question + Proof':{ bg: 'bg-blue-500/10',    text: 'text-blue-600 dark:text-blue-400',      border: 'border-blue-500/20' },
  'Bold Claim':      { bg: 'bg-amber-500/10',   text: 'text-amber-600 dark:text-amber-400',    border: 'border-amber-500/20' },
  'Storytelling':    { bg: 'bg-pink-500/10',    text: 'text-pink-600 dark:text-pink-400',      border: 'border-pink-500/20' },
  'Contrarian':      { bg: 'bg-rose-500/10',    text: 'text-rose-600 dark:text-rose-400',      border: 'border-rose-500/20' },
  'How-To':          { bg: 'bg-sky-500/10',     text: 'text-sky-600 dark:text-sky-400',        border: 'border-sky-500/20' },
  'List/Ranking':    { bg: 'bg-indigo-500/10',  text: 'text-indigo-600 dark:text-indigo-400',  border: 'border-indigo-500/20' },
};

const DEFAULT_COLOR = { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' };

function frameworkColor(fw: string) {
  return FRAMEWORK_COLORS[fw] || DEFAULT_COLOR;
}

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 88 ? 'bg-emerald-500' : pct >= 78 ? 'bg-amber-500' : 'bg-blue-500';
  return (
    <div className="flex items-center gap-2 mt-3">
      <div className="flex-1 h-1 rounded-full bg-border overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-bold text-muted-foreground tabular-nums">{pct}%</span>
    </div>
  );
}

// ── Single recommendation card ───────────────────────────────────────────────
function RecCard({ rec, index, onCreateClick }: {
  rec: Recommendation;
  index: number;
  onCreateClick: (rec: Recommendation) => void;
}) {
  const colors = frameworkColor(rec.hook_framework);
  const labels = ['A', 'B', 'C'];

  return (
    <div className="bg-card border border-border rounded-3xl p-5 flex flex-col gap-3 group hover:border-primary/30 transition-colors">
      {/* Top row: framework badge + index label */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-black tracking-widest uppercase px-2.5 py-1 rounded-full border ${colors.bg} ${colors.text} ${colors.border}`}>
          {rec.hook_framework || 'General'}
        </span>
        <span className="text-xs font-black text-muted-foreground opacity-40">{labels[index]}</span>
      </div>

      {/* Hook text — the actual opening line */}
      {rec.hook_text && (
        <p className="text-sm font-black text-foreground leading-snug">
          "{rec.hook_text}"
        </p>
      )}

      {/* Topic */}
      <p className="text-base font-bold text-foreground leading-tight">
        {rec.suggested_topic}
      </p>

      {/* Format */}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {rec.suggested_format}
      </p>

      {/* Reasoning */}
      <p className="text-xs text-muted-foreground leading-relaxed border-t border-border pt-3">
        {rec.reasoning}
      </p>

      {/* Confidence + CTA */}
      <ConfidenceBar score={rec.confidence_score} />

      <button
        onClick={() => onCreateClick(rec)}
        className="mt-1 w-full flex items-center justify-center gap-1.5 py-2.5 rounded-2xl bg-primary/10 hover:bg-primary/20 text-primary text-sm font-bold transition-colors group-hover:bg-primary group-hover:text-primary-foreground"
      >
        Start creating
        <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Empty / generating state ─────────────────────────────────────────────────
function EmptyState({ generating, hasProfile, onGenerate }: {
  generating: boolean;
  hasProfile: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-3xl p-8 flex flex-col items-center text-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        {generating ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin" />
        ) : (
          <Sparkles className="w-5 h-5 text-primary" />
        )}
      </div>

      {generating ? (
        <>
          <p className="text-sm font-black text-foreground">Analyzing your content...</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Matching your patterns against proven Outlier posts. This takes a few seconds.
          </p>
        </>
      ) : hasProfile ? (
        <>
          <p className="text-sm font-black text-foreground">Ready to generate your brief</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Your content profile is ready. Generate 3 personalized recommendations based on your real performance data.
          </p>
          <button
            onClick={onGenerate}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Generate My Brief
          </button>
        </>
      ) : (
        <>
          <p className="text-sm font-black text-foreground">Connect Instagram to unlock your brief</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Once you sync your Instagram, the AI analyzes your top posts and generates personalized recommendations every day.
          </p>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export function DailyBriefSection() {
  const navigate = useNavigate();
  const { recommendations, loading, generating, error, hasProfile, generate } = useRecommendations();

  const handleCreateClick = (rec: Recommendation) => {
    // Navigate to Studio with full Daily Brief context — Studio auto-advances past Ideation
    const params = new URLSearchParams({
      platform: rec.platform || 'instagram',
      type: rec.content_type || 'reel',
      idea: rec.suggested_topic || '',
      hook: rec.hook_text || '',
      framework: rec.hook_framework || '',
      reasoning: rec.reasoning || '',
      confidence: String(rec.confidence_score || 85),
    });
    navigate(`/studio?${params.toString()}`);
  };

  const hasRecs = recommendations.length > 0;

  return (
    <div className="mb-8">
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" />
          <span className="text-xs font-black tracking-widest text-muted-foreground uppercase">
            Today's Brief
          </span>
        </div>

        {hasRecs && (
          <button
            onClick={() => generate(true)}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Refreshing...' : 'Refresh'}
          </button>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="bg-card border border-border rounded-3xl p-5 h-64 animate-pulse" />
          ))}
        </div>
      ) : hasRecs ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {recommendations.map((rec, i) => (
            <RecCard key={rec.id} rec={rec} index={i} onCreateClick={handleCreateClick} />
          ))}
        </div>
      ) : (
        <EmptyState generating={generating} hasProfile={hasProfile} onGenerate={() => generate(false)} />
      )}
    </div>
  );
}
