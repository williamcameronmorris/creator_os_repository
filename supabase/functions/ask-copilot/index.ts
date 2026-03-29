import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    const [profileResult, metricsResult, prevMetricsResult, postsResult, dealsResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, display_name, instagram_avg_views, tiktok_avg_views, youtube_avg_views, instagram_access_token, instagram_business_account_id, tiktok_access_token, youtube_access_token")
        .eq("id", userId)
        .maybeSingle(),

      supabase
        .from("platform_metrics")
        .select("platform, date, views, likes, comments, saves, followers, avg_engagement_rate")
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

      supabase
        .from("deals")
        .select("brand_name, status, total_value, deliverables_count")
        .eq("user_id", userId)
        .in("status", ["negotiating", "contract_sent", "in_production", "pending_payment"])
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const profile = profileResult.data;
    const creatorName = profile?.display_name || profile?.full_name?.split(" ")[0] || "Creator";

    // Build connected platforms list
    const connectedPlatforms: string[] = [];
    if (profile?.instagram_access_token || profile?.instagram_business_account_id) connectedPlatforms.push("Instagram");
    if (profile?.tiktok_access_token) connectedPlatforms.push("TikTok");
    if (profile?.youtube_access_token) connectedPlatforms.push("YouTube");

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
        map[m.platform].followers = Math.max(map[m.platform].followers, m.followers || 0);
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

    // Format platform breakdown section
    const platformLines = Object.entries(recentByPlatform).map(([p, d]) => {
      const prev = prevByPlatform[p];
      const prevViews = prev?.views || 0;
      const changeStr = prevViews > 0
        ? ` (${d.views > prevViews ? "+" : ""}${Math.round(((d.views - prevViews) / prevViews) * 100)}% vs prior 7d)`
        : "";
      const followersStr = d.followers > 0 ? `, ${d.followers.toLocaleString()} followers` : "";
      return `  - ${p}: ${d.views.toLocaleString()} views${changeStr}, ${d.avgEng.toFixed(2)}% avg engagement${followersStr}`;
    }).join("\n");

    // Format top posts
    const posts = postsResult.data || [];
    const topPostLines = posts.slice(0, 5).map((p, i) => {
      const engStr = p.engagement_rate ? ` (${Number(p.engagement_rate).toFixed(1)}% eng)` : "";
      const viewStr = p.views ? ` — ${Number(p.views).toLocaleString()} views` : "";
      return `  ${i + 1}. [${p.platform}] "${p.title || "Untitled"}"${viewStr}${engStr}`;
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

    const context = `CREATOR PROFILE:
Name: ${creatorName}
Connected platforms: ${connectedPlatforms.length > 0 ? connectedPlatforms.join(", ") : "None connected yet"}
AI quota remaining today: ${quota.requests_remaining - 1} (after this request)

LAST 7 DAYS PERFORMANCE:
${viewsSummary}
${platformLines || "  No platform data available"}

TOP POSTS (last 30 days, ranked by engagement):
${topPostLines || "  No published posts yet"}

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
        system: `You are the creator's personal analytics copilot inside Creator Command. You have access to their real performance data shown below. Answer their question concisely, specifically, and using their actual numbers where possible. Be direct and actionable — no filler. If data is missing or a platform isn't connected, say so clearly rather than guessing. Keep responses under 200 words.

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
