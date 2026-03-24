import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { startOfWeek, endOfWeek, subWeeks, subDays, format, parseISO, isToday, isThisWeek, addDays, setHours, setMinutes } from 'date-fns';

interface ContentPost {
  id: string;
  title: string;
  caption?: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  published_at: string;
  thumbnail_url?: string;
  media_url?: string;
}

interface ContentRecapData {
  totalViews: number;
  viewsChange: number;
  postsCount: number;
  bestPost?: ContentPost;
  recentPosts: ContentPost[];
  dailyViews: number[];
}

interface EngagementMetrics {
  likes: number;
  likesChange: number;
  comments: number;
  commentsChange: number;
  saves: number;
  savesChange: number;
  shares: number;
  sharesChange: number;
}

interface TopPost {
  id: string;
  title: string;
  platform: string;
  engagementRate: number;
  thumbnail_url?: string;
}

interface EngagementData {
  totalEngagement: number;
  engagementChange: number;
  engagementRate: number;
  metrics: EngagementMetrics;
  topPosts: TopPost[];
}

type Platform = 'instagram' | 'youtube' | 'tiktok';
type ItemType = 'post' | 'story' | 'reel' | 'video';

interface ScheduleItem {
  id: string;
  title: string;
  scheduledTime: string;
  platform: Platform;
  type: ItemType;
}

interface ComingUpData {
  todayCount: number;
  thisWeekCount: number;
  nextPostTime?: string;
  nextPostPlatform?: Platform;
  items: ScheduleItem[];
}

type TipType = 'optimization' | 'warning' | 'opportunity';

interface SmartTip {
  id: string;
  type: TipType;
  title: string;
  description: string;
  actionLabel?: string;
  actionUrl?: string;
  highlightText?: string;
}

interface SmartTipsData {
  tipsCount: number;
  trendingCount: number;
  tips: SmartTip[];
  allCaughtUp: boolean;
}

interface DailyPulseSession {
  id: string;
  dismissed_all: boolean;
  cards_reviewed: string[];
  completed_at: string | null;
}

type DealStatus = 'stalled' | 'on_track' | 'new' | 'urgent';

interface PipelineDeal {
  id: string;
  brand: string;
  status: DealStatus;
  statusMessage: string;
  amount: number;
  actionType: 'follow_up' | 'contract' | 'quote';
  daysInStatus?: number;
}

interface DealPipelineData {
  activeDeals: number;
  stalledCount: number;
  totalValue: number;
  deals: PipelineDeal[];
}

interface DailyPulseData {
  contentRecap: ContentRecapData;
  engagement: EngagementData;
  comingUp: ComingUpData;
  smartTips: SmartTipsData;
  dealPipeline: DealPipelineData;
  session: DailyPulseSession | null;
  userName: string;
}

function generateDemoData(userName: string, session: DailyPulseSession | null): DailyPulseData {
  const now = new Date();
  const demoViews = [1850, 2340, 1920, 3150, 2780, 4200, 3650];
  const totalViews = demoViews.reduce((a, b) => a + b, 0);

  const demoPosts: ContentPost[] = [
    { id: 'demo-1', title: 'Morning coffee routine', platform: 'instagram', views: 4200, likes: 312, comments: 28, published_at: addDays(now, -2).toISOString() },
    { id: 'demo-2', title: 'Day in my life vlog', platform: 'youtube', views: 3650, likes: 245, comments: 42, published_at: addDays(now, -1).toISOString() },
    { id: 'demo-3', title: 'Product review haul', platform: 'tiktok', views: 2780, likes: 189, comments: 15, published_at: addDays(now, -3).toISOString() },
  ];

  const contentRecap: ContentRecapData = { totalViews, viewsChange: 8, postsCount: 3, bestPost: demoPosts[0], recentPosts: demoPosts, dailyViews: demoViews };

  const engagement: EngagementData = {
    totalEngagement: 2847, engagementChange: 12, engagementRate: 4.2,
    metrics: { likes: 2134, likesChange: 15, comments: 347, commentsChange: 8, saves: 189, savesChange: 22, shares: 177, sharesChange: 5 },
    topPosts: demoPosts.map((p) => ({ id: p.id, title: p.title, platform: p.platform, engagementRate: ((p.likes + p.comments) / p.views) * 100 })),
  };

  const todayAt = (h: number, m: number) => setMinutes(setHours(now, h), m).toISOString();
  const tomorrowAt = (h: number, m: number) => setMinutes(setHours(addDays(now, 1), h), m).toISOString();

  const demoSchedule: ScheduleItem[] = [
    { id: 'sched-1', title: 'Morning motivation post', scheduledTime: todayAt(18, 0), platform: 'instagram', type: 'reel' },
    { id: 'sched-2', title: 'Product review video', scheduledTime: tomorrowAt(14, 30), platform: 'youtube', type: 'video' },
    { id: 'sched-3', title: 'Behind the scenes', scheduledTime: tomorrowAt(19, 0), platform: 'tiktok', type: 'post' },
  ];

  const comingUp: ComingUpData = { todayCount: 1, thisWeekCount: 3, nextPostTime: demoSchedule[0].scheduledTime, nextPostPlatform: demoSchedule[0].platform, items: demoSchedule };

  const smartTips: SmartTipsData = {
    tipsCount: 2, trendingCount: 1,
    tips: [
      { id: 'tip-1', type: 'optimization', title: 'Best Posting Time', description: 'Based on your analytics, posting Reels on Tuesday between 6-8 PM gets you 3x more engagement.', actionLabel: 'Schedule a Reel for Tuesday 7 PM', highlightText: 'Tuesday between 6-8 PM' },
      { id: 'tip-2', type: 'opportunity', title: 'Trending Topic', description: 'Coffee content is trending right now. Your morning routine posts perform 40% above average.', actionLabel: 'Create Coffee Content', highlightText: 'Coffee content' },
    ],
    allCaughtUp: false,
  };

  const dealPipeline: DealPipelineData = {
    activeDeals: 2, stalledCount: 1, totalValue: 3500,
    deals: [
      { id: 'demo-deal-1', brand: 'Bloom Skincare', status: 'stalled', statusMessage: 'No response in 4 days', amount: 1500, actionType: 'follow_up', daysInStatus: 4 },
      { id: 'demo-deal-2', brand: 'FitCore App', status: 'new', statusMessage: 'New inquiry received', amount: 2000, actionType: 'quote' },
    ],
  };

  return { contentRecap, engagement, comingUp, smartTips, dealPipeline, session, userName };
}

export function useDailyPulse() {
  const [data, setData] = useState<DailyPulseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasConnectedAccounts, setHasConnectedAccounts] = useState<boolean | null>(null);
  const [connectedPlatforms, setConnectedPlatforms] = useState({ instagram: false, youtube: false, tiktok: false, threads: false });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Not authenticated'); return; }

      const today = format(new Date(), 'yyyy-MM-dd');
      const thisWeekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
      const thisWeekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
      const lastWeekStart = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
      // Rolling 30-day lookback so we always have content to show
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

      const [
        profileResult, sessionResult, postsResult, scheduledResult,
        insightsResult, dealsResult, credentialsResult,
      ] = await Promise.all([
        supabase.from('profiles').select('display_name, first_name').eq('id', user.id).maybeSingle(),
        supabase.from('daily_pulse_sessions').select('*').eq('user_id', user.id).eq('session_date', today).maybeSingle(),
        // 30-day rolling window — always captures recent content regardless of where we are in the week
        supabase.from('content_posts')
          .select('id, title, caption, platform, status, scheduled_for, published_at, thumbnail_url, media_url, views, likes, comments')
          .eq('user_id', user.id)
          .eq('status', 'published')
          .gte('published_at', thirtyDaysAgo)
          .order('published_at', { ascending: false })
          .limit(30),
        supabase.from('content_posts')
          .select('id, title, platform, content_type, scheduled_for')
          .eq('user_id', user.id)
          .eq('status', 'scheduled')
          .gte('scheduled_for', new Date().toISOString())
          .order('scheduled_for', { ascending: true })
          .limit(20),
        supabase.from('social_insights').select('*').eq('user_id', user.id).eq('is_dismissed', false).order('created_at', { ascending: false }).limit(5),
        supabase.from('deals')
          .select('id, brand, stage, final_amount, quote_standard, next_followup, follow_up_count, payment_status, created_at, updated_at')
          .eq('user_id', user.id)
          .not('stage', 'in', '("Closed","Delivered")')
          .order('updated_at', { ascending: false })
          .limit(10),
        supabase.from('platform_credentials').select('platform').eq('user_id', user.id).eq('is_active', true),
      ]);

      const userName = profileResult.data?.display_name || profileResult.data?.first_name || user.email?.split('@')[0] || 'there';

      const connectedSet = new Set((credentialsResult.data || []).map((c: { platform: string }) => c.platform));
      const platforms = {
        instagram: connectedSet.has('instagram'),
        tiktok: connectedSet.has('tiktok'),
        youtube: connectedSet.has('youtube'),
        threads: connectedSet.has('threads'),
      };
      setConnectedPlatforms(platforms);
      const hasConnectedAccounts = platforms.instagram || platforms.tiktok || platforms.youtube || platforms.threads;
      setHasConnectedAccounts(hasConnectedAccounts);

      // Real data exists if there are any published posts in last 30 days, or upcoming scheduled posts
      const hasRealData =
        (postsResult.data && postsResult.data.length > 0) ||
        (scheduledResult.data && scheduledResult.data.length > 0);

      if (!hasRealData) {
        setData(generateDemoData(userName, sessionResult.data));
        return;
      }

      // ── Normalise posts: use caption as title fallback for Instagram ───
      const allPosts = (postsResult.data || []).map((post) => ({
        id: post.id,
        title: post.title || post.caption?.slice(0, 60) || 'Untitled Post',
        caption: post.caption || undefined,
        platform: post.platform || 'instagram',
        views: (post as any).views || 0,
        likes: (post as any).likes || 0,
        comments: (post as any).comments || 0,
        published_at: post.published_at,
        thumbnail_url: post.thumbnail_url,
        media_url: post.media_url,
      }));

      // ── Split into this-week vs last-week buckets for change calculations ──
      const thisWeekPosts = allPosts.filter(p => p.published_at && parseISO(p.published_at) >= thisWeekStart && parseISO(p.published_at) <= thisWeekEnd);
      const lastWeekPosts = allPosts.filter(p => {
        if (!p.published_at) return false;
        const d = parseISO(p.published_at);
        return d >= lastWeekStart && d < thisWeekStart;
      });

      // ── Aggregate engagement from content_posts (platform_metrics is optional) ──
      const sumField = (arr: typeof allPosts, field: 'views' | 'likes' | 'comments') =>
        arr.reduce((s, p) => s + (p[field] || 0), 0);

      const thisWeekViews = sumField(thisWeekPosts, 'views');
      const thisWeekLikes = sumField(thisWeekPosts, 'likes');
      const thisWeekComments = sumField(thisWeekPosts, 'comments');
      const lastWeekViews = sumField(lastWeekPosts, 'views');
      const lastWeekLikes = sumField(lastWeekPosts, 'likes');
      const lastWeekComments = sumField(lastWeekPosts, 'comments');

      // Instagram doesn't expose views — use likes+comments as primary activity metric
      const thisWeekEngagement = thisWeekLikes + thisWeekComments;
      const lastWeekEngagement = lastWeekLikes + lastWeekComments;
      const displayViews = thisWeekViews > 0 ? thisWeekViews : thisWeekEngagement;
      const prevDisplayViews = lastWeekViews > 0 ? lastWeekViews : lastWeekEngagement;

      const calcChange = (current: number, previous: number) => {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 100);
      };
      const viewsChange = calcChange(displayViews, prevDisplayViews);

      // ── Daily chart — last 7 days, engagement per day ─────────────────
      const sevenDaysAgo = subDays(new Date(), 6);
      const dailyViews = [0, 0, 0, 0, 0, 0, 0];
      allPosts.forEach((post) => {
        if (!post.published_at) return;
        const date = parseISO(post.published_at);
        if (date < sevenDaysAgo) return;
        const dayIndex = (date.getDay() + 6) % 7; // 0=Mon … 6=Sun
        const val = post.views > 0 ? post.views : (post.likes + post.comments);
        dailyViews[dayIndex] += val;
      });

      // ── Best post: highest engagement in last 30 days ─────────────────
      const bestPost = allPosts.length > 0
        ? allPosts.reduce((best, post) => {
            const postScore = post.views > 0 ? post.views : post.likes + post.comments;
            const bestScore = best.views > 0 ? best.views : best.likes + best.comments;
            return postScore > bestScore ? post : best;
          })
        : undefined;

      const contentRecap: ContentRecapData = {
        totalViews: displayViews,
        viewsChange,
        postsCount: thisWeekPosts.length > 0 ? thisWeekPosts.length : allPosts.length,
        bestPost,
        recentPosts: allPosts.slice(0, 3),
        dailyViews,
      };

      // ── Engagement card ───────────────────────────────────────────────
      const totalEngagement = thisWeekEngagement;
      const lastWeekTotalEngagement = lastWeekEngagement;
      const engagementChange = calcChange(totalEngagement, lastWeekTotalEngagement);
      const engagementRate = thisWeekViews > 0 ? (totalEngagement / thisWeekViews) * 100 : 0;

      const topPosts: TopPost[] = allPosts
        .map((post) => ({
          id: post.id,
          title: post.title,
          platform: post.platform,
          engagementRate: post.views > 0 ? ((post.likes + post.comments) / post.views) * 100 : (post.likes + post.comments),
          thumbnail_url: post.thumbnail_url,
        }))
        .sort((a, b) => b.engagementRate - a.engagementRate)
        .slice(0, 3);

      const engagement: EngagementData = {
        totalEngagement,
        engagementChange,
        engagementRate,
        metrics: {
          likes: thisWeekLikes,
          likesChange: calcChange(thisWeekLikes, lastWeekLikes),
          comments: thisWeekComments,
          commentsChange: calcChange(thisWeekComments, lastWeekComments),
          saves: 0,
          savesChange: 0,
          shares: 0,
          sharesChange: 0,
        },
        topPosts,
      };

      // ── Coming Up ─────────────────────────────────────────────────────
      const scheduledItems: ScheduleItem[] = (scheduledResult.data || []).map((post) => ({
        id: post.id, title: post.title || 'Untitled', scheduledTime: post.scheduled_for,
        platform: (post.platform?.toLowerCase() || 'instagram') as Platform,
        type: (post.content_type?.toLowerCase() || 'post') as ItemType,
      }));

      const todayItems = scheduledItems.filter((item) => isToday(parseISO(item.scheduledTime)));
      const thisWeekItems = scheduledItems.filter((item) => isThisWeek(parseISO(item.scheduledTime), { weekStartsOn: 1 }));
      const nextItem = scheduledItems[0];

      const comingUp: ComingUpData = {
        todayCount: todayItems.length,
        thisWeekCount: thisWeekItems.length,
        nextPostTime: nextItem?.scheduledTime,
        nextPostPlatform: nextItem?.platform,
        items: scheduledItems,
      };

      // ── Smart Tips ────────────────────────────────────────────────────
      const mapInsightToTip = (insight: any): SmartTip => {
        let type: TipType = 'optimization';
        if (insight.priority === 'high') type = 'warning';
        if (insight.insight_type === 'opportunity') type = 'opportunity';
        const d = insight.insight_data || {};
        return { id: insight.id, type, title: d.title || insight.title || 'Insight', description: d.description || insight.description || '', actionLabel: d.action || insight.action_label, actionUrl: d.actionUrl || insight.action_url, highlightText: d.highlightText || insight.highlight_text };
      };

      const tips = (insightsResult.data || []).map(mapInsightToTip);

      if (tips.length === 0 && hasRealData) {
        supabase.functions.invoke('generate-insights', { body: { userId: user.id } })
          .then(() => {
            supabase.from('social_insights').select('*').eq('user_id', user.id).eq('is_dismissed', false).order('created_at', { ascending: false }).limit(5)
              .then(({ data: freshInsights }) => {
                if (freshInsights && freshInsights.length > 0) {
                  setData((prev) => {
                    if (!prev) return prev;
                    const freshTips = freshInsights.map(mapInsightToTip);
                    return { ...prev, smartTips: { ...prev.smartTips, tipsCount: freshTips.length, tips: freshTips } };
                  });
                }
              });
          })
          .catch(() => {});
      }

      const defaultTips: SmartTip[] = tips.length === 0 ? [
        { id: 'default-1', type: 'optimization', title: 'Best Posting Time', description: 'Based on your analytics, posting Reels on Tuesday between 6-8 PM gets you 3x more engagement.', actionLabel: 'Schedule a Reel for Tuesday 7 PM', highlightText: 'Tuesday between 6-8 PM' },
        { id: 'default-2', type: 'warning', title: 'Posting Gap', description: "You haven't posted to Instagram in 5 days. Your audience engagement drops after 3 days of silence.", actionLabel: 'Create Instagram Post', highlightText: 'Instagram in 5 days' },
      ] : [];

      const smartTips: SmartTipsData = {
        tipsCount: tips.length || defaultTips.length,
        trendingCount: tips.filter((t) => t.type === 'opportunity').length,
        tips: tips.length > 0 ? tips : defaultTips,
        allCaughtUp: !!(sessionResult.data?.completed_at),
      };

      // ── Deal Pipeline ─────────────────────────────────────────────────
      const now = new Date();
      const activeDealsRaw = dealsResult.data || [];
      const stageStatusMessages: Record<string, string> = { Intake: 'Awaiting quote', Quoted: 'Quote sent, awaiting response', Negotiating: 'Negotiating terms', Contracted: 'Contract signed', 'In Production': 'Content in production' };

      const pipelineDeals: PipelineDeal[] = activeDealsRaw.map((deal: any) => {
        const amount = deal.final_amount || deal.quote_standard || 0;
        const followupDate = deal.next_followup ? new Date(deal.next_followup) : null;
        const daysStalled = followupDate ? Math.floor((now.getTime() - followupDate.getTime()) / 86400000) : 0;
        let status: DealStatus = 'on_track';
        let statusMessage = stageStatusMessages[deal.stage] || deal.stage;
        let actionType: 'follow_up' | 'contract' | 'quote' = 'follow_up';
        if (deal.payment_status === 'Overdue') { status = 'urgent'; statusMessage = 'Payment overdue'; actionType = 'follow_up'; }
        else if (followupDate && daysStalled > 0) { status = 'stalled'; statusMessage = `No response in ${daysStalled} day${daysStalled === 1 ? '' : 's'}`; actionType = 'follow_up'; }
        else if (deal.stage === 'Intake') { status = 'new'; actionType = 'quote'; }
        else if (deal.stage === 'Quoted' || deal.stage === 'Negotiating') { actionType = 'contract'; }
        return { id: deal.id, brand: deal.brand, status, statusMessage, amount, actionType, daysInStatus: daysStalled > 0 ? daysStalled : undefined };
      });

      const dealPipeline: DealPipelineData = {
        activeDeals: activeDealsRaw.length,
        stalledCount: pipelineDeals.filter((d) => d.status === 'stalled' || d.status === 'urgent').length,
        totalValue: pipelineDeals.reduce((sum, d) => sum + d.amount, 0),
        deals: pipelineDeals.slice(0, 5),
      };

      setData({ contentRecap, engagement, comingUp, smartTips, dealPipeline, session: sessionResult.data, userName });
    } catch (err) {
      console.error('Error fetching daily pulse data:', err);
      setError('Failed to load daily pulse');
    } finally {
      setLoading(false);
    }
  }, []);

  const markCardReviewed = useCallback(async (cardId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    const currentReviewed = data?.session?.cards_reviewed || [];
    const newReviewed = [...currentReviewed, cardId];
    const isComplete = newReviewed.length >= 4;
    const completedAt = isComplete ? new Date().toISOString() : null;
    await supabase.from('daily_pulse_sessions').upsert({ user_id: user.id, session_date: today, cards_reviewed: newReviewed, completed_at: completedAt }, { onConflict: 'user_id,session_date' });
    setData((prev) => prev ? { ...prev, session: { id: prev.session?.id || '', dismissed_all: prev.session?.dismissed_all || false, cards_reviewed: newReviewed, completed_at: completedAt } } : null);
  }, [data]);

  const dismissAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const today = format(new Date(), 'yyyy-MM-dd');
    await supabase.from('daily_pulse_sessions').upsert({ user_id: user.id, session_date: today, dismissed_all: true, completed_at: new Date().toISOString() }, { onConflict: 'user_id,session_date' });
    setData((prev) => prev ? { ...prev, session: { id: prev.session?.id || '', dismissed_all: true, cards_reviewed: prev.session?.cards_reviewed || [], completed_at: new Date().toISOString() } } : null);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, hasConnectedAccounts, connectedPlatforms, refetch: fetchData, markCardReviewed, dismissAll };
}
