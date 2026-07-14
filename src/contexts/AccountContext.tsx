import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { useConnectionStatus } from './ConnectionStatusContext';
import { listConnectedAccounts, type PostForMeAccount } from '../lib/postforme';

/**
 * Account separation: which connected social account the app is "acting as".
 *
 * The Account Switcher in the header sets this; Watch, Analytics, Clio,
 * Studio generation, and the Voice card all read it so each account gets its
 * own voice, its own niche, and its own analytics.
 *
 *   activeAccount = a PostForMeAccount → the app is pinned to that account
 *   activeAccount = null              → "All accounts" (legacy user-level view)
 *
 * Accounts come from listPostForMeAccounts via ConnectionStatusContext (one
 * fetch, shared with the connection banner) rather than a second PFM
 * round-trip. The selection is persisted in localStorage so it survives
 * reloads; default is the FIRST connected account (platform-grouped order).
 */

const STORAGE_KEY = 'clio_active_account';
// Sentinel stored when the user explicitly picks "All accounts", so we can
// tell it apart from "no stored choice yet" (which defaults to first account).
const ALL_ACCOUNTS = '__all__';

interface AccountContextValue {
  /** Connected (non-disconnected) accounts, stable platform-grouped order. */
  accounts: PostForMeAccount[];
  /** The pinned account, or null for "All accounts". */
  activeAccount: PostForMeAccount | null;
  setActiveAccount: (account: PostForMeAccount | null) => void;
  /** True while the initial PFM account list is loading. */
  loading: boolean;
}

const AccountContext = createContext<AccountContextValue>({
  accounts: [],
  activeAccount: null,
  setActiveAccount: () => {},
  loading: true,
});

export function AccountProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { accounts: rawAccounts, loading } = useConnectionStatus();
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const accounts = useMemo(() => listConnectedAccounts(rawAccounts), [rawAccounts]);

  // Signed out → forget the in-memory selection; signed (back) in → re-read
  // the persisted one, so the same user lands on the account they had pinned.
  // (A different user's stored id simply won't match their accounts and falls
  // back to the default below.)
  useEffect(() => {
    if (!user) {
      setSelectedId(null);
      return;
    }
    try {
      setSelectedId(localStorage.getItem(STORAGE_KEY));
    } catch {
      setSelectedId(null);
    }
  }, [user]);

  const activeAccount = useMemo(() => {
    if (loading || accounts.length === 0) return null;
    if (selectedId === ALL_ACCOUNTS) return null;
    if (selectedId) {
      const found = accounts.find((a) => a.id === selectedId);
      if (found) return found;
      // Stored account was disconnected — fall through to the default.
    }
    // Default: first connected account.
    return accounts[0];
  }, [accounts, selectedId, loading]);

  const setActiveAccount = (account: PostForMeAccount | null) => {
    const value = account ? account.id : ALL_ACCOUNTS;
    setSelectedId(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Private mode / storage full — selection still works for this session.
    }
  };

  return (
    <AccountContext.Provider value={{ accounts, activeAccount, setActiveAccount, loading }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
