import { supabase } from './supabase';

export interface AIQuotaInfo {
  requestsUsed: number;
  requestsRemaining: number;
  dailyLimit: number;
  resetAt: Date;
}

export async function getAIQuota(userId: string): Promise<AIQuotaInfo> {
  const { data, error } = await supabase
    .rpc('check_and_reset_ai_quota', { p_user_id: userId });

  if (error) {
    console.error('Error fetching AI quota:', error);
    return {
      requestsUsed: 0,
      requestsRemaining: 15,
      dailyLimit: 15,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }

  // The RPC can return an empty set (e.g. a user whose quota row isn't created
  // yet); data[0] would then be undefined and crash. Fall back to a fresh quota.
  const quotaData = data?.[0];
  if (!quotaData) {
    return {
      requestsUsed: 0,
      requestsRemaining: 15,
      dailyLimit: 15,
      resetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    };
  }
  return {
    requestsUsed: quotaData.requests_used,
    requestsRemaining: quotaData.requests_remaining,
    dailyLimit: 15,
    resetAt: new Date(quotaData.reset_at),
  };
}

export async function incrementAIRequest(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .rpc('increment_ai_request', { p_user_id: userId });

  if (error) {
    console.error('Error incrementing AI request:', error);
    return false;
  }

  return data as boolean;
}

export async function checkAIQuotaAvailable(userId: string): Promise<boolean> {
  const quota = await getAIQuota(userId);
  return quota.requestsRemaining > 0;
}

export function formatResetTime(resetAt: Date): string {
  const now = new Date();
  const diff = resetAt.getTime() - now.getTime();

  if (diff <= 0) {
    return 'Resetting now...';
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `Resets in ${hours}h ${minutes}m`;
  }
  return `Resets in ${minutes}m`;
}
