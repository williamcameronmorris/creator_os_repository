/**
 * Connected accounts and follower counts from Post for Me, for Clio's data
 * block. Never throws: a failure comes back as `failed` so the answer can say
 * the data didn't load.
 */

const POSTFORME_API_KEY = Deno.env.get("Post_For_Me_API");
const PFM_BASE = "https://api.postforme.dev";

export interface PfmAccount { id: string; platform: string; username?: string | null; status?: string; }
export interface PfmContext { accounts: PfmAccount[]; followersByPlatform: Record<string, number>; failed: boolean; }

/**
 * Pull connected accounts + follower counts from Post for Me, with a hard
 * 3s timeout so a slow PFM doesn't block Clio. On error it returns empty with
 * `failed` set, so the answer can say the data didn't load instead of
 * reporting zero accounts.
 */
export async function fetchPostForMeContext(externalId: string): Promise<PfmContext> {
  const empty: PfmContext = { accounts: [], followersByPlatform: {}, failed: false };
  const failed: PfmContext = { ...empty, failed: true };
  if (!POSTFORME_API_KEY) return empty;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);
  try {
    // Post for Me is a single shared workspace keyed by external_id (= our
    // user id). Without this filter every user's Clio saw every OTHER user's
    // connected accounts and follower counts. Scope to the caller, matching
    // postforme-sync's listAccounts(userId).
    const accountsRes = await fetch(
      `${PFM_BASE}/v1/social-accounts?external_id=${encodeURIComponent(externalId)}`,
      { headers: { Authorization: `Bearer ${POSTFORME_API_KEY}` }, signal: ctrl.signal },
    );
    if (!accountsRes.ok) { clearTimeout(timeout); return failed; }
    const accountsBody = await accountsRes.json();
    const accountList: PfmAccount[] = Array.isArray(accountsBody) ? accountsBody : (accountsBody?.data || []);
    const connected = accountList.filter((a) => a.status !== "disconnected");
    const followersByPlatform: Record<string, number> = {};
    const feedResults = await Promise.allSettled(connected.map(async (account) => {
      const feedRes = await fetch(`${PFM_BASE}/v1/social-account-feeds/${encodeURIComponent(account.id)}`, {
        headers: { Authorization: `Bearer ${POSTFORME_API_KEY}` }, signal: ctrl.signal,
      });
      if (!feedRes.ok) return null;
      const body = await feedRes.json();
      const followers = Number(body?.followers ?? body?.follower_count ?? body?.metadata?.followers ?? body?.account?.followers ?? 0);
      return { platform: account.platform, followers };
    }));
    for (const r of feedResults) {
      if (r.status === "fulfilled" && r.value && r.value.followers > 0) {
        const key = r.value.platform;
        followersByPlatform[key] = Math.max(followersByPlatform[key] || 0, r.value.followers);
      }
    }
    clearTimeout(timeout);
    return { accounts: connected, followersByPlatform, failed: false };
  } catch (err) {
    clearTimeout(timeout);
    console.warn("PFM context fetch failed:", (err as Error).message);
    return failed;
  }
}
