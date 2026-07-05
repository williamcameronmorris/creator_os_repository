import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { Mic2, RefreshCw, Sparkles, AlertCircle, Check } from 'lucide-react';

/**
 * "Your Voice" — the self-serve surface for the In Your Voice feature.
 *
 * Shows the voice fingerprint Clio extracted from the creator's own posts
 * (analyze-captions → user_content_profiles) and lets them (re)build it. Once a
 * voice exists, every idea and script the AI writes is generated in it.
 */

interface VoiceProfile {
  tone?: string;
  formality?: string;
  emoji_use?: string;
  signature_phrases?: string[];
  hook_openers?: string[];
  cta_style?: string;
}

interface VoiceRow {
  voice_profile: VoiceProfile | null;
  caption_style: string | null;
  raw_analysis: { voice_signature?: string } | null;
  posts_analyzed: number | null;
  analyzed_at: string | null;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1 month ago' : `${months} months ago`;
}

export function VoiceCard() {
  const { user } = useAuth();
  const [row, setRow] = useState<VoiceRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (user) load();
  }, [user]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('user_content_profiles')
      .select('voice_profile, caption_style, raw_analysis, posts_analyzed, analyzed_at')
      .eq('user_id', user.id)
      .maybeSingle();
    setRow((data as VoiceRow | null) ?? null);
    setLoading(false);
  };

  const build = async () => {
    if (!user || building) return;
    setBuilding(true);
    setError(null);
    setNotice(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Your session expired — please sign in again.');
      const { data, error: fnErr } = await supabase.functions.invoke('analyze-captions', {
        body: { force: true },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (fnErr) throw fnErr;
      // analyze-captions returns success:false with a reason when there aren't
      // enough posts yet — surface that as guidance, not an error.
      if (data && data.success === false) {
        setNotice(data.reason || 'Not enough published posts with captions yet — publish or sync a few more, then try again.');
      } else {
        await load();
        setNotice('Your voice is ready. Every script and idea Clio writes now sounds like you.');
      }
    } catch (e) {
      setError((e as Error).message || 'Could not build your voice. Check your connection and try again.');
    } finally {
      setBuilding(false);
    }
  };

  const signature = row?.raw_analysis?.voice_signature || '';
  const vp = row?.voice_profile || null;
  const hasVoice = !!(signature || (vp && Object.keys(vp).length > 0));

  const chips: string[] = [];
  if (vp?.tone) chips.push(vp.tone);
  if (vp?.formality) chips.push(vp.formality);
  if (vp?.emoji_use) chips.push(vp.emoji_use);

  return (
    <div className="p-6 bg-card border border-border">
      <div className="flex items-start justify-between gap-4 mb-2">
        <h3 className="text-lg font-black uppercase tracking-tight text-foreground flex items-center gap-2">
          <Mic2 className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-mono tracking-[0.08em]">Your Voice</span>
        </h3>
        {hasVoice && (
          <span className="t-micro flex items-center gap-1 flex-shrink-0" style={{ color: 'var(--accent)' }}>
            <Check className="w-3 h-3" /> ACTIVE
          </span>
        )}
      </div>

      <p className="text-muted-foreground text-sm mb-6 max-w-prose">
        Clio learns how <em>you</em> write from your own posts, then writes every idea and script in your voice — not generic AI.
      </p>

      {error && (
        <div className="p-3 border border-border text-sm flex items-start gap-2 mb-4" style={{ color: '#B07050' }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 border text-sm flex items-start gap-2 mb-4" style={{ borderColor: 'var(--accent)', color: 'var(--foreground)' }}>
          <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          {notice}
        </div>
      )}

      {loading ? (
        <div className="t-body py-6">Loading your voice…</div>
      ) : hasVoice ? (
        <div className="space-y-5">
          {signature && (
            <blockquote
              className="text-foreground pl-4"
              style={{ borderLeft: '2px solid var(--accent)', fontSize: '1.05rem', lineHeight: 1.5 }}
            >
              “{signature}”
            </blockquote>
          )}

          {chips.length > 0 && (
            <div className="chips flex flex-wrap gap-2">
              {chips.map((c) => (
                <span key={c} className="t-micro px-2 py-1 border border-border text-muted-foreground">{c}</span>
              ))}
            </div>
          )}

          {vp?.signature_phrases && vp.signature_phrases.length > 0 && (
            <div>
              <div className="t-micro text-muted-foreground mb-2">Phrases you actually use</div>
              <div className="flex flex-wrap gap-2">
                {vp.signature_phrases.slice(0, 6).map((p, i) => (
                  <span key={i} className="t-micro px-2 py-1 border" style={{ borderColor: 'var(--accent)', color: 'var(--foreground)' }}>“{p}”</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <span className="t-micro text-muted-foreground">
              Built from {row?.posts_analyzed ?? 0} posts · updated {relativeTime(row?.analyzed_at ?? null)}
            </span>
            <button onClick={build} disabled={building} className="btn-ie disabled:opacity-40 disabled:cursor-not-allowed">
              <span className="btn-ie-text flex items-center gap-2">
                {building
                  ? <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Rebuilding…</>
                  : <><RefreshCw className="w-4 h-4" /> Rebuild from my posts</>}
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-border p-6 text-center">
          <p className="t-body mb-4">
            You don't have a voice yet. Clio will read your recent published posts and learn how you write.
          </p>
          <button onClick={build} disabled={building} className="btn-ie btn-ie-solid mx-auto disabled:opacity-60 disabled:cursor-not-allowed">
            <span className="btn-ie-text flex items-center gap-2">
              {building
                ? <><span className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" /> Reading your posts…</>
                : <><Sparkles className="w-4 h-4" /> Build my voice</>}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
