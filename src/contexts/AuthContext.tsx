import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  /**
   * True from the moment a password-recovery link lands until the person
   * sets a new password (or skips). The recovery link signs them in, so the
   * app must read this flag to show the reset form instead of the home page.
   */
  passwordRecovery: boolean;
  endPasswordRecovery: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    // The reset email points at `/?reset=true`. Supabase consumes the token in
    // the URL hash and emits PASSWORD_RECOVERY, but that event can fire before
    // this listener is attached on a cold load, so the query param is the
    // second signal: a session plus `?reset=true` also means recovery.
    const urlSaysReset = new URLSearchParams(window.location.search).get('reset') === 'true';

    // Mount guard: prevents setState after unmount and stops a stale getSession
    // resolution from clobbering a newer onAuthStateChange event.
    let mounted = true;

    // Safety net: never leave the app stuck loading longer than 5s.
    const timeout = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return;
        setUser(session?.user ?? null);
        if (session && urlSaysReset) setPasswordRecovery(true);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (mounted) setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY' || (session && urlSaysReset)) setPasswordRecovery(true);
      if (event === 'SIGNED_OUT') setPasswordRecovery(false);
      setLoading(false);
    });

    return () => {
      mounted = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    // Clear local auth state even if the network call fails (offline), so the
    // UI doesn't stay stuck on the authed screens with a half-cleared session.
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore network errors — we still sign out locally */
    } finally {
      setUser(null);
    }
  };

  const endPasswordRecovery = () => {
    setPasswordRecovery(false);
    // Drop `?reset=true` so a reload doesn't reopen the reset form.
    if (window.location.search.includes('reset=true')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/?reset=true',
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, loading, passwordRecovery, endPasswordRecovery, signIn, signUp, signOut, resetPassword, updatePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
