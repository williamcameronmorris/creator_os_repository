import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';
import { PRICING_ENABLED } from '../lib/featureFlags';

type SubscriptionTier = 'free' | 'paid';

type SubscriptionContextType = {
  tier: SubscriptionTier;
  isLoading: boolean;
  updateTier: (newTier: SubscriptionTier) => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // When PRICING_ENABLED is false, every user is treated as paid so paywalls don't trigger.
  const [tier, setTier] = useState<SubscriptionTier>(PRICING_ENABLED ? 'free' : 'paid');
  const [isLoading, setIsLoading] = useState(PRICING_ENABLED);

  useEffect(() => {
    if (!PRICING_ENABLED) {
      setTier('paid');
      setIsLoading(false);
      return;
    }
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

  // The tier is server-owned: increment_ai_request reads it to size the AI
  // quota, so the app has no grant to write it (migration 20261022120100). A
  // real upgrade path sets it from the payment webhook on the service role.
  const updateTier = async () => {
    throw new Error('Subscription changes are applied by the billing system, not the app.');
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
