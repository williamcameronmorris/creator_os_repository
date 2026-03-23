import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface Recommendation {
  id: string;
  platform: string;
  content_type: string;
  suggested_topic: string;
  suggested_format: string;
  reasoning: string;
  confidence_score: number;
  hook_framework: string;
  hook_text: string;
  status: string;
  created_at: string;
}

interface UseRecommendationsResult {
  recommendations: Recommendation[];
  loading: boolean;
  generating: boolean;
  error: string | null;
  hasProfile: boolean;
  generate: (force?: boolean) => Promise<void>;
}

// Recommendations older than this are considered stale and will be regenerated
const STALE_HOURS = 6;

export function useRecommendations(): UseRecommendationsResult {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasProfile, setHasProfile] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if the user has a content profile
      const { data: profile } = await supabase
        .from('user_content_profiles')
        .select('posts_analyzed')
        .eq('user_id', user.id)
        .maybeSingle();

      setHasProfile(!!(profile && profile.posts_analyzed > 0));

      // Pull the most recent recommendation_engine suggestions
      const { data: recs, error: recsError } = await supabase
        .from('ai_content_suggestions')
        .select('id, platform, content_type, suggested_topic, suggested_format, reasoning, confidence_score, hook_framework, hook_text, status, created_at')
        .eq('user_id', user.id)
        .eq('source', 'recommendation_engine')
        .order('created_at', { ascending: false })
        .limit(3);

      if (recsError) throw recsError;

      setRecommendations(recs || []);
    } catch (err) {
      console.error('useRecommendations load error:', err);
      setError('Failed to load recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = useCallback(async (force = false) => {
    setGenerating(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-recommendations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ userId: user.id, force }),
        }
      );

      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Failed to generate recommendations');
      if (json.skipped) {
        // Already fresh — just reload from DB
        await load();
        return;
      }

      // Reload from DB to get the freshly inserted rows
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  }, [load]);

  // Auto-generate if: no recs exist, or most recent rec is stale
  useEffect(() => {
    if (loading || generating) return;
    if (recommendations.length === 0) {
      generate(false);
      return;
    }
    const newest = new Date(recommendations[0].created_at).getTime();
    const hoursSince = (Date.now() - newest) / (1000 * 60 * 60);
    if (hoursSince > STALE_HOURS) {
      generate(false);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return { recommendations, loading, generating, error, hasProfile, generate };
}
