import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useDailyPulse } from '../../hooks/useDailyPulse';
import { ContentRecapCard } from './ContentRecapCard';
import { EngagementCard } from './EngagementCard';
import { ComingUpCard } from './ComingUpCard';
import { SmartTipsCard } from './SmartTipsCard';
import { DealPipelineCard } from './DealPipelineCard';
import { CheckCircle, PartyPopper, Plug, ArrowRight, Instagram, Youtube, Video } from 'lucide-react';

type ExpandedCard = 'content' | 'engagement' | 'schedule' | 'tips' | 'deals' | null;

export function DailyPulse() {
  const navigate = useNavigate();
  const { data, loading, hasConnectedAccounts, dismissAll, markCardReviewed } = useDailyPulse();
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);

  const handleToggleExpand = (card: ExpandedCard) => {
    setExpandedCard((current) => (current === card ? null : card));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const getThingsToReview = () => {
    if (!data) return 0;
    let count = 0;
    if (data.contentRecap.postsCount > 0 || data.contentRecap.totalViews > 0) count++;
    if (data.engagement.totalEngagement > 0) count++;
    if (data.comingUp.thisWeekCount > 0) count++;
    if (data.smartTips.tipsCount > 0) count++;
    if (data.dealPipeline.activeDeals > 0) count++;
    return count;
  };

  const handleSkipAll = async () => {
    await dismissAll();
  };

  const handleMarkAllReviewed = async () => {
    await markCardReviewed('content');
    await markCardReviewed('engagement');
    await markCardReviewed('schedule');
    await markCardReviewed('tips');
    await markCardReviewed('deals');
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-gray-200 dark:border-gray-700 border-t-gray-900 dark:border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-gray-500 dark:text-gray-400">Unable to load daily pulse</p>
      </div>
    );
  }

  const isCompleted = data.session?.dismissed_all || data.session?.completed_at !== null;

  if (isCompleted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-6">
            <PartyPopper className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">All caught up!</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">
            You've reviewed your daily pulse for today. Check back tomorrow for new updates.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/analytics')}
              className="px-6 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              View Analytics
            </button>
            <button
              onClick={() => navigate('/schedule')}
              className="px-6 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Content Schedule
            </button>
            <button
              onClick={() => navigate('/studio')}
              className="px-6 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Create Content
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-2">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Daily Pulse</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
              {getGreeting()}, {data.userName}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              You have {getThingsToReview()} things to review
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
              {format(new Date(), 'EEEE, MMMM d')}
            </span>
          </div>
        </div>
      </div>

      {/* Platform Connect Banner — shown when no platforms are connected */}
      {!hasConnectedAccounts && (
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-blue-500/20 rounded-2xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500/20 flex-shrink-0">
              <Plug className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-foreground mb-1">
                Connect a platform to see your real data
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                You're viewing demo data. Connect Instagram, TikTok, or YouTube to pull in your actual metrics and get personalized insights.
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <Instagram className="w-4 h-4 text-pink-500" />
                  <span className="text-xs text-muted-foreground">Instagram</span>
                </div>
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-slate-500 dark:text-teal-400" />
                  <span className="text-xs text-muted-foreground">TikTok</span>
                </div>
                <div className="flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">YouTube</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors flex-shrink-0"
            >
              Connect Now
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
        <ContentRecapCard
          data={data.contentRecap}
          isExpanded={expandedCard === 'content'}
          onToggleExpand={() => handleToggleExpand('content')}
          onViewAnalytics={() => navigate('/analytics')}
        />

        <EngagementCard
          data={data.engagement}
          isExpanded={expandedCard === 'engagement'}
          onToggleExpand={() => handleToggleExpand('engagement')}
          onViewAnalytics={() => navigate('/analytics')}
        />

        <ComingUpCard
          data={data.comingUp}
          isExpanded={expandedCard === 'schedule'}
          onToggleExpand={() => handleToggleExpand('schedule')}
          onEditPost={(postId) => navigate(`/schedule?post=${postId}&edit=true`)}
          onReschedule={(postId) => navigate(`/schedule?post=${postId}&reschedule=true`)}
          onViewCalendar={() => navigate('/schedule')}
        />

        <SmartTipsCard
          data={data.smartTips}
          isExpanded={expandedCard === 'tips'}
          onToggleExpand={() => handleToggleExpand('tips')}
          onTipAction={(tip) => {
            if (tip.actionUrl) {
              navigate(tip.actionUrl);
            } else if (tip.actionLabel?.toLowerCase().includes('tiktok')) {
              navigate('/studio?platform=tiktok');
            } else if (tip.actionLabel?.toLowerCase().includes('reel')) {
              navigate('/studio?platform=instagram&type=reel');
            } else {
              navigate('/studio');
            }
          }}
        />

        <DealPipelineCard
          data={data.dealPipeline}
          isExpanded={expandedCard === 'deals'}
          onToggleExpand={() => handleToggleExpand('deals')}
          onSendFollowUp={(dealId) => navigate(`/pipeline?deal=${dealId}&action=followup`)}
          onReviewContract={(dealId) => navigate(`/pipeline?deal=${dealId}&action=contract`)}
          onQuickQuote={(dealId) => navigate(`/quick-quote?deal=${dealId}`)}
          onViewDeal={(dealId) => navigate(`/pipeline?deal=${dealId}`)}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={handleSkipAll}
          className="px-6 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          Skip All
        </button>
        <button
          onClick={handleMarkAllReviewed}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
        >
          <CheckCircle className="w-5 h-5" />
          Mark All as Reviewed
        </button>
      </div>
    </div>
  );
}

export { ContentRecapCard } from './ContentRecapCard';
export { EngagementCard } from './EngagementCard';
export { ComingUpCard } from './ComingUpCard';
export { SmartTipsCard } from './SmartTipsCard';
export { PulseCard } from './PulseCard';
