/**
 * AI request quota, reserved before a model call and handed back if the call
 * produced nothing.
 *
 * Reserving first is what keeps two concurrent requests from both slipping
 * under the limit (increment_ai_request is one guarded UPDATE). The cost of
 * reserving first is that a model error, timeout or bad response would burn a
 * request the creator got nothing for, so every function that reserves also
 * refunds on its error path:
 *
 *   let refund: Refund | null = null;
 *   try {
 *     refund = await reserveAiRequest(supabase, userId);   // throws QuotaError
 *     ...model call...
 *     return ok;
 *   } catch (e) {
 *     await refund?.();
 *     ...
 *   }
 *
 * The tier limits live in SQL only (ai_daily_limit); the app reads its quota
 * through get_my_ai_quota, so there is no second copy to drift.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type Refund = () => Promise<void>;

export class QuotaError extends Error {
  constructor(message: string, readonly exceeded: boolean) {
    super(message);
    this.name = "QuotaError";
  }
}

export const QUOTA_EXCEEDED_MESSAGE = "Daily AI quota exceeded. Resets at midnight.";

/**
 * Reserve one request. Resolves to a refund function (call it at most once;
 * later calls are no-ops). Throws QuotaError when the day's limit is reached
 * (`exceeded`) or the quota could not be checked.
 */
export async function reserveAiRequest(supabase: SupabaseClient, userId: string): Promise<Refund> {
  const { data: reserved, error } = await supabase.rpc("increment_ai_request", { p_user_id: userId });
  if (error) throw new QuotaError("Failed to check AI quota", false);
  if (!reserved) throw new QuotaError(QUOTA_EXCEEDED_MESSAGE, true);

  let spent = false;
  return async () => {
    if (spent) return;
    spent = true;
    const { error: refundError } = await supabase.rpc("refund_ai_request", { p_user_id: userId });
    // A failed refund costs the creator one request; it must never mask the
    // original error the caller is about to report.
    if (refundError) console.error("refund_ai_request failed:", refundError.message);
  };
}
