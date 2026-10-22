import { supabase } from './supabase';

/**
 * The daily AI quota, as the app shows it.
 *
 * The edge functions are the gate: each reserves a request with
 * increment_ai_request (service role) before calling the model and refunds it
 * if the call produces nothing. The app reads its own numbers through
 * get_my_ai_quota(), which applies the tier limits from ai_daily_limit in
 * SQL, so the limits exist in exactly one place (migration 20261022130000).
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

type QuotaRow = { requests_used: number; daily_limit: number; reset_at: string };

// The RPC reads the session user; there is no user id to pass.
export async function getAIQuota(): Promise<AIQuotaInfo> {
  try {
    const { data, error } = await supabase.rpc('get_my_ai_quota');
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as QuotaRow | undefined;
    if (!row) throw new Error('No quota row for this user');
    const requestsUsed = Number(row.requests_used) || 0;
    const dailyLimit = Number(row.daily_limit) || 0;
    return {
      requestsUsed,
      requestsRemaining: Math.max(dailyLimit - requestsUsed, 0),
      dailyLimit,
      resetAt: new Date(row.reset_at),
    };
  } catch (err) {
    console.error('Error fetching AI quota:', err);
    return {
      requestsUsed: 0,
      requestsRemaining: 0,
      dailyLimit: 0,
      resetAt: new Date(Date.now() + DAY_MS),
      unavailable: true,
    };
  }
}

export async function checkAIQuotaAvailable(): Promise<boolean> {
  const quota = await getAIQuota();
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
