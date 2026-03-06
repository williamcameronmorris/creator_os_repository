import { supabase } from './supabase';
import { startOfWeek, subDays, format, parseISO } from 'date-fns';

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

  if (!posts.data || !metrics.data) {
    return insights;
  }

  insights.push(...analyzePostingPatterns(posts.data));
  insights.push(...analyzeContentPerformance(posts.data));
  insights.push(...analyzeContentGaps(posts.data));
  insights.push(...analyzeTrendingFormats(posts.data));
  insights.push(...analyzeEngagementHealth(posts.data, metrics.data));

  return insights.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function analyzePostingPatterns(posts: any[]): Insight[] {
  const insights: Insight[] = [];
  const now = new Date();
  const recentPosts = posts.filter(p => {
    const postDate = parseISO(p.published_date);
    return (now.getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24) <= 30;
  });

  const platformPosts = {
    instagram: recentPosts.filter(p => p.platform === 'instagram'),
    tiktok: recentPosts.filter(p => p.platform === 'tiktok'),
    youtube: recentPosts.filter(p => p.platform === 'youtube'),
  };

  Object.entries(platformPosts).forEach(([platform, platformPostsList]) => {
    if (platformPostsList.length === 0) return;

    const postsByDay: Record<number, any[]> = {};
    const postsByHour: Record<number, any[]> = {};

    platformPostsList.forEach(post => {
      const date = parseISO(post.published_date);
      const day = date.getDay();
      const hour = date.getHours();

      if (!postsByDay[day]) postsByDay[day] = [];
      if (!postsByHour[hour]) postsByHour[hour] = [];

      postsByDay[day].push(post);
      postsByHour[hour].push(post);
    });

    const bestDay = Object.entries(postsByDay).reduce((best, [day, dayPosts]) => {
      const avgEngagement = dayPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / dayPosts.length;
      return avgEngagement > best.engagement ? { day: parseInt(day), engagement: avgEngagement } : best;
    }, { day: 0, engagement: 0 });

    const bestHour = Object.entries(postsByHour).reduce((best, [hour, hourPosts]) => {
      const avgEngagement = hourPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / hourPosts.length;
      return avgEngagement > best.engagement ? { hour: parseInt(hour), engagement: avgEngagement } : best;
    }, { hour: 0, engagement: 0 });

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const lastPostDate = parseISO(platformPostsList[0].published_date);
    const daysSinceLastPost = Math.floor((now.getTime() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysSinceLastPost >= 3) {
      insights.push({
        id: `posting-gap-${platform}`,
        type: 'posting_pattern',
        platform: platform as any,
        priority: daysSinceLastPost >= 7 ? 'high' : 'medium',
        title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} posting overdue`,
        description: `Last post was ${daysSinceLastPost} days ago. Your best day is ${dayNames[bestDay.day]} at ${bestHour.hour}:00`,
        action: `Schedule a ${platform} post for ${dayNames[bestDay.day]}`,
        actionUrl: '/schedule',
      });
    } else {
      insights.push({
        id: `posting-pattern-${platform}`,
        type: 'posting_pattern',
        platform: platform as any,
        priority: 'low',
        title: `Optimal ${platform.charAt(0).toUpperCase() + platform.slice(1)} timing`,
        description: `Your ${platform} posts perform best on ${dayNames[bestDay.day]}s at ${bestHour.hour}:00`,
        action: 'Schedule next post at optimal time',
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
    const platformPosts = posts.filter(p => p.platform === platform && p.published_date);
    if (platformPosts.length < 3) return;

    const sortedByEngagement = [...platformPosts].sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0));
    const topPost = sortedByEngagement[0];
    const avgEngagement = platformPosts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / platformPosts.length;

    if (topPost && topPost.engagement_rate > avgEngagement * 1.5) {
      insights.push({
        id: `top-performer-${platform}`,
        type: 'content_performance',
        platform: platform as any,
        priority: 'medium',
        title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} top performer identified`,
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
    const postDate = parseISO(p.published_date);
    return postDate >= weekStart;
  });

  const postsByPlatform = {
    instagram: thisWeekPosts.filter(p => p.platform === 'instagram'),
    tiktok: thisWeekPosts.filter(p => p.platform === 'tiktok'),
    youtube: thisWeekPosts.filter(p => p.platform === 'youtube'),
  };

  Object.entries(postsByPlatform).forEach(([platform, platformPostsList]) => {
    if (platformPostsList.length === 0) {
      insights.push({
        id: `content-gap-${platform}`,
        type: 'content_gap',
        platform: platform as any,
        priority: 'high',
        title: `No ${platform.charAt(0).toUpperCase() + platform.slice(1)} posts this week`,
        description: `You haven't posted on ${platform} since ${format(weekStart, 'MMM d')}`,
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
      .filter(p => p.platform === platform && p.published_date)
      .filter(p => {
        const postDate = parseISO(p.published_date);
        return (new Date().getTime() - postDate.getTime()) / (1000 * 60 * 60 * 24) <= 30;
      });

    if (platformPosts.length < 5) return;

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
      const typeNames: Record<string, string> = {
        video: 'Videos',
        image: 'Photos',
        carousel: 'Carousels',
      };

      insights.push({
        id: `trending-format-${platform}`,
        type: 'trending_format',
        platform: platform as any,
        priority: 'medium',
        title: `${typeNames[bestType.type] || bestType.type} performing best on ${platform.charAt(0).toUpperCase() + platform.slice(1)}`,
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
    const olderMetrics = platformMetrics.slice(7, 14);

    const recentAvgEngagement = recentMetrics.reduce((sum, m) => sum + (m.avg_engagement_rate || 0), 0) / recentMetrics.length;
    const olderAvgEngagement = olderMetrics.reduce((sum, m) => sum + (m.avg_engagement_rate || 0), 0) / olderMetrics.length;

    const change = ((recentAvgEngagement - olderAvgEngagement) / olderAvgEngagement) * 100;

    if (Math.abs(change) > 15) {
      insights.push({
        id: `engagement-health-${platform}`,
        type: 'engagement_health',
        platform: platform as any,
        priority: change < 0 ? 'high' : 'low',
        title: `${platform.charAt(0).toUpperCase() + platform.slice(1)} engagement ${change > 0 ? 'increasing' : 'declining'}`,
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

  const insightRecords = insights.map(insight => ({
    user_id: userId,
    platform: insight.platform,
    insight_type: insight.type,
    insight_data: {
      title: insight.title,
      description: insight.description,
      action: insight.action,
      actionUrl: insight.actionUrl,
      ...insight.data,
    },
    priority: insight.priority,
    action_required: insight.priority === 'high',
    date: today,
  }));

  if (insightRecords.length > 0) {
    await supabase.from('social_insights').insert(insightRecords);
  }
}

export async function getStoredInsights(userId: string): Promise<Insight[]> {
  const { data } = await supabase
    .from('social_insights')
    .select('*')
    .eq('user_id', userId)
    .eq('date', new Date().toISOString().split('T')[0])
    .order('priority', { ascending: true });

  if (!data || data.length === 0) {
    return [];
  }

  return data.map(record => ({
    id: record.id,
    type: record.insight_type,
    platform: record.platform,
    priority: record.priority,
    title: record.insight_data.title,
    description: record.insight_data.description,
    action: record.insight_data.action,
    actionUrl: record.insight_data.actionUrl,
    data: record.insight_data,
  }));
}
