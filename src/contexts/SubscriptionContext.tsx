import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

type SubscriptionTier = 'free' | 'paid';

type SubscriptionContextType = {
  tier: SubscriptionTier;
  isLoading: boolean;
  updateTier: (newTier: SubscriptionTier) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('free');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadSubscription();
    } else {
      setTier('free');
      setIsLoading(false);
    }
  }, [user]);

  const loadSubscription = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('subscription_tier')
      .eq('id', user.id)
      .maybeSingle();

    if (data) {
      setTier(data.subscription_tier || 'free');
    }
    setIsLoading(false);
  };

  const updateTier = async (newTier: SubscriptionTier) => {
    if (!user) return;

    const { error } = await supabase
      .from('profiles')
      .update({ subscription_tier: newTier })
      .eq('id', user.id);

    if (!error) {
      setTier(newTier);
    }
  };

  return (
    <SubscriptionContext.Provider value={{ tier, isLoading, updateTier }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
