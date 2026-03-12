import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { detectBrowserTimezone } from '../lib/timezone';

/**
 * Returns the user's stored timezone (from profiles.timezone).
 * Falls back to browser timezone while loading or if not set.
 */
export function useTimezone(): { timezone: string; loading: boolean } {
  const [timezone, setTimezone] = useState<string>(detectBrowserTimezone());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await supabase
        .from('profiles')
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle();

      if (active && data?.timezone) {
        setTimezone(data.timezone);
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return { timezone, loading };
}
