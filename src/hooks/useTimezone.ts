import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { detectBrowserTimezone } from '../lib/timezone';

/**
 * The user's stored timezone (profiles.timezone), set from Settings.
 * Falls back to the browser's zone while loading, when nothing is stored,
 * or when the read fails; a failed read is logged rather than ignored so a
 * missing column or policy shows up in the console instead of silently
 * shifting every scheduled time.
 */
export function useTimezone(): { timezone: string; loading: boolean } {
  const [timezone, setTimezone] = useState<string>(detectBrowserTimezone());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) return;

        const { data, error } = await supabase
          .from('profiles')
          .select('timezone')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.warn('[useTimezone] could not read profiles.timezone:', error.message);
          return;
        }
        if (active && data?.timezone) setTimezone(data.timezone);
      } catch (err) {
        console.warn('[useTimezone]', (err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  return { timezone, loading };
}
