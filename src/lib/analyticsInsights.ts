import { supabase } from './supabase';
import { startOfWeek, subDays, format, parseISO, isValid } from 'date-fns';

export interface Insight {
  id: string;
  type: 'posting_pattern' | 'content_performance' | 'audience_behavior' | 'content_gap' | 'trending_format' | 'engagement_health';
  platform: 'instagram' | 'tiktok' | 'youtube' | 'all';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  actionUrl?: string;
  data?: any;
}

/** Safely parse a date from any of the fallback fields, returns null if unparseable */
function safeDate(post: any): Date | null {
  const raw = post.published_date ?? post.scheduled_for ?? post.created_at;
  if (!raw) return null;
  const d = parseISO(raw);
  return isValid(d) ? d : null;
}

export async function generateInsights(userId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  const [posts, metrics] = await Promise.all([
    supabase
      .from('content_posts')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'published')
      .order('published_date', { ascending: false })
      .limit(100),
    supabase
      .from('platform_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('date', subDays(new Date(), 30).toISOString().split('T')[0])
      .order('date', { ascending: false }),
  ]);

  if (!posts.data) return insights;

  const metricsData = metrics.data ?? [];

  insights.push(...analyzePostingPatterns(posts.data));
  insights.push(...analyzeContentPerformance(posts.data));
  insights.push(...analyzeContentGaps(posts.data));
  insights.push(...analyzeTrendingFormats(posts.data));
  insights.push(...analyzeEngagementHealth(posts.data, metricsData));

  // Deduplicate by id (in case multiple functions produce the same id)
  const seen = new Set<string>();
  const unique = insights.filter(i => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  return unique.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function analyzePostingPatterns(posts: any[]): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();

  const recentPosts = posts.filter(p => {
    const d = safeDate(p);
    return d && (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30;
  });

  const platformPosts: Record<string, any[]> = {
    instagram: recentPosts.filter(p => p.platform === 'instagram'),
    tiktok:    recentPosts.filter(p => p.platform === 'tiktok'),
    youtube:   recentPosts.filter(p => p.platform === 'youtube'),
  };

  Object.entries(platformPosts).forEach(([platform, platformPostsList]) => {
    if (platformPostsList.length === 0) return;

    const postsByDay:  Record<number, any[]> = {};
    const postsByHour: Record<number, any[]> = {};

    platformPostsList.forEach(post => {
      const date = safeDate(post);
      if (!date) return;
      const day  = date.getDay();
      const hour = date.getHours();
      if (!postsByDay[day])   postsByDay[day]   = [];
      if (!postsByHour[hour]) postsByHour[hour] = [];
      postsByDay[day].push(post);
      postsByHour[hour].push(post);
    });

    // Sort by post count when engagement is all zero, otherwise by avg engagement
    const hasEngagement = platformPostsList.some(p => (p.engagement_rate || 0) > 0);

    const bestDay = Object.entries(postsByDay).reduce((best, [day, dayPosts]) => {
      const score = hasEngagement
        ? dayPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / dayPosts.length
        : dayPosts.length;
      return score > best.score ? { day: parseInt(day), score } : best;
    }, { day: 0, score: -1 });

    const bestHour = Object.entries(postsByHour).reduce((best, [hour, hourPosts]) => {
      const score = hasEngagement
        ? hourPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / hourPosts.length
        : hourPosts.length;
      return score > best.score ? { hour: parseInt(hour), score } : best;
    }, { hour: 0, score: -1 });

    // Find most recent post date (using fallback fields)
    const sortedByDate = [...platformPostsList]
      .map(p => ({ post: p, date: safeDate(p) }))
      .filter(x => x.date !== null)
      .sort((a, b) => b.date!.getTime() - a.date!.getTime());

    if (sortedByDate.length === 0) return;

    const lastPostDate = sortedByDate[0].date!;
    const daysSinceLastPost = Math.floor((now.getTime() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24));
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const label = platform.charAt(0).toUpperCase() + platform.slice(1);

    if (daysSinceLastPost >= 3) {
      insights.push({
        id: `posting-gap-${platform}`,
        type: 'posting_pattern',
        platform: platform as any,
        priority: daysSinceLastPost >= 7 ? 'high' : 'medium',
        title: `${label} posting overdue`,
        description: `Last post was ${daysSinceLastPost} days ago. You post most on ${dayNames[bestDay.day]}s at ${bestHour.hour}:00.`,
        action: `Schedule a ${label} post for ${dayNames[bestDay.day]}`,
        actionUrl: '/schedule',
      });
    } else {
      insights.push({
        id: `posting-pattern-${platform}`,
        type: 'posting_pattern',
        platform: platform as any,
        priority: 'low',
        title: `${label} posting cadence looks good`,
        description: `You've posted ${platformPostsList.length} times in the last 30 days. Most active on ${dayNames[bestDay.day]}s at ${bestHour.hour}:00.`,
        action: 'Keep up the consistent schedule',
        actionUrl: '/schedule',
        data: { bestDay: bestDay.day, bestHour: bestHour.hour },
      });
    }
  });

  return insights;
}

function analyzeContentPerformance(posts: any[]): Insight[] {
  const insights: Insight[] = [];

  ['instagram', 'tiktok', 'youtube'].forEach(platform => {
    const platformPosts = posts.filter(p => p.platform === platform && safeDate(p));
    if (platformPosts.length < 3) return;

    const hasEngagement = platformPosts.some(p => (p.engagement_rate || 0) > 0);
    if (!hasEngagement) {
      // No engagement data yet — surface a sync nudge instead
      insights.push({
        id: `sync-nudge-${platform}`,
        type: 'content_performance',
        platform: platform as any,
        priority: 'medium',
        title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} analytics not yet synced`,
        description: `You have ${platformPosts.length} published posts but no engagement data. Sync your account to unlock performance insights.`,
        action: 'Sync to see top-performing posts',
        actionUrl: '/settings',
      });
      return;
    }

    const sortedByEngagement = [...platformPosts].sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0));
    const topPost = sortedByEngagement[0];
    const avgEngagement = platformPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / platformPosts.length;
    const label = platform.charAt(0).toUpperCase() + platform.slice(1);

    if (topPost && topPost.engagement_rate > avgEngagement * 1.5) {
      insights.push({
        id: `top-performer-${platform}`,
        type: 'content_performance',
        platform: platform as any,
        priority: 'medium',
        title: `${label} top performer identified`,
        description: `Your best post got ${topPost.engagement_rate.toFixed(1)}% engagement (${Math.round((topPost.engagement_rate / avgEngagement - 1) * 100)}% above average)`,
        action: 'Analyze and replicate this content style',
        data: { postId: topPost.id, caption: topPost.caption?.substring(0, 100) },
      });
    }
  });

  return insights;
}

function analyzeContentGaps(posts: any[]): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const weekStart = startOfWeek(now);

  const thisWeekPosts = posts.filter(p => {
    const d = safeDate(p);
    return d && d >= weekStart;
  });

  const postsByPlatform: Record<string, any[]> = {
    instagram: thisWeekPosts.filter(p => p.platform === 'instagram'),
    tiktok:    thisWeekPosts.filter(p => p.platform === 'tiktok'),
    youtube:   thisWeekPosts.filter(p => p.platform === 'youtube'),
  };

  // Only flag a gap if the user has historical posts on this platform
  // (avoids false positives for platforms they've never used)
  const allPlatforms = new Set(posts.map(p => p.platform));

  Object.entries(postsByPlatform).forEach(([platform, platformPostsList]) => {
    if (!allPlatforms.has(platform)) return; // never used this platform
    if (platformPostsList.length === 0) {
      insights.push({
        id: `content-gap-${platform}`,
        type: 'content_gap',
        platform: platform as any,
        priority: 'high',
        title: `No ${platform.charAt(0).toUpperCase() + platform.slice(1)} posts this week`,
        description: `You haven't posted on ${platform} since ${format(weekStart, 'MMM d')}. Consistent posting keeps your audience engaged.`,
        action: `Create a ${platform} post`,
        actionUrl: '/schedule',
      });
    }
  });

  return insights;
}

function analyzeTrendingFormats(posts: any[]): Insight[] {
  const insights: Insight[] = [];

  ['instagram', 'tiktok', 'youtube'].forEach(platform => {
    const platformPosts = posts
      .filter(p => p.platform === platform && safeDate(p))
      .filter(p => {
        const d = safeDate(p);
        return d && (new Date().getTime() - d.getTime()) / (1000 * 60 * 60 * 24) <= 30;
      });

    if (platformPosts.length < 5) return;

    const hasEngagement = platformPosts.some(p => (p.engagement_rate || 0) > 0);
    if (!hasEngagement) return; // Can't assess format performance without engagement data

    const postsByType: Record<string, any[]> = {};
    platformPosts.forEach(post => {
      const type = post.media_type || 'image';
      if (!postsByType[type]) postsByType[type] = [];
      postsByType[type].push(post);
    });

    const typePerformance = Object.entries(postsByType).map(([type, typePosts]) => ({
      type,
      avgEngagement: typePosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / typePosts.length,
      count: typePosts.length,
    }));

    const bestType = typePerformance.reduce((best, current) =>
      current.avgEngagement > best.avgEngagement ? current : best
    );

    const avgEngagement = platformPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / platformPosts.length;

    if (bestType.avgEngagement > avgEngagement * 1.3) {
      const typeNames: Record<string, string> = { video: 'Videos', image: 'Photos', carousel: 'Carousels' };
      const label = platform.charAt(0).toUpperCase() + platform.slice(1);
      insights.push({
        id: `trending-format-${platform}`,
        type: 'trending_format',
        platform: platform as any,
        priority: 'medium',
        title: `${typeNames[bestType.type] || bestType.type} performing best on ${label}`,
        description: `Your ${bestType.type} posts get ${Math.round((bestType.avgEngagement / avgEngagement - 1) * 100)}% more engagement`,
        action: `Create more ${bestType.type} content`,
        actionUrl: '/schedule',
        data: { contentType: bestType.type },
      });
    }
  });

  return insights;
}

function analyzeEngagementHealth(posts: any[], metrics: any[]): Insight[] {
  const insights: Insight[] = [];

  ['instagram', 'tiktok', 'youtube'].forEach(platform => {
    const platformMetrics = metrics.filter(m => m.platform === platform).slice(0, 14);
    if (platformMetrics.length < 7) return;

    const recentMetrics = platformMetrics.slice(0, 7);
    const olderMetrics  = platformMetrics.slice(7, 14);

    const recentAvg = recentMetrics.reduce((sum, m) => sum + (m.avg_engagement_rate || 0), 0) / recentMetrics.length;
    const olderAvg  = olderMetrics.reduce( (sum, m) => sum + (m.avg_engagement_rate || 0), 0) / olderMetrics.length;

    if (olderAvg === 0) return; // avoid division by zero
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;
    const label = platform.charAt(0).toUpperCase() + platform.slice(1);

    if (Math.abs(change) > 15) {
      insights.push({
        id: `engagement-health-${platform}`,
        type: 'engagement_health',
        platform: platform as any,
        priority: change < 0 ? 'high' : 'low',
        title: `${label} engagement ${change > 0 ? 'increasing' : 'declining'}`,
        description: `Engagement ${change > 0 ? 'up' : 'down'} ${Math.abs(change).toFixed(0)}% compared to last week`,
        action: change < 0 ? 'Review recent content strategy' : 'Keep up the great work',
        data: { change },
      });
    }
  });

  return insights;
}

export async function saveInsights(userId: string, insights: Insight[]): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  await supabase
    .from('social_insights')
    .delete()
    .eq('user_id', userId)
    .eq('date', today);

  if (insights.length === 0) return;

  const insightRecords = insights.map(insight => ({
    user_id:         userId,
    platform:        insight.platform,
    insight_type:    insight.type,
    insight_data:    {
      title:       insight.title,
      description: insight.description,
      action:      insight.action,
      actionUrl:   insight.actionUrl,
      ...insight.data,
    },
    priority:        insight.priority,
    action_required: insight.priority === 'high',
    date:            today,
  }));

  await supabase.from('social_insights').insert(insightRecords);
}

export async function getStoredInsights(userId: string): Promise<Insight[]> {
  const { data } = await supabase
    .from('social_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('date', new Date().toISOString().split('T')[0])
    .order('priority', { ascending: true });

  if (!data || data.length === 0) return [];

  return data.map(record => ({
    id:          record.id,
    type:        record.insight_type,
    platform:    record.platform,
    priority:    record.priority,
    title:       record.insight_data.title,
    description: record.insight_data.description,
    action:      record.insight_data.action,
    actionUrl:   record.insight_data.actionUrl,
    data:        record.insight_data,
  }));
}
