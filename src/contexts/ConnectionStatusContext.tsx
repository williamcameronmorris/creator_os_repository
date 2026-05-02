import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  POSTFORME_PLATFORMS,
  listPostForMeAccounts,
  type PostForMeAccount,
  type PostForMePlatformId,
} from '../lib/postforme';

/**
 * Tracks whether the user has at least one supported, non-disconnected
 * Post for Me social account.
 *
 * Used by:
 *   - <ConnectionGateBanner /> to nudge users with zero connections
 *   - Onboarding's connect step (future) to flip "Continue" → "Continue (1)"
 *
 * One source of truth so we don't fan out N copies of listPostForMeAccounts
 * when the banner mounts on every route change.
 */

interface ConnectionStatus {
  hasConnected: boolean;
  loading: boolean;
  accounts: PostForMeAccount[];
  refresh: () => Promise<void>;
}

const ConnectionStatusContext = createContext<ConnectionStatus>({
  hasConnected: false,
  loading: true,
  accounts: [],
  refresh: async () => {},
});

export function ConnectionStatusProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<PostForMeAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const supportedIds = new Set(POSTFORME_PLATFORMS.map((p) => p.id));
  const supportedAccounts = accounts.filter(
    (a) => supportedIds.has(a.platform as PostForMePlatformId) && a.status !== 'disconnected'
  );
  const hasConnected = supportedAccounts.length > 0;

  const refresh = useCallback(async () => {
    if (!user) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const state = await listPostForMeAccounts(user.id, true);
      setAccounts(state.accounts);
    } catch {
      // PFM down / network blip — assume nothing connected, banner will
      // re-fetch on the next mount or manual refresh().
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ConnectionStatusContext.Provider value={{ hasConnected, loading, accounts, refresh }}>
      {children}
    </ConnectionStatusContext.Provider>
  );
}

export function useConnectionStatus() {
  return useContext(ConnectionStatusContext);
}
