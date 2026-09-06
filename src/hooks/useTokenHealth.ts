import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { assessTokenHealth, type PlatformHealth } from '../lib/tokenHealth';

export type { PlatformHealth, TokenStatus } from '../lib/tokenHealth';

/**
 * Health of the DIRECT platform grants the app still relies on (see
 * src/lib/tokenHealth.ts for which ones and why). Reads the token_health
 * view (derived booleans + expiry only) so raw tokens never reach the
 * browser. See migration 20260701000100_add_token_health_view.sql.
 */
export function useTokenHealth(): { platformHealth: PlatformHealth[]; loading: boolean; refresh: () => void } {
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
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: row } = await supabase
        .from('token_health')
        .select('instagram_connected, instagram_token_expires_at, youtube_connected, youtube_token_expires_at, threads_connected, threads_token_expires_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!active) return;
      setPlatformHealth(assessTokenHealth(row));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [tick]);

  return { platformHealth, loading, refresh };
}
