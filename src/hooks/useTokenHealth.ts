import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type TokenStatus = 'connected' | 'expired' | 'missing' | 'unknown';

export interface PlatformHealth {
  platform: string;
  status: TokenStatus;
  label: string;
}

/**
 * Checks the health of connected platform tokens by:
 * 1. Checking if tokens exist in the profiles table
 * 2. For platforms with expiry timestamps, checking if they're within 24h of expiring
 *
 * The actual API-level validation (making a test call) is too expensive to do
 * on every load, so we rely on expiry times and the `token_expires_at` columns.
 */
export function useTokenHealth(): { platformHealth: PlatformHealth[]; loading: boolean; refresh: () => void; } {
  const [platformHealth, setPlatformHealth] = useState<PlatformHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'instagram_connected, instagram_token_expires_at, ' +
          'youtube_connected, youtube_token_expires_at, ' +
          'tiktok_connected, tiktok_token_expires_at, ' +
          'threads_connected, threads_token_expires_at'
        )
        .eq('id', user.id)
        .maybeSingle();

      if (!active) return;

      const now = Date.now();
      const SOON_MS = 24 * 60 * 60 * 1000; // 24 hours

      const check = (
        platform: string,
        label: string,
        connected: boolean | null | undefined,
        expiresAt: string | null | undefined
      ): PlatformHealth => {
        if (!connected) return { platform, status: 'missing', label };
        if (expiresAt) {
          const expMs = new Date(expiresAt).getTime();
          if (expMs - now < SOON_MS) return { platform, status: 'expired', label };
        }
        return { platform, status: 'connected', label };
      };

      const health: PlatformHealth[] = [
        check('instagram', 'Instagram', profile?.instagram_connected, profile?.instagram_token_expires_at),
        check('youtube', 'YouTube', profile?.youtube_connected, profile?.youtube_token_expires_at),
        check('tiktok', 'TikTok', profile?.tiktok_connected, profile?.tiktok_token_expires_at),
        check('threads', 'Threads', profile?.threads_connected, profile?.threads_token_expires_at),
      ].filter((h) => h.status !== 'missing'); // only show platforms that were at some point connected

      setPlatformHealth(health);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [tick]);

  return { platformHealth, loading, refresh };
}
