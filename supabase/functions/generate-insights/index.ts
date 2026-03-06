import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * generate-insights Edge Function
 *
 * Analyzes recent platform_metrics and content_posts to generate
 * actionable social_insights for the Daily Pulse.
 *
 * Intended to be called after each platform sync, or on-demand.
 * Writes to social_insights table — Daily Pulse reads from this.
 *
 * Request body:
 *   userId   - Supabase user ID
 *   platform - optional, filter to specific platform
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface InsightRow {
  user_id: string;
  platform: string;
  insight_type: string;
  type: string;
  title: string;
  description: string;
  highlight_text: string;
  priority: string;
  action_required: boolean;
  action_label: string | null;
  action_url: string | null;
  insight_data: Record<string, unknown>;
  date: string;
  is_dismissed: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { userId, platform: filterPlatform } = await req.json();

    if (!userId) throw new Error("Missing required field: userId");

    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split("T")[0];

    const insights: InsightRow[] = [];

    // ── Pull recent platform metrics ─────────────────────────────────────────
    let metricsQuery = supabase
      .from("platform_metrics")
      .select("platform, followers_count, avg_engagement_rate, total_views, total_likes, date")
      .eq("user_id", userId)
      .gte("date", thirtyDaysAgoStr)
      .order("date", { ascending: false })
      .limit(60);

    if (filterPlatform) metricsQuery = metricsQuery.eq("platform", filterPlatform);
    const { data: metrics } = await metricsQuery;

    // ── Pull recent published posts ──────────────────────────────────────────
    let postsQuery = supabase
      .from("content_posts")
      .select("id, platform, content_type, title, views, likes, comments, engagement_rate, published_date, saves")
      .eq("user_id", userId)
      .eq("status", "published")
      .gte("published_date", thirtyDaysAgoStr)
      .order("engagement_rate", { ascending: false })
      .limit(30);

    if (filterPlatform) postsQuery = postsQuery.eq("platform", filterPlatform);
    const { data: posts } = await postsQuery;

    // ── Aggregate by platform ─────────────────────────────────────────────────
    const platformGroups: Record<string, { recent: typeof metrics; posts: typeof posts }> = {};

    for (const m of metrics || []) {
      if (!platformGroups[m.platform]) platformGroups[m.platform] = { recent: [], posts: [] };
      platformGroups[m.platform].recent!.push(m);
    }
    for (const p of posts || []) {
      if (!platformGroups[p.platform]) platformGroups[p.platform] = { recent: [], posts: [] };
      platformGroups[p.platform].posts!.push(p);
    }

    for (const [plat, { recent, posts: platPosts }] of Object.entries(platformGroups)) {
      // ── Follower growth insight ──────────────────────────────────────────
      const recentMetrics = (recent || []).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      if (recentMetrics.length >= 2) {
        const latest = recentMetrics[0];
        const oldest = recentMetrics[recentMetrics.length - 1];
        const followerGrowth = (latest.followers_count || 0) - (oldest.followers_count || 0);
        const followerPct = oldest.followers_count > 0
          ? ((followerGrowth / oldest.followers_count) * 100).toFixed(1)
          : null;

        if (followerPct !== null && Math.abs(followerGrowth) >= 5) {
          const isPositive = followerGrowth > 0;
          insights.push({
            user_id: userId,
            platform: plat,
            insight_type: "follower_growth",
            type: isPositive ? "positive" : "warning",
            title: `${isPositive ? "+" : ""}${followerGrowth.toLocaleString()} followers on ${plat} (30d)`,
            description: `Your ${plat} following ${isPositive ? "grew" : "dropped"} by ${Math.abs(Number(followerPct))}% over the last 30 days.`,
            highlight_text: `${isPositive ? "+" : ""}${followerPct}%`,
            priority: isPositive ? "low" : "high",
            action_required: !isPositive,
            action_label: isPositive ? null : "Review recent posts",
            action_url: isPositive ? null : `/analytics`,
            insight_data: { follower_growth: followerGrowth, pct_change: followerPct, platform: plat },
            date: today,
            is_dismissed: false,
          });
        }
      }

      // ── Top performer insight ─────────────────────────────────────────────
      const sortedByEng = (platPosts || []).sort((a: any, b: any) => Number(b.engagement_rate) - Number(a.engagement_rate));
      if (sortedByEng.length >= 3) {
        const top = sortedByEng[0];
        const avg = sortedByEng.reduce((sum: number, p: any) => sum + Number(p.engagement_rate || 0), 0) / sortedByEng.length;
        const topEng = Number(top.engagement_rate || 0);
        if (topEng > avg * 1.3) {
          insights.push({
            user_id: userId,
            platform: plat,
            insight_type: "top_performer",
            type: "positive",
            title: `Your top ${plat} post is ${Math.round(((topEng - avg) / avg) * 100)}% above average`,
            description: `"${top.title || "Untitled"}" hit ${topEng.toFixed(1)}% engagement vs your ${avg.toFixed(1)}% avg. Double down on this format.`,
            highlight_text: `${topEng.toFixed(1)}% eng`,
            priority: "medium",
            action_required: false,
            action_label: "See analytics",
            action_url: `/analytics`,
            insight_data: { post_id: top.id, engagement_rate: topEng, avg_engagement: avg, title: top.title },
            date: today,
            is_dismissed: false,
          });
        }
      }

      // ── Underperformer insight ─────────────────────────────────────────────
      const recentPosts = (platPosts || [])
        .filter((p: any) => p.published_date >= sevenDaysAgoStr)
        .sort((a: any, b: any) => Number(a.engagement_rate) - Number(b.engagement_rate));

      if (recentPosts.length >= 1 && sortedByEng.length >= 3) {
        const worst = recentPosts[0];
        const avg = sortedByEng.reduce((sum: number, p: any) => sum + Number(p.engagement_rate || 0), 0) / sortedByEng.length;
        const worstEng = Number(worst.engagement_rate || 0);
        if (worstEng < avg * 0.6 && worstEng > 0) {
          insights.push({
            user_id: userId,
            platform: plat,
            insight_type: "underperformer",
            type: "warning",
            title: `Recent ${plat} post underperformed by ${Math.round(((avg - worstEng) / avg) * 100)}%`,
            description: `"${worst.title || "Untitled"}" hit ${worstEng.toFixed(1)}% engagement vs your ${avg.toFixed(1)}% avg. Worth a review.`,
            highlight_text: `-${Math.round(((avg - worstEng) / avg) * 100)}%`,
            priority: "medium",
            action_required: true,
            action_label: "Analyze post",
            action_url: `/analytics`,
            insight_data: { post_id: worst.id, engagement_rate: worstEng, avg_engagement: avg, title: worst.title },
            date: today,
            is_dismissed: false,
          });
        }
      }

      // ── Saves rate insight (IG/TikTok — high saves = save-worthy content) ──
      if (["instagram", "tiktok"].includes(plat)) {
        const savePosts = (platPosts || []).filter((p: any) => p.saves > 0);
        if (savePosts.length > 0) {
          const totalViews = savePosts.reduce((s: number, p: any) => s + (p.views || 0), 0);
          const totalSaves = savePosts.reduce((s: number, p: any) => s + (p.saves || 0), 0);
          const saveRate = totalViews > 0 ? ((totalSaves / totalViews) * 100).toFixed(2) : null;
          if (saveRate && Number(saveRate) >= 2) {
            insights.push({
              user_id: userId,
              platform: plat,
              insight_type: "save_rate",
              type: "positive",
              title: `${saveRate}% save rate on ${plat} — your content is bookmark-worthy`,
              description: `${totalSaves.toLocaleString()} saves across ${savePosts.length} post${savePosts.length > 1 ? "s" : ""}. High saves signal utility content — lean into it.`,
              highlight_text: `${saveRate}% saves`,
              priority: "low",
              action_required: false,
              action_label: null,
              action_url: null,
              insight_data: { total_saves: totalSaves, save_rate: saveRate, platform: plat },
              date: today,
              is_dismissed: false,
            });
          }
        }
      }
    }

    // ── AI-generated insight (if Anthropic key is set and we have enough data) ──
    if (anthropicKey && posts && posts.length >= 5) {
      try {
        const topPosts = [...posts].sort((a: any, b: any) => Number(b.engagement_rate) - Number(a.engagement_rate)).slice(0, 3);
        const botPosts = [...posts].sort((a: any, b: any) => Number(a.engagement_rate) - Number(b.engagement_rate)).slice(0, 2);

        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            system: "You are a content strategist. Identify ONE pattern in this creator's data and give ONE concrete, specific action. No fluff.",
            messages: [
              {
                role: "user",
                content: `Top performing posts (last 30 days):
${topPosts.map((p: any) => `- "${p.title || "Untitled"}" (${p.platform}, ${p.content_type}, ${Number(p.engagement_rate).toFixed(1)}% eng)`).join("\n")}

Lowest performing posts:
${botPosts.map((p: any) => `- "${p.title || "Untitled"}" (${p.platform}, ${p.content_type}, ${Number(p.engagement_rate).toFixed(1)}% eng)`).join("\n")}

Return ONLY a JSON object:
{
  "pattern": "One sentence describing the clear pattern you see (max 100 chars)",
  "action": "One specific action they should take next (max 80 chars)"
}`,
              },
            ],
          }),
        });

        if (claudeRes.ok) {
          const claudeData = await claudeRes.json();
          const rawText = (claudeData.content?.[0]?.text || "").trim();
          const cleaned = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
          const aiResult = JSON.parse(cleaned);

          if (aiResult.pattern && aiResult.action) {
            insights.push({
              user_id: userId,
              platform: filterPlatform || "all",
              insight_type: "ai_pattern",
              type: "tip",
              title: "Pattern detected in your last 30 days",
              description: aiResult.pattern,
              highlight_text: "AI Insight",
              priority: "high",
              action_required: true,
              action_label: aiResult.action,
              action_url: `/studio`,
              insight_data: { pattern: aiResult.pattern, action: aiResult.action, ai_generated: true },
              date: today,
              is_dismissed: false,
            });
          }
        }
      } catch (aiErr) {
        console.warn("AI pattern insight failed (non-fatal):", aiErr);
      }
    }

    if (insights.length === 0) {
      return new Response(
        JSON.stringify({ success: true, count: 0, message: "No insights generated — not enough data yet." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Delete today's existing non-dismissed insights for this user ─────────
    let deleteQuery = supabase
      .from("social_insights")
      .delete()
      .eq("user_id", userId)
      .eq("date", today)
      .eq("is_dismissed", false);

    if (filterPlatform) deleteQuery = deleteQuery.eq("platform", filterPlatform);
    await deleteQuery;

    // ── Insert new insights ───────────────────────────────────────────────────
    const { data: inserted, error: insertError } = await supabase
      .from("social_insights")
      .insert(insights)
      .select("id");

    if (insertError) throw new Error(`Failed to save insights: ${insertError.message}`);

    return new Response(
      JSON.stringify({ success: true, count: inserted?.length || 0, insights_generated: insights.map(i => i.insight_type) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("generate-insights error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
