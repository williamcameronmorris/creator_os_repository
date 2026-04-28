import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const POSTFORME_API_KEY = Deno.env.get("Post_For_Me_API");
const PFM_BASE = "https://api.postforme.dev";

const PFM_PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  facebook: "Facebook",
  threads: "Threads",
  linkedin: "LinkedIn",
  x: "X / Twitter",
  twitter: "X / Twitter",
  pinterest: "Pinterest",
  bluesky: "Bluesky",
};

interface PfmAccount {
  id: string;
  platform: string;
  username?: string | null;
  status?: string;
}

interface PfmContext {
  accounts: PfmAccount[];
  followersByPlatform: Record<string, number>;
}

/**
 * Pull connected accounts + follower counts from Post for Me.
 * Used to ground Clio's answers — without this, ask-copilot only sees the
 * legacy direct-integration token fields and reports PFM-connected users as
 * "None connected yet", which causes Haiku to fabricate numbers.
 *
 * Hard 3s timeout so a slow PFM doesn't block the chat response.
 */
async function fetchPostForMeContext(): Promise<PfmContext> {
  const empty: PfmContext = { accounts: [], followersByPlatform: {} };
  if (!POSTFORME_API_KEY) return empty;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 3000);

  try {
    const accountsRes = await fetch(`${PFM_BASE}/v1/social-accounts`, {
      headers: { Authorization: `Bearer ${POSTFORME_API_KEY}` },
      signal: ctrl.signal,
    });
    if (!accountsRes.ok) {
      clearTimeout(timeout);
      return empty;
    }
    const accountsBody = await accountsRes.json();
    const accountList: PfmAccount[] = Array.isArray(accountsBody)
      ? accountsBody
      : (accountsBody?.data || []);

    const connected = accountList.filter((a) => a.status !== "disconnected");
    const followersByPlatform: Record<string, number> = {};

    // Fetch feed (follower count + recent posts) for each connected account in parallel.
    // Each feed call is also bounded by the same abort signal.
    const feedResults = await Promise.allSettled(
      connected.map(async (account) => {
        const feedRes = await fetch(
          `${PFM_BASE}/v1/social-account-feeds/${encodeURIComponent(account.id)}`,
          {
            headers: { Authorization: `Bearer ${POSTFORME_API_KEY}` },
            signal: ctrl.signal,
          },
        );
        if (!feedRes.ok) return null;
        const body = await feedRes.json();
        // The feed response shape varies by platform — we look for any
        // common follower-count field. Anything we don't recognize is dropped.
        const followers = Number(
          body?.followers
            ?? body?.follower_count
            ?? body?.metadata?.followers
            ?? body?.account?.followers
            ?? 0,
        );
        return { platform: account.platform, followers };
      }),
    );

    for (const r of feedResults) {
      if (r.status === "fulfilled" && r.value && r.value.followers > 0) {
        const key = r.value.platform;
        followersByPlatform[key] = Math.max(
          followersByPlatform[key] || 0,
          r.value.followers,
        );
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
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const { userId, question } = await req.json();

    if (!userId || !question?.trim()) {
      return new Response(JSON.stringify({ error: "userId and question are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured. Set ANTHROPIC_API_KEY in Supabase secrets." }),
        { status: 503, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check AI quota
    const { data: quotaData, error: quotaError } = await supabase
      .rpc("check_and_reset_ai_quota", { p_user_id: userId });

    if (quotaError || !quotaData || quotaData.length === 0) {
      return new Response(JSON.stringify({ error: "Could not check AI quota." }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      });
    }

    const quota = quotaData[0];
    if (quota.requests_remaining <= 0) {
      return new Response(
        JSON.stringify({ error: "Daily AI quota exceeded. Resets at midnight UTC." }),
        { status: 429, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Pull creator context in parallel
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    const [profileResult, metricsResult, prevMetricsResult, postsResult, recentPostsResult, dealsResult, pfmContext] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, display_name, instagram_avg_views, tiktok_avg_views, youtube_avg_views, instagram_access_token, instagram_business_account_id, tiktok_access_token, youtube_access_token")
        .eq("id", userId)
        .maybeSingle(),

      supabase
        .from("platform_metrics")
        .select("platform, date, views, likes, comments, saves, followers_count, avg_engagement_rate")
        .eq("user_id", userId)
        .gte("date", sevenDaysAgo)
        .order("date", { ascending: false }),

      supabase
        .from("platform_metrics")
        .select("platform, date, views, likes, comments, avg_engagement_rate")
        .eq("user_id", userId)
        .gte("date", fourteenDaysAgo)
        .lt("date", sevenDaysAgo)
        .order("date", { ascending: false }),

      supabase
        .from("content_posts")
        .select("title, platform, media_type, views, likes, comments, engagement_rate, published_at")
        .eq("user_id", userId)
        .eq("status", "published")
        .gte("published_at", thirtyDaysAgo)
        .order("engagement_rate", { ascending: false })
        .limit(10),

      // Recent posts sorted by date (so Clio can answer "how did yesterday's post do")
      supabase
        .from("content_posts")
        .select("title, platform, media_type, views, likes, comments, saves, shares, engagement_rate, published_at")
        .eq("user_id", userId)
        .eq("status", "published")
        .gte("published_at", sevenDaysAgo)
        .order("published_at", { ascending: false })
        .limit(15),

      supabase
        .from("deals")
        .select("brand_name, status, total_value, deliverables_count")
        .eq("user_id", userId)
        .in("status", ["negotiating", "contract_sent", "in_production", "pending_payment"])
        .order("created_at", { ascending: false })
        .limit(10),

      // Post for Me context — connected accounts + follower counts
      fetchPostForMeContext(),
    ]);

    const profile = profileResult.data;
    const creatorName = profile?.display_name || profile?.full_name?.split(" ")[0] || "Creator";

    // Build connected platforms list — both legacy direct integrations AND
    // Post for Me-connected accounts. Without the PFM merge, every PFM-only
    // user looks "disconnected" to Clio and Haiku invents follower counts.
    const connectedSet = new Set<string>();
    if (profile?.instagram_access_token || profile?.instagram_business_account_id) connectedSet.add("Instagram");
    if (profile?.tiktok_access_token) connectedSet.add("TikTok");
    if (profile?.youtube_access_token) connectedSet.add("YouTube");
    for (const account of pfmContext.accounts) {
      const label = PFM_PLATFORM_LABELS[account.platform.toLowerCase()] || account.platform;
      connectedSet.add(label);
    }
    const connectedPlatforms = [...connectedSet];

    // Process recent metrics (last 7 days)
    const recentMetrics = metricsResult.data || [];
    const prevMetrics = prevMetricsResult.data || [];

    const byPlatform = (metrics: typeof recentMetrics) => {
      const map: Record<string, { views: number; likes: number; comments: number; saves: number; avgEng: number; followers: number; days: number }> = {};
      for (const m of metrics) {
        if (!map[m.platform]) map[m.platform] = { views: 0, likes: 0, comments: 0, saves: 0, avgEng: 0, followers: 0, days: 0 };
        map[m.platform].views += m.views || 0;
        map[m.platform].likes += m.likes || 0;
        map[m.platform].comments += m.comments || 0;
        map[m.platform].saves += (m.saves || 0);
        map[m.platform].avgEng += (m.avg_engagement_rate || 0);
        map[m.platform].followers = Math.max(map[m.platform].followers, m.followers_count || 0);
        map[m.platform].days++;
      }
      // Average the engagement rate
      for (const p of Object.keys(map)) {
        if (map[p].days > 0) map[p].avgEng = map[p].avgEng / map[p].days;
      }
      return map;
    };

    const recentByPlatform = byPlatform(recentMetrics);
    const prevByPlatform = byPlatform(prevMetrics);

    const totalRecentViews = recentMetrics.reduce((s, m) => s + (m.views || 0), 0);
    const totalPrevViews = prevMetrics.reduce((s, m) => s + (m.views || 0), 0);
    const viewsChange = totalPrevViews > 0
      ? Math.round(((totalRecentViews - totalPrevViews) / totalPrevViews) * 100)
      : null;

    const totalRecentEng = recentMetrics.reduce((s, m) => s + (m.likes || 0) + (m.comments || 0), 0);

    // Format platform breakdown section.
    // Each row uses synced follower counts when available; falls back to the
    // PFM-feed follower counts so connected-but-unsynced accounts still
    // surface real numbers instead of forcing Haiku to guess.
    const platformsWithMetrics = new Set(Object.keys(recentByPlatform));
    const platformLines = [
      ...Object.entries(recentByPlatform).map(([p, d]) => {
        const prev = prevByPlatform[p];
        const prevViews = prev?.views || 0;
        const changeStr = prevViews > 0
          ? ` (${d.views > prevViews ? "+" : ""}${Math.round(((d.views - prevViews) / prevViews) * 100)}% vs prior 7d)`
          : "";
        const followers = d.followers > 0
          ? d.followers
          : (pfmContext.followersByPlatform[p] || 0);
        const followersStr = followers > 0 ? `, ${followers.toLocaleString()} followers` : "";
        return `  - ${p}: ${d.views.toLocaleString()} views${changeStr}, ${d.avgEng.toFixed(2)}% avg engagement${followersStr}`;
      }),
      // PFM-connected accounts that have no metrics yet — surface them so
      // Haiku knows they're connected and reports "no metrics yet" instead
      // of "platform not connected".
      ...pfmContext.accounts
        .filter((a) => !platformsWithMetrics.has(a.platform))
        .map((a) => {
          const followers = pfmContext.followersByPlatform[a.platform] || 0;
          const followersStr = followers > 0 ? `${followers.toLocaleString()} followers` : "no follower data yet";
          const label = PFM_PLATFORM_LABELS[a.platform.toLowerCase()] || a.platform;
          return `  - ${label}: connected${a.username ? ` (@${a.username})` : ""}, ${followersStr}, no published-post metrics yet`;
        }),
    ].join("\n");

    // Format top posts (by engagement)
    const posts = postsResult.data || [];
    const topPostLines = posts.slice(0, 5).map((p, i) => {
      const engStr = p.engagement_rate ? ` (${Number(p.engagement_rate).toFixed(1)}% eng)` : "";
      const viewStr = p.views ? ` — ${Number(p.views).toLocaleString()} views` : "";
      const dateStr = p.published_at ? ` [${new Date(p.published_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}]` : "";
      return `  ${i + 1}. [${p.platform}]${dateStr} "${p.title || "Untitled"}"${viewStr}${engStr}`;
    }).join("\n");

    // Format recent posts chronologically (for "how did yesterday's post do" type questions)
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

    // Format deals
    const deals = dealsResult.data || [];
    const dealLines = deals.length > 0
      ? deals.map(d => `  - ${d.brand_name} (${d.status.replace(/_/g, " ")}): $${Number(d.total_value || 0).toLocaleString()}`).join("\n")
      : "  No active deals";

    const totalDealValue = deals.reduce((s, d) => s + Number(d.total_value || 0), 0);

    // Build context string
    const viewsSummary = totalRecentViews > 0
      ? `${totalRecentViews.toLocaleString()} views last 7 days${viewsChange !== null ? ` (${viewsChange > 0 ? "+" : ""}${viewsChange}% vs prior 7d)` : ""}, ${totalRecentEng.toLocaleString()} total engagements`
      : "No recent metrics data (connect a platform to get real stats)";

    const context = `DATA BLOCK — every number below is real and grounded. Anything not listed here, you don't have.

CREATOR PROFILE:
Name: ${creatorName}
Connected platforms: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(", ") : "None connected yet"}
AI quota remaining today: ${quota.requests_remaining - 1} (after this request)

LAST 7 DAYS PERFORMANCE:
${viewsSummary}
${platformLines || "  No platform data available"}

TOP POSTS (last 30 days, ranked by engagement):
${topPostLines || "  No published posts yet"}

RECENT POSTS (last 7 days, chronological — use this to answer questions about specific days):
${recentPostLines || "  No posts in the last 7 days"}

ACTIVE DEAL PIPELINE:
${dealLines}${deals.length > 0 ? `\nTotal pipeline value: $${totalDealValue.toLocaleString()}` : ""}

ONBOARDED VIEW AVERAGES (from profile setup):
${profile?.instagram_avg_views ? `  Instagram: ${Number(profile.instagram_avg_views).toLocaleString()} avg views` : ""}
${profile?.tiktok_avg_views ? `  TikTok: ${Number(profile.tiktok_avg_views).toLocaleString()} avg views` : ""}
${profile?.youtube_avg_views ? `  YouTube: ${Number(profile.youtube_avg_views).toLocaleString()} avg views` : ""}`.trim();

    // Call Claude Haiku
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        system: `You are Clio, the creator's personal analytics copilot inside Cliopatra Social. You have access to their real performance data shown below in the DATA block.

GROUNDING RULES — these are non-negotiable:
1. NEVER invent, estimate, or assume metrics. If a number is not present in the DATA block below, say "I don't have that data yet" and tell the user how to get it (e.g. "connect a platform from /office/connections" or "give it 24 hours after posting for metrics to sync").
2. NEVER say generic ranges like "around 1,000 followers" or "typical for this niche." If you don't have the exact number, you don't have it.
3. NEVER assume a platform is connected unless it appears in "Connected platforms" below.
4. If "Connected platforms" is "None connected yet", your job is to direct the user to /office/connections — do not pretend to analyze imaginary stats.
5. When you DO have data, quote the exact numbers from the DATA block. Do not round dramatically or paraphrase.

Style: direct, actionable, under 200 words. Match the user's energy. No filler, no preamble, no "great question" type openers.

${context}`,
        messages: [
          { role: "user", content: question.trim() },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("Anthropic error:", errText);
      throw new Error("AI service error");
    }

    const anthropicData = await anthropicRes.json();
    const answer = anthropicData.content?.[0]?.text || "Sorry, I couldn't generate a response.";

    // Decrement quota
    await supabase.rpc("increment_ai_request", { p_user_id: userId });

    return new Response(JSON.stringify({ answer, success: true }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ask-copilot error:", message);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
});
