import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionDashboard from '../ActionDashboard';
import { format, parseISO } from 'date-fns';
import { useDailyPulse } from '../../hooks/useDailyPulse';
import { ContentRecapCard } from './ContentRecapCard';
import { EngagementCard } from './EngagementCard';
import { ComingUpCard } from './ComingUpCard';
import { SmartTipsCard } from './SmartTipsCard';
import {
  CheckCircle,
  Plug,
  ArrowRight,
  Instagram,
  Youtube,
  Video,
  ChevronRight,
  TrendingUp,
  Calendar,
  Lightbulb,
  RefreshCw,
  AlertCircle,
  Play,
  X,
} from 'lucide-react';

type ExpandedCard = 'content' | 'engagement' | 'schedule' | 'tips' | null;

// ── Mobile slide definitions ────────────────────────────────────────────────
const SLIDES = ['home', 'content', 'schedule', 'tips'] as const;
type Slide = typeof SLIDES[number];

const SLIDE_COLORS: Record<Slide, string> = {
  home:     '#ede9fe',   // lavender
  content:  '#ddd6fe',   // purple-200
  schedule: '#fecdd3',   // rose-200
  tips:     '#a7f3d0',   // green-200
};

// ── Greeting helper ─────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getEmoji() {
  const h = new Date().getHours();
  if (h < 12) return '☀️';
  if (h < 17) return '⚡';
  return '🌙';
}

// ── Card summary data for desktop grid headers ───────────────────────────────
function SummaryChip({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="text-xs font-semibold px-2.5 py-1 rounded-full"
      style={{ backgroundColor: color + '40', color: color }}
    >
      {label}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DESKTOP GRID CARD — colored header + white body summary
// ═══════════════════════════════════════════════════════════════════════════
function DesktopPulseCard({
  label,
  title,
  headerClass,
  icon: Icon,
  stat,
  statLabel,
  chips,
  isExpanded,
  onExpand,
  expandedContent,
}: {
  label: string;
  title: string;
  headerClass: string;
  icon: React.ElementType;
  stat: string;
  statLabel: string;
  chips?: { text: string; color: string }[];
  isExpanded: boolean;
  onExpand: () => void;
  expandedContent: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl overflow-hidden shadow-sm bg-white flex flex-col">
      {/* Colored header */}
      <div className={`p-5 ${headerClass}`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black tracking-widest uppercase opacity-60">{label}</p>
          <Icon className="w-4 h-4 opacity-50" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 leading-tight">{title}</h2>
      </div>

      {/* White body */}
      <div className="p-5 flex flex-col flex-1">
        <p className="text-4xl font-black text-gray-900 leading-none">{stat}</p>
        <p className="text-sm text-gray-400 mt-1 mb-3">{statLabel}</p>

        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {chips.map((c, i) => (
              <SummaryChip key={i} label={c.text} color={c.color} />
            ))}
          </div>
        )}

        <button
          onClick={onExpand}
          className="mt-auto w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-900 py-2.5 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Expanded inline content */}
      {isExpanded && (
        <div className="border-t border-gray-50 px-5 pb-5 pt-4 bg-gray-50/50">
          {expandedContent}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════
export function DailyPulse() {
  const navigate = useNavigate();
  const { data, loading, hasConnectedAccounts, connectedPlatforms, dismissAll, markCardReviewed, refetch } = useDailyPulse();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mobile swipe state
  const [slideIndex, setSlideIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const isDragging = useRef(false);
  const [dragOffset, setDragOffset] = useState(0);

  const handleToggleExpand = (card: ExpandedCard) =>
    setExpandedCard((c) => (c === card ? null : card));

  const getThingsToReview = () => {
    if (!data) return 0;
    let count = 0;
    if (data.contentRecap.postsCount > 0 || data.contentRecap.totalViews > 0) count++;
    if (data.engagement.totalEngagement > 0) count++;
    if (data.comingUp.thisWeekCount > 0) count++;
    if (data.smartTips.tipsCount > 0) count++;
    return count;
  };

  const handleDone = async () => {
    await markCardReviewed('content');
    await markCardReviewed('engagement');
    await markCardReviewed('schedule');
    await markCardReviewed('tips');
    // Snap back to home slide so user sees the completed "Today's Snapshot" view
    setSlideIndex(0);
  };

  const handleSkipAll = async () => {
    await dismissAll();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  // Mobile swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current || touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dy) > Math.abs(dx)) { isDragging.current = false; return; }
    setDragOffset(dx);
  };

  const onTouchEnd = () => {
    if (!isDragging.current) return;
    const threshold = 60;
    if (dragOffset < -threshold && slideIndex < SLIDES.length - 1) setSlideIndex(i => i + 1);
    if (dragOffset > threshold && slideIndex > 0) setSlideIndex(i => i - 1);
    setDragOffset(0);
    isDragging.current = false;
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // ── Loading state ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-gray-400">Unable to load daily pulse</p>
      </div>
    );
  }

  const isCompleted = !!(data.session?.dismissed_all || data.session?.completed_at);

  const currentSlide = SLIDES[slideIndex];
  const bgColor = SLIDE_COLORS[currentSlide];

  // ── Expanded card content for desktop grid ─────────────────────────────
  const expandedContentMap: Record<ExpandedCard & string, React.ReactNode> = {
    content: (
      <ContentRecapCard
        data={data.contentRecap}
        isExpanded={true}
        onToggleExpand={() => handleToggleExpand('content')}
        onViewAnalytics={() => navigate('/analytics')}
      />
    ),
    engagement: (
      <EngagementCard
        data={data.engagement}
        isExpanded={true}
        onToggleExpand={() => handleToggleExpand('engagement')}
        onViewAnalytics={() => navigate('/analytics')}
      />
    ),
    schedule: (
      <ComingUpCard
        data={data.comingUp}
        isExpanded={true}
        onToggleExpand={() => handleToggleExpand('schedule')}
        onEditPost={(id) => navigate(`/schedule?post=${id}&edit=true`)}
        onReschedule={(id) => navigate(`/schedule?post=${id}&reschedule=true`)}
        onViewCalendar={() => navigate('/schedule')}
      />
    ),
    tips: (
      <SmartTipsCard
        data={data.smartTips}
        isExpanded={true}
        onToggleExpand={() => handleToggleExpand('tips')}
        onTipAction={(tip) => {
          if (tip.actionUrl) navigate(tip.actionUrl);
          else if (tip.actionLabel?.toLowerCase().includes('tiktok')) navigate('/studio?platform=tiktok');
          else if (tip.actionLabel?.toLowerCase().includes('reel')) navigate('/studio?platform=instagram&type=reel');
          else navigate('/studio');
        }}
      />
    ),
  };

  // ── Stat helpers ────────────────────────────────────────────────────────
  const contentStat = data.contentRecap.totalViews >= 1000
    ? `${(data.contentRecap.totalViews / 1000).toFixed(1)}K`
    : String(data.contentRecap.totalViews || 0);

  const scheduleStat = String(data.comingUp.thisWeekCount || 0);

  const tipsStat = String(data.smartTips.tipsCount || 0);

  // ── Platform connect checklist ─────────────────────────────────────────
  const allConnected = connectedPlatforms.instagram && connectedPlatforms.youtube && connectedPlatforms.tiktok;
  const platforms = [
    { key: 'instagram' as const, label: 'Instagram', icon: Instagram, iconClass: 'text-pink-500', connected: connectedPlatforms.instagram },
    { key: 'youtube' as const, label: 'YouTube', icon: Youtube, iconClass: 'text-red-500', connected: connectedPlatforms.youtube },
    { key: 'tiktok' as const, label: 'TikTok', icon: Video, iconClass: 'text-gray-700', connected: connectedPlatforms.tiktok },
  ];

  const ConnectBanner = () =>
    !bannerDismissed && !allConnected ? (
      <div className="bg-white border border-gray-100 rounded-3xl p-5 mb-6 shadow-sm">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Plug className="w-4 h-4 text-violet-600" />
            </div>
            <div>
              <h3 className="text-sm font-black text-gray-900">Connect your platforms</h3>
              <p className="text-xs text-gray-400 mt-0.5">Pull in real data from your accounts</p>
            </div>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="text-gray-300 hover:text-gray-500 transition-colors p-1"
            aria-label="Skip"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {platforms.map(({ key, label, icon: Icon, iconClass, connected }) => (
            <div
              key={key}
              className={`flex items-center gap-2.5 flex-1 px-3 py-2.5 rounded-2xl border transition-colors ${
                connected
                  ? 'bg-emerald-50 border-emerald-200'
                  : 'bg-gray-50 border-gray-100'
              }`}
            >
              {connected ? (
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
              )}
              <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${connected ? 'text-emerald-500' : iconClass}`} />
              <span className={`text-xs font-semibold ${connected ? 'text-emerald-700' : 'text-gray-500'}`}>
                {label}
              </span>
              {connected && (
                <span className="text-[10px] text-emerald-500 font-bold ml-auto">Connected</span>
              )}
            </div>
          ))}

          <button
            onClick={() => navigate('/settings')}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors flex-shrink-0"
          >
            Connect
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={() => setBannerDismissed(true)}
          className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          Skip for now
        </button>
      </div>
    ) : null;

  // ═════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── DESKTOP (lg+) ──────────────────────────────────────────────── */}
      <div className="hidden lg:block max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-4xl font-black text-gray-900">
              {getGreeting()}, {data.userName} {getEmoji()}
            </h1>
            <p className="text-gray-400 mt-1 text-base">
              {isCompleted ? "Here's how today is tracking" : `You have ${getThingsToReview()} things to review`}
            </p>
          </div>
          <span className="text-sm text-gray-400 bg-white px-4 py-2 rounded-full shadow-sm font-medium">
            {format(new Date(), 'EEEE, MMMM d')}
          </span>
        </div>

        <ConnectBanner />

        {/* 3-card grid */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <DesktopPulseCard
            label="WEEKLY REVIEW"
            title={`Content\nRecap`}
            headerClass="pulse-card-purple"
            icon={TrendingUp}
            stat={contentStat}
            statLabel="views this week"
            chips={[
              data.contentRecap.viewsChange > 0
                ? { text: `+${data.contentRecap.viewsChange}% ↑`, color: '#059669' }
                : { text: `${data.contentRecap.viewsChange}%`, color: '#6b7280' },
              { text: `${data.contentRecap.postsCount} posts`, color: '#7c3aed' },
            ]}
            isExpanded={expandedCard === 'content'}
            onExpand={() => handleToggleExpand('content')}
            expandedContent={expandedContentMap.content}
          />

          <DesktopPulseCard
            label="SCHEDULE"
            title={`Coming\nUp`}
            headerClass="pulse-card-rose"
            icon={Calendar}
            stat={scheduleStat}
            statLabel="posts this week"
            chips={[
              ...(data.comingUp.todayCount > 0
                ? [{ text: `${data.comingUp.todayCount} today`, color: '#e11d48' }]
                : []),
              { text: `${data.comingUp.thisWeekCount} this week`, color: '#f43f5e' },
            ]}
            isExpanded={expandedCard === 'schedule'}
            onExpand={() => handleToggleExpand('schedule')}
            expandedContent={expandedContentMap.schedule}
          />

          <DesktopPulseCard
            label="AI INSIGHTS"
            title={`Smart\nTips`}
            headerClass="pulse-card-green"
            icon={Lightbulb}
            stat={tipsStat}
            statLabel="new ideas"
            chips={[
              { text: 'AI powered', color: '#059669' },
            ]}
            isExpanded={expandedCard === 'tips'}
            onExpand={() => handleToggleExpand('tips')}
            expandedContent={expandedContentMap.tips}
          />
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isCompleted ? (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-white border border-gray-200 text-gray-700 font-bold hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Metrics'}
            </button>
          ) : (
            <>
              <button
                onClick={handleSkipAll}
                className="px-6 py-3 rounded-2xl border border-gray-200 bg-white text-gray-500 font-bold hover:bg-gray-50 transition-colors"
              >
                Skip All
              </button>
              <button
                onClick={handleDone}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-violet-600 text-white font-bold hover:bg-violet-700 transition-colors"
              >
                <CheckCircle className="w-5 h-5" />
                Mark All as Reviewed
              </button>
            </>
          )}
        </div>

        {/* ── COMMAND CENTER section ──────────────────────────────────── */}
        <div className="mt-12">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs font-black tracking-widest text-gray-400 uppercase">Command Center</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <ActionDashboard onNavigate={navigate} embedded={true} />
        </div>
      </div>

      {/* ── MOBILE (< lg) — swipeable cards ─────────────────────────────── */}
      <div
        className="lg:hidden min-h-[calc(100vh-8rem)] flex flex-col transition-colors duration-500"
        style={{ backgroundColor: bgColor, margin: '-1rem', padding: '1.5rem' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Slide 0 — Home greeting */}
        {currentSlide === 'home' && (
          <div className="flex-1 flex flex-col">
            <div className="mb-6">
              <p className="text-xs font-black tracking-widest text-violet-400 uppercase mb-1">
                Daily Pulse
              </p>
              <div className="flex items-start justify-between">
                <h1 className="text-3xl font-black text-gray-900 leading-tight">
                  {getGreeting()},<br />{data.userName}
                  <span className="ml-2">{getEmoji()}</span>
                </h1>
                <span className="text-xs text-gray-500 bg-white/70 px-3 py-1.5 rounded-full font-medium mt-1">
                  {format(new Date(), 'EEE, MMM d')}
                </span>
              </div>
              <p className="text-gray-500 mt-2 text-sm">
                {isCompleted ? "Here's how today is tracking" : `You have ${getThingsToReview()} things to review`}
              </p>
            </div>

            {isCompleted ? (
              /* ── TODAY'S SNAPSHOT (post-session) ─────────────────────── */
              <div className="bg-white rounded-3xl p-5 shadow-sm flex-1 flex flex-col gap-4">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Today's Snapshot</span>
                  </div>
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-violet-600 transition-colors disabled:opacity-40"
                  >
                    <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                {/* Top post with real thumbnail */}
                {data.contentRecap.bestPost && (
                  <div className="flex items-center gap-3 bg-violet-50 rounded-2xl p-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-gray-200 flex-shrink-0 flex items-center justify-center">
                      {(data.contentRecap.bestPost.thumbnail_url || data.contentRecap.bestPost.media_url) ? (
                        <img
                          src={data.contentRecap.bestPost.thumbnail_url || data.contentRecap.bestPost.media_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Play className="w-6 h-6 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide mb-0.5">Top Post This Week</p>
                      <p className="text-sm font-bold text-gray-900 truncate">{data.contentRecap.bestPost.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {data.contentRecap.bestPost.views >= 1000
                          ? `${(data.contentRecap.bestPost.views / 1000).toFixed(1)}K`
                          : data.contentRecap.bestPost.views} views
                        {' · '}
                        {data.contentRecap.bestPost.likes} likes
                      </p>
                    </div>
                  </div>
                )}

                {/* Quick metrics row */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Views', value: contentStat, color: '#ddd6fe' },
                    {
                      label: 'Engage',
                      value: data.engagement.totalEngagement >= 1000
                        ? `${(data.engagement.totalEngagement / 1000).toFixed(1)}K`
                        : String(data.engagement.totalEngagement || 0),
                      color: '#fde68a',
                    },
                    { label: 'Posts', value: String(data.contentRecap.postsCount || 0), color: '#a7f3d0' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl p-3 text-center" style={{ backgroundColor: s.color }}>
                      <p className="text-lg font-black text-gray-900">{s.value}</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Time-sensitive: next post going live */}
                {data.comingUp.items[0] && (
                  <button
                    onClick={() => navigate('/schedule')}
                    className="flex items-center gap-2 bg-rose-50 rounded-xl px-3 py-2.5 w-full text-left"
                  >
                    <Calendar className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    <span className="text-xs text-gray-700 font-medium flex-1 truncate">
                      Next: <strong>{data.comingUp.items[0].title}</strong>
                    </span>
                    <span className="text-xs text-rose-500 font-bold flex-shrink-0">
                      {format(parseISO(data.comingUp.items[0].scheduledTime), 'h:mm a')}
                    </span>
                  </button>
                )}

                {/* Connect checklist if no accounts */}
                {!hasConnectedAccounts && !bannerDismissed && (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-3">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Connect platforms</p>
                    {platforms.map(({ key, label, icon: Icon, iconClass, connected }) => (
                      <div key={key} className="flex items-center gap-2 py-1">
                        {connected
                          ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300" />
                        }
                        <Icon className={`w-3 h-3 ${connected ? 'text-emerald-500' : iconClass}`} />
                        <span className={`text-xs ${connected ? 'text-emerald-600 font-semibold' : 'text-gray-500'}`}>{label}</span>
                      </div>
                    ))}
                    <button
                      onClick={() => navigate('/settings')}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors"
                    >
                      <Plug className="w-3 h-3" /> Connect
                    </button>
                    <button onClick={() => setBannerDismissed(true)} className="mt-1.5 w-full text-[10px] text-gray-400 hover:text-gray-500">Skip</button>
                  </div>
                )}

                {/* Analytics CTA */}
                <button
                  onClick={() => navigate('/analytics')}
                  className="mt-auto w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-colors"
                >
                  View Full Analytics
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : (
              /* ── ORIGINAL PRE-SESSION MINI PREVIEW ───────────────────── */
              <div className="bg-white rounded-3xl p-5 shadow-sm flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Weekly Preview</span>
                </div>

                <div className="grid grid-cols-3 gap-3 my-4">
                  {[
                    { label: 'Views', value: contentStat, color: '#ddd6fe' },
                    { label: 'Posts', value: String(data.contentRecap.postsCount || 0), color: '#fde68a' },
                    { label: 'Tips', value: tipsStat, color: '#a7f3d0' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl p-3 text-center" style={{ backgroundColor: s.color }}>
                      <p className="text-xl font-black text-gray-900">{s.value}</p>
                      <p className="text-[10px] font-bold text-gray-500 uppercase mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {!hasConnectedAccounts && !bannerDismissed && (
                  <button
                    onClick={() => navigate('/settings')}
                    className="mt-auto flex items-center justify-center gap-2 w-full py-2.5 rounded-2xl bg-violet-600 text-white text-sm font-bold hover:bg-violet-700 transition-colors"
                  >
                    <Plug className="w-4 h-4" />
                    Connect platforms
                  </button>
                )}
              </div>
            )}

            <p className="text-center text-xs text-gray-400 mt-4 font-medium animate-swipe-hint">
              {isCompleted ? 'Swipe to review cards →' : 'Swipe left to continue →'}
            </p>
          </div>
        )}

        {/* Slide 1 — Content Recap */}
        {currentSlide === 'content' && (
          <div className="flex-1 flex flex-col">
            <p className="text-xs font-black tracking-widest text-purple-400 uppercase mb-1">WEEKLY REVIEW</p>
            <h2 className="text-4xl font-black text-gray-900 mb-6">Content<br />Recap</h2>
            <div className="bg-white rounded-3xl shadow-sm flex-1 overflow-auto">
              <ContentRecapCard
                data={data.contentRecap}
                isExpanded={true}
                onToggleExpand={() => {}}
                onViewAnalytics={() => navigate('/analytics')}
              />
            </div>
            <p className="text-center text-xs text-gray-500 mt-4 font-medium animate-swipe-hint">
              Swipe right to continue →
            </p>
          </div>
        )}

        {/* Slide 2 — Coming Up */}
        {currentSlide === 'schedule' && (
          <div className="flex-1 flex flex-col">
            <p className="text-xs font-black tracking-widest text-rose-400 uppercase mb-1">SCHEDULE</p>
            <h2 className="text-4xl font-black text-gray-900 mb-6">Coming<br />Up</h2>
            <div className="bg-white rounded-3xl shadow-sm flex-1 overflow-auto">
              <ComingUpCard
                data={data.comingUp}
                isExpanded={true}
                onToggleExpand={() => {}}
                onEditPost={(id) => navigate(`/schedule?post=${id}&edit=true`)}
                onReschedule={(id) => navigate(`/schedule?post=${id}&reschedule=true`)}
                onViewCalendar={() => navigate('/schedule')}
              />
            </div>
            <p className="text-center text-xs text-gray-500 mt-4 font-medium animate-swipe-hint">
              Swipe right to continue →
            </p>
          </div>
        )}

        {/* Slide 4 — Smart Tips */}
        {currentSlide === 'tips' && (
          <div className="flex-1 flex flex-col">
            <p className="text-xs font-black tracking-widest text-emerald-500 uppercase mb-1">AI INSIGHTS</p>
            <h2 className="text-4xl font-black text-gray-900 mb-6">Smart<br />Tips</h2>
            <div className="bg-white rounded-3xl shadow-sm flex-1 overflow-auto">
              <SmartTipsCard
                data={data.smartTips}
                isExpanded={true}
                onToggleExpand={() => {}}
                onTipAction={(tip) => {
                  if (tip.actionUrl) navigate(tip.actionUrl);
                  else navigate('/studio');
                }}
              />
            </div>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-sm font-bold text-emerald-600">🎉 All caught up!</span>
            </div>
          </div>
        )}

        {/* Dot indicators + action buttons */}
        <div className="mt-6 flex flex-col items-center gap-4">
          {/* Dots */}
          <div className="flex items-center gap-2">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                className={`rounded-full transition-all ${
                  i === slideIndex
                    ? 'w-6 h-2.5 bg-violet-600'
                    : 'w-2.5 h-2.5 bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {/* Skip / Done / Refresh */}
          <div className="flex items-center gap-3 w-full">
            {isCompleted ? (
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-white border-2 border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleSkipAll}
                  className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 bg-white/60 text-gray-600 font-bold text-sm hover:bg-white transition-colors"
                >
                  Skip All
                </button>
                {slideIndex === SLIDES.length - 1 ? (
                  <button
                    onClick={handleDone}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-colors"
                  >
                    Done <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={() => setSlideIndex(i => i + 1)}
                    className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 transition-colors"
                  >
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export { ContentRecapCard } from './ContentRecapCard';
export { EngagementCard } from './EngagementCard';
export { ComingUpCard } from './ComingUpCard';
export { SmartTipsCard } from './SmartTipsCard';
export { PulseCard } from './PulseCard';
