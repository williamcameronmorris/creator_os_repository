import { supabase } from './supabase';

/**
 * The daily AI quota, as the app shows it.
 *
 * The edge functions are the gate: each reserves a request with
 * increment_ai_request (service role) before calling the model. That RPC and
 * check_and_reset_ai_quota are no longer executable by signed-in users
 * (migration 20260914000300), so the app reads its own ai_request_usage row
 * directly (RLS: own row only) and applies the same tier limits the
 * functions use.
 *
 * Fails closed: if the read errors, the quota reports zero remaining and
 * `unavailable`, so a screen never promises credits it cannot confirm.
 */

export interface AIQuotaInfo {
  requestsUsed: number;
  requestsRemaining: number;
  dailyLimit: number;
  resetAt: Date;
  /** True when the quota could not be read; the numbers are a safe floor. */
  unavailable?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Mirrors increment_ai_request(uuid) in the database.
function limitForTier(tier: string | null | undefined): number {
  switch ((tier || 'free').toLowerCase()) {
    case 'admin': return 100000;
    case 'paid': return 200;
    default: return 15;
  }
}

export async function getAIQuota(userId: string): Promise<AIQuotaInfo> {
  try {
    const [usageRes, profileRes] = await Promise.all([
      supabase
        .from('ai_request_usage')
        .select('daily_requests_used, last_reset_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('subscription_tier')
        .eq('id', userId)
        .maybeSingle(),
    ]);
    if (usageRes.error) throw usageRes.error;
    if (profileRes.error) throw profileRes.error;

    const dailyLimit = limitForTier(profileRes.data?.subscription_tier);
    const usage = usageRes.data;
    const now = Date.now();

    // No row yet: nothing spent today. The first reservation creates it.
    if (!usage) {
      return { requestsUsed: 0, requestsRemaining: dailyLimit, dailyLimit, resetAt: new Date(now + DAY_MS) };
    }

    // The window resets 24h after last_reset_at. Past that point the next
    // reservation zeroes the counter, so show it as already reset.
    const resetAt = new Date(usage.last_reset_at).getTime() + DAY_MS;
    const expired = resetAt <= now;
    const requestsUsed = expired ? 0 : usage.daily_requests_used;
    return {
      requestsUsed,
      requestsRemaining: Math.max(dailyLimit - requestsUsed, 0),
      dailyLimit,
      resetAt: new Date(expired ? now + DAY_MS : resetAt),
    };
  } catch (err) {
    console.error('Error fetching AI quota:', err);
    return {
      requestsUsed: 15,
      requestsRemaining: 0,
      dailyLimit: 15,
      resetAt: new Date(Date.now() + DAY_MS),
      unavailable: true,
    };
  }
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
