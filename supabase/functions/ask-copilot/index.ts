import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTFORME_API_KEY = Deno.env.get("Post_For_Me_API");
const PFM_BASE = "https://api.postforme.dev";

const PFM_PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube",
  facebook: "Facebook", threads: "Threads", linkedin: "LinkedIn",
  x: "X / Twitter", twitter: "X / Twitter",
  pinterest: "Pinterest", bluesky: "Bluesky",
};

interface PfmAccount { id: string; platform: string; username?: string | null; status?: string; }
interface PfmContext { accounts: PfmAccount[]; followersByPlatform: Record<string, number>; }

/**
 * Pull connected accounts + follower counts from Post for Me, with a hard
 * 3s timeout so a slow PFM doesn't block Clio. Falls back to empty on error.
 */
async function fetchPostForMeContext(): Promise<PfmContext> {
  const empty: PfmContext = { accounts: [], followersByPlatform: {} };
  if (!POSTFORME_API_KEY) return empty;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);
  try {
    const accountsRes = await fetch(`${PFM_BASE}/v1/social-accounts`, {
      headers: { Authorization: `Bearer ${POSTFORME_API_KEY}` }, signal: ctrl.signal,
    });
    if (!accountsRes.ok) { clearTimeout(timeout); return empty; }
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
    return { accounts: connected, followersByPlatform };
  } catch (err) {
    clearTimeout(timeout);
    console.warn("PFM context fetch failed:", (err as Error).message);
    return empty;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" } });
  }
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const { userId, question } = await req.json();
    if (!userId || !question?.trim()) return new Response(JSON.stringify({ error: "userId and question are required" }), { status: 400, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    if (!ANTHROPIC_API_KEY) return new Response(JSON.stringify({ error: "AI service not configured." }), { status: 503, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: quotaData, error: quotaError } = await supabase.rpc("check_and_reset_ai_quota", { p_user_id: userId });
    if (quotaError || !quotaData || quotaData.length === 0) return new Response(JSON.stringify({ error: "Could not check AI quota." }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    const quota = quotaData[0];
    if (quota.requests_remaining <= 0) return new Response(JSON.stringify({ error: "Daily AI quota exceeded." }), { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];

    // Deals query is non-fatal — schema/columns may drift across users; if it
    // errors, return empty rather than killing the whole Clio response.
    async function fetchDeals() {
      try {
        const r = await supabase.from("deals")
          .select("brand_name, brand, stage, final_amount, quote_standard")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(10);
        return r.error ? [] : (r.data || []);
      } catch { return []; }
    }

    const [profileResult, metricsResult, postsResult, recentPostsResult, deals, pfmContext, inspirationResult, inspirationCountsResult] = await Promise.all([
      supabase.from("profiles").select("full_name, display_name, instagram_avg_views, tiktok_avg_views, youtube_avg_views, instagram_access_token, instagram_business_account_id, tiktok_access_token, youtube_access_token").eq("id", userId).maybeSingle(),
      supabase.from("platform_metrics").select("platform, date, followers_count, avg_engagement_rate").eq("user_id", userId).gte("date", sevenDaysAgo).order("date", { ascending: false }),
      supabase.from("content_posts").select("title, platform, media_type, views, likes, comments, engagement_rate, published_at").eq("user_id", userId).eq("status", "published").gte("published_at", thirtyDaysAgo).order("engagement_rate", { ascending: false }).limit(10),
      supabase.from("content_posts").select("title, platform, media_type, views, likes, comments, saves, shares, engagement_rate, published_at").eq("user_id", userId).eq("status", "published").gte("published_at", sevenDaysAgo).order("published_at", { ascending: false }).limit(15),
      fetchDeals(),
      fetchPostForMeContext(),
      supabase.from("inspiration_entries").select("post_title, platform, content_format, hook_framework, hook_text, topic_tags, tactical_notes, creator, likes, views").eq("performance_tier", "Outlier").order("likes", { ascending: false, nullsFirst: false }).limit(15),
      supabase.from("inspiration_entries").select("performance_tier, hook_framework"),
    ]);

    const profile = profileResult.data;
    const creatorName = profile?.display_name || profile?.full_name?.split(" ")[0] || "Creator";

    const connectedSet = new Set<string>();
    if (profile?.instagram_access_token || profile?.instagram_business_account_id) connectedSet.add("Instagram");
    if (profile?.tiktok_access_token) connectedSet.add("TikTok");
    if (profile?.youtube_access_token) connectedSet.add("YouTube");
    for (const account of pfmContext.accounts) {
      const label = PFM_PLATFORM_LABELS[account.platform.toLowerCase()] || account.platform;
      connectedSet.add(label);
    }
    const connectedPlatforms = [...connectedSet];

    // platform_metrics rows are LATEST-50-POSTS-CUMULATIVE snapshots, not
    // daily deltas. Use them only for current-state signals (followers,
    // typical engagement rate). Compute true 7-day stats from content_posts.
    const recentMetrics = metricsResult.data || [];
    const latestSnapshotByPlatform: Record<string, { followers: number; avgEng: number; date: string }> = {};
    for (const m of recentMetrics) {
      const cur = latestSnapshotByPlatform[m.platform];
      if (!cur || (m.date && m.date > cur.date)) {
        latestSnapshotByPlatform[m.platform] = {
          followers: m.followers_count || 0,
          avgEng: Number(m.avg_engagement_rate) || 0,
          date: m.date || "",
        };
      }
    }

    const recentPostsForRollup = recentPostsResult.data || [];
    const sevenDayByPlatform: Record<string, { posts: number; views: number; likes: number; comments: number; saves: number; shares: number }> = {};
    for (const p of recentPostsForRollup) {
      if (!sevenDayByPlatform[p.platform]) sevenDayByPlatform[p.platform] = { posts: 0, views: 0, likes: 0, comments: 0, saves: 0, shares: 0 };
      const a = sevenDayByPlatform[p.platform];
      a.posts++;
      a.views += Number(p.views) || 0;
      a.likes += Number(p.likes) || 0;
      a.comments += Number(p.comments) || 0;
      a.saves += Number((p as { saves?: number }).saves) || 0;
      a.shares += Number((p as { shares?: number }).shares) || 0;
    }
    const totalRecentViews = Object.values(sevenDayByPlatform).reduce((s, a) => s + a.views, 0);
    const totalRecentEng = Object.values(sevenDayByPlatform).reduce((s, a) => s + a.likes + a.comments, 0);
    const totalRecentPosts = Object.values(sevenDayByPlatform).reduce((s, a) => s + a.posts, 0);

    const platformsTouched = new Set<string>([
      ...Object.keys(sevenDayByPlatform),
      ...Object.keys(latestSnapshotByPlatform),
    ]);
    const platformLines = [
      ...[...platformsTouched].sort().map((p) => {
        const w = sevenDayByPlatform[p];
        const snap = latestSnapshotByPlatform[p];
        const followers = (snap?.followers ?? 0) > 0 ? snap.followers : (pfmContext.followersByPlatform[p] || 0);
        const followersStr = followers > 0 ? `, ${followers.toLocaleString()} followers` : "";
        const avgEngStr = (snap?.avgEng ?? 0) > 0 ? `, ${snap.avgEng.toFixed(2)}% typical post engagement` : "";
        if (w && w.posts > 0) {
          const eng = w.likes + w.comments + w.saves + w.shares;
          return `  - ${p}: ${w.posts} post${w.posts === 1 ? "" : "s"} in last 7d (${w.views.toLocaleString()} views, ${w.likes.toLocaleString()} likes, ${w.comments.toLocaleString()} comments, ${eng.toLocaleString()} total engagements)${followersStr}${avgEngStr}`;
        }
        return `  - ${p}: 0 posts in last 7d${followersStr}${avgEngStr}`;
      }),
      ...pfmContext.accounts.filter((a) => !platformsTouched.has(a.platform)).map((a) => {
        const followers = pfmContext.followersByPlatform[a.platform] || 0;
        const followersStr = followers > 0 ? `${followers.toLocaleString()} followers` : "no follower data yet";
        const label = PFM_PLATFORM_LABELS[a.platform.toLowerCase()] || a.platform;
        return `  - ${label}: connected${a.username ? ` (@${a.username})` : ""}, ${followersStr}, no published-post metrics yet`;
      }),
    ].join("\n");

    const posts = postsResult.data || [];
    const topPostLines = posts.slice(0, 5).map((p, i) => {
      const engStr = p.engagement_rate ? ` (${Number(p.engagement_rate).toFixed(1)}% eng)` : "";
      const viewStr = p.views ? ` — ${Number(p.views).toLocaleString()} views` : "";
      const dateStr = p.published_at ? ` [${new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}]` : "";
      return `  ${i + 1}. [${p.platform}]${dateStr} "${p.title || "Untitled"}"${viewStr}${engStr}`;
    }).join("\n");

    const recentPosts = recentPostsResult.data || [];
    const recentPostLines = recentPosts.slice(0, 10).map((p) => {
      const dateStr = p.published_at ? new Date(p.published_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "unknown date";
      const viewStr = p.views ? `${Number(p.views).toLocaleString()} views` : "no view data yet";
      const likeStr = p.likes ? `, ${Number(p.likes).toLocaleString()} likes` : "";
      const commentStr = p.comments ? `, ${Number(p.comments).toLocaleString()} comments` : "";
      const saveStr = p.saves ? `, ${Number(p.saves).toLocaleString()} saves` : "";
      const engStr = p.engagement_rate ? `, ${Number(p.engagement_rate).toFixed(1)}% eng` : "";
      return `  - ${dateStr} [${p.platform}] "${p.title || "Untitled"}" — ${viewStr}${likeStr}${commentStr}${saveStr}${engStr}`;
    }).join("\n");

    const inspirationOutliers = inspirationResult.data || [];
    const inspirationAll = inspirationCountsResult.data || [];
    const tierCounts = inspirationAll.reduce((acc: Record<string, number>, e: { performance_tier?: string }) => {
      const t = e.performance_tier || "Untested"; acc[t] = (acc[t] || 0) + 1; return acc;
    }, {});
    const frameworkCounts = inspirationAll.reduce((acc: Record<string, number>, e: { hook_framework?: string }) => {
      const f = e.hook_framework || ""; if (f) acc[f] = (acc[f] || 0) + 1; return acc;
    }, {});
    const topFrameworks = Object.entries(frameworkCounts).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 5).map(([fw, count]) => `${fw} (${count})`).join(", ");
    const inspirationLines = inspirationOutliers.slice(0, 12).map((e: any) => {
      const platform = e.platform ? `[${e.platform}]` : "";
      const framework = e.hook_framework ? ` ${e.hook_framework}` : "";
      const stats = [
        e.views ? `${Number(e.views).toLocaleString()} views` : "",
        e.likes ? `${Number(e.likes).toLocaleString()} likes` : "",
      ].filter(Boolean).join(", ");
      const hook = e.hook_text ? `\n      Hook: "${String(e.hook_text).slice(0, 150)}"` : "";
      const notes = e.tactical_notes ? `\n      Notes: ${String(e.tactical_notes).slice(0, 200)}` : "";
      const creator = e.creator ? ` by ${e.creator}` : "";
      return `  - ${platform}${framework}${creator} — ${stats || "no stats"}${hook}${notes}`;
    }).join("\n");

    const dealLines = deals.length > 0
      ? deals.map((d: any) => {
          const name = d.brand_name || d.brand || "Unknown brand";
          const stage = (d.stage || "").replace(/_/g, " ");
          const value = Number(d.final_amount ?? d.quote_standard ?? 0);
          return `  - ${name}${stage ? ` (${stage})` : ""}${value > 0 ? `: $${value.toLocaleString()}` : ""}`;
        }).join("\n")
      : "  No active deals";
    const totalDealValue = deals.reduce((s: number, d: any) => s + Number(d.final_amount ?? d.quote_standard ?? 0), 0);

    const viewsSummary = totalRecentPosts > 0
      ? `${totalRecentPosts} post${totalRecentPosts === 1 ? "" : "s"} published in last 7 days, ${totalRecentEng.toLocaleString()} total engagements${totalRecentViews > 0 ? `, ${totalRecentViews.toLocaleString()} total views` : " (view counts not exposed for IG image/carousel posts)"}`
      : "No posts in the last 7 days";

    // Data block is now post-first. Platform aggregates ride along as light
    // context, not headlines. Clio is instructed in the system prompt to
    // reason at the post level — to spot patterns, point at specific posts,
    // and tie recommendations to a concrete saved Outlier.
    const context = `DATA BLOCK — every number below is real and grounded. Anything not listed here, you don't have.

CREATOR PROFILE:
Name: ${creatorName}
Connected platforms: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(", ") : "None connected yet"}

═══ THIS WEEK'S POSTS (last 7 days, newest first) ═══
${viewsSummary}
${recentPostLines || "  No posts in the last 7 days"}

═══ TOP POSTS (last 30 days, ranked by engagement rate) ═══
${topPostLines || "  No published posts yet"}

═══ INSPIRATION LIBRARY — saved Outlier examples (study these for hook patterns) ═══
Total entries: ${inspirationAll.length} | By tier: ${Object.entries(tierCounts).map(([t, c]) => `${t}: ${c}`).join(", ") || "none"}
Top hook frameworks (most-saved): ${topFrameworks || "none"}

${inspirationLines || "  No Outliers in library yet"}

─── BACKGROUND CONTEXT (current state per platform — use as reference, not as headline numbers) ───
${platformLines || "  No platform data available"}

─── ACTIVE DEAL PIPELINE ───
${dealLines}${deals.length > 0 ? `\nTotal pipeline value: $${totalDealValue.toLocaleString()}` : ""}`.trim();

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        // Deno's default User-Agent ("Deno/x.x.x") triggers Anthropic's
        // Cloudflare bot challenge on /v1/messages. Pinning a friendly UA
        // bypasses the challenge.
        "User-Agent": "cliopatra-ask-copilot/1.0",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: `You are Clio, the creator's personal analytics + inspiration copilot inside Cliopatra Social. The DATA block below has two grounded sources: (a) their real per-post performance, (b) their curated Inspiration Library of Outlier posts.

YOUR JOB: reason at the POST level, not the platform level. Find patterns across specific posts. Pair what they're already doing well with a concrete saved Outlier example. Avoid kitchen-sink platform summaries.

GROUNDING RULES — non-negotiable:
1. NEVER invent metrics. If a number isn't in the DATA block, say "I don't have that data yet".
2. NEVER lead with a platform aggregate. Lead with a specific post or pattern.
3. NEVER assume a platform is connected unless it's in "Connected platforms".
4. "Typical post engagement" is a rolling average — NOT a 7-day delta. Don't frame it as recent activity.
5. Quote your sources. When you cite a number, name the post or platform it came from.

POST-LEVEL REASONING — when the user asks "what should I post" or "how am I doing":
6. Pick out 1-2 SPECIFIC posts from the data block and name what worked or didn't.
7. Pair the recommendation with a concrete saved Outlier example by quoting the saved Hook text and tactical notes.
8. Never recommend a hook framework absent from "Top hook frameworks".
9. If the library has zero Outliers in a relevant framework, say so — don't make up examples.

ANTI-PATTERNS — do not do these:
- "Your Instagram is carrying all the momentum at 145K followers, 0.20% engagement…" (this is platform-level kitchen sink)
- "Your YouTube is your strongest platform" (vague, no post cited)
- "Try a Reel" (no framework, no example, no signal tie-in)

GOOD ANSWER SHAPE:
- One specific observation tied to a named post: "Your Bigsby install Reel from Tuesday hit 234 likes — top performer this week."
- One specific pattern call-out: "Three of your last 7 posts use How-To framing. They average 2.5x your typical engagement."
- One concrete recommendation tied to a saved Outlier: "@myrongolden's Outlier ('Break it down: What to do, when to do it, why...') maps perfectly to your tone-mod content. Try a 60-sec Reel framed that way on out-of-phase wiring."

Style: direct, post-level, under 250 words. No filler, no preamble, no platform-aggregate openers.

${context}`,
        messages: [{ role: "user", content: question.trim() }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", anthropicRes.status, errText);
      throw new Error("AI service error");
    }

    const anthropicData = await anthropicRes.json();
    const answer = anthropicData.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(JSON.stringify({ answer, success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ask-copilot error:", message);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
