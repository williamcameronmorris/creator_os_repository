import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ActionDashboard from '../ActionDashboard';
import { supabase } from '../../lib/supabase';
import { format, parseISO } from 'date-fns';
import { useDailyPulse } from '../../hooks/useDailyPulse';
import { useTheme } from '../../contexts/ThemeContext';
import { ContentRecapCard } from './ContentRecapCard';
import { EngagementCard } from './EngagementCard';
import { ComingUpCard } from './ComingUpCard';
import { SmartTipsCard } from './SmartTipsCard';
import { DailyBriefSection } from './DailyBriefSection';
import {
  CheckCircle,
  Plug,
  ArrowRight,
  Instagram,
  Youtube,
  Video,
  MessageCircle,
  ChevronRight,
  TrendingUp,
  Calendar,
  Lightbulb,
  RefreshCw,
  AlertCircle,
  Play,
  X,
  Send,
  Sparkles,
} from 'lucide-react';

type ExpandedCard = 'content' | 'engagement' | 'schedule' | 'tips' | null;

// ── Mobile slide definitions ────────────────────────────────────────────────
const SLIDES = ['home', 'content', 'schedule', 'tips'] as const;
type Slide = typeof SLIDES[number];

const SLIDE_COLORS_LIGHT: Record<Slide, string> = {
  home:     '#ede9fe',
  content:  '#ddd6fe',
  schedule: '#fce7f3',
  tips:     '#d1fae5',
};
const SLIDE_COLORS_DARK: Record<Slide, string> = {
  home:     '#09090b',
  content:  '#0d0d0f',
  schedule: '#0d0d0f',
  tips:     '#0d0d0f',
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
    <div className="rounded-3xl overflow-hidden shadow-sm bg-card border border-border flex flex-col">
      {/* Colored header */}
      <div className={`p-5 ${headerClass}`}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-black tracking-widest uppercase opacity-60">{label}</p>
          <Icon className="w-4 h-4 opacity-50" />
        </div>
        <h2 className="text-2xl font-black text-foreground leading-tight">{title}</h2>
      </div>

      {/* Card body */}
      <div className="p-5 flex flex-col flex-1">
        <p className="text-4xl font-black text-foreground leading-none">{stat}</p>
        <p className="text-sm text-muted-foreground mt-1 mb-3">{statLabel}</p>

        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {chips.map((c, i) => (
              <SummaryChip key={i} label={c.text} color={c.color} />
            ))}
          </div>
        )}

        <button
          onClick={onExpand}
          className="mt-auto w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground py-2.5 border border-border rounded-2xl hover:bg-accent transition-all"
        >
          {isExpanded ? 'Collapse' : 'Expand'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Expanded inline content */}
      {isExpanded && (
        <div className="border-t border-border px-5 pb-5 pt-4 bg-accent/50">
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
  const { theme } = useTheme();
  const { data, loading, hasConnectedAccounts, connectedPlatforms, dismissAll, markCardReviewed, refetch } = useDailyPulse();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dismissedPlatforms, setDismissedPlatforms] = useState<Set<string>>(new Set());
  const [expandedCard, setExpandedCard] = useState<ExpandedCard>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [aiQuery, setAiQuery] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiAsking, setAiAsking] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const placeholders = [
    "Ask your question here: Why did my engagements drop?",
    "Ask your question here: My last video performed great. Help me recreate it.",
    "Ask your question here: What content should I post next?"
  ];
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIndex((prev) => (prev + 1) % placeholders.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [placeholders.length]);
  const handleAiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = aiQuery.trim();
    if (!q || aiAsking) return;
    setAiAsking(true);
    setAiError(null);
    setAiResponse(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const { data: fnData, error: fnError } = await supabase.functions.invoke('ask-copilot', {
        body: { userId: user.id, question: q },
      });
      if (fnError) throw fnError;
      if (!fnData?.success) throw new Error(fnData?.error || 'No response from AI');
      setAiResponse(fnData.answer);
    } catch (err: any) {
      setAiError(err.message || 'Failed to get a response. Please try again.');
    } finally {
      setAiAsking(false);
    }
  };

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
        <p className="text-muted-foreground">Unable to load daily pulse</p>
      </div>
    );
  }

  const isCompleted = !!(data.session?.dismissed_all || data.session?.completed_at);

  const currentSlide = SLIDES[slideIndex];
  const slideColors = theme === 'dark' ? SLIDE_COLORS_DARK : SLIDE_COLORS_LIGHT;
  const bgColor = slideColors[currentSlide];

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
    const platforms = [
    { key: 'instagram' as const, label: 'Instagram', icon: Instagram, iconClass: 'text-pink-500', connected: connectedPlatforms.instagram },
    { key: 'youtube' as const, label: 'YouTube', icon: Youtube, iconClass: 'text-red-500', connected: connectedPlatforms.youtube },
    { key: 'tiktok' as const, label: 'TikTok', icon: Video, iconClass: 'text-foreground', connected: connectedPlatforms.tiktok },
    { key: 'threads' as const, label: 'Threads', icon: MessageCircle, iconClass: 'text-foreground', connected: connectedPlatforms.threads },
  ];

  const unconnectedPlatforms = platforms.filter(p => !p.connected && !dismissedPlatforms.has(p.key));
  const allHandled = unconnectedPlatforms.length === 0;

  // null = still loading; don't flash the banner before data arrives
  const ConnectBanner = () => !bannerDismissed && !allHandled ? (
    <div className="bg-card border border-border rounded-3xl p-5 mb-6 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Plug className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black text-foreground">Connect your platforms</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Pull in real data from your accounts</p>
          </div>
        </div>
        <button
          onClick={() => setBannerDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors p-1"
          aria-label="Skip"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {unconnectedPlatforms.map(({ key, label, icon: Icon, iconClass }) => (
          <div
            key={key}
            className="flex items-center gap-2.5 flex-1 px-3 py-2.5 rounded-2xl border bg-accent border-border"
          >
            <div className="w-4 h-4 rounded-full border-2 border-border flex-shrink-0" />
            <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${iconClass}`} />
            <span className="text-xs font-semibold text-muted-foreground">{label}</span>
            <button
              onClick={() => setDismissedPlatforms(prev => new Set([...prev, key]))}
              className="ml-auto flex items-center justify-center w-5 h-5 rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-label={`Skip ${label}`}
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => navigate('/settings')}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm transition-colors flex-shrink-0"
        >
          Connect <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      <button
        onClick={() => setBannerDismissed(true)}
        className="mt-3 w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
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
            <h1 className="text-4xl font-black text-foreground">
              {getGreeting()}, {data.userName} {getEmoji()}
            </h1>
            <p className="text-muted-foreground mt-1 text-base">
              {isCompleted ? "Here's how today is tracking" : `You have ${getThingsToReview()} things to review`}
            </p>
          </div>
          <span className="text-sm text-muted-foreground bg-card border border-border px-4 py-2 rounded-full shadow-sm font-medium">
            {format(new Date(), 'EEEE, MMMM d')}
          </span>
        </div>

        <ConnectBanner />

        {/* AI Copilot bar */}
      <div className="space-y-3 mb-8">
        <form onSubmit={handleAiSubmit}>
          <div className={`flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-chart-1/10 to-chart-3/10 border-2 shadow-lg backdrop-blur-sm transition-colors ${aiAsking ? 'border-chart-1/50' : 'border-chart-1/30'}`}>
            <div className={`flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-chart-1 to-chart-3 shadow-md transition-opacity ${aiAsking ? 'opacity-70' : ''}`}>
              <Sparkles className={`w-5 h-5 text-white ${aiAsking ? 'animate-pulse' : ''}`} />
            </div>
            <input type="text" value={aiQuery} onChange={(e) => { setAiQuery(e.target.value); if (aiResponse) setAiResponse(null); if (aiError) setAiError(null); }} placeholder={placeholders[placeholderIndex]} disabled={aiAsking} className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/70 focus:outline-none text-base disabled:opacity-60" />
            <button type="submit" disabled={aiAsking || !aiQuery.trim()} className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed" title="Ask your copilot">
              <Send className={`w-5 h-5 text-primary-foreground ${aiAsking ? 'animate-pulse' : ''}`} />
            </button>
          </div>
        </form>
        {(aiResponse || aiError) && (
          <div className={`rounded-2xl p-5 border ${aiError ? 'bg-destructive/5 border-destructive/20' : 'bg-gradient-to-br from-chart-1/5 to-chart-3/5 border-chart-1/20'}`}>
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-chart-1 to-chart-3 flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                {aiError ? <p className="text-sm text-destructive">{aiError}</p> : <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{aiResponse}</p>}
              </div>
              <button onClick={() => { setAiResponse(null); setAiError(null); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 text-lg leading-none" title="Dismiss">×</button>
            </div>
          </div>
        )}
      </div>
      {/* AI Daily Brief — proactive content recommendations */}
        <DailyBriefSection />

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

        {/* ── COMMAND CENTER section ──────────────────────────────────── */}
        <div className="mt-12">
          <div className="flex items-center gap-4 mb-8">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs font-black tracking-widest text-muted-foreground uppercase">Command Center</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <ActionDashboard onNavigate={navigate} embedded={true} />
        </div>

      {/* Footer actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isCompleted ? (
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-card border border-border text-foreground font-bold hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Metrics'}
            </button>
          ) : (
            <>
              <button
                onClick={handleSkipAll}
                className="px-6 py-3 rounded-2xl border border-border bg-card text-muted-foreground font-bold hover:bg-accent transition-colors"
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
                <h1 className="text-3xl font-black text-foreground leading-tight">
                  {getGreeting()},<br />{data.userName}
                  <span className="ml-2">{getEmoji()}</span>
                </h1>
                <span className="text-xs text-muted-foreground bg-card/70 border border-border px-3 py-1.5 rounded-full font-medium mt-1">
                  {format(new Date(), 'EEE, MMM d')}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">
                {isCompleted ? "Here's how today is tracking" : `You have ${getThingsToReview()} things to review`}
              </p>
            </div>

            {/* AI Copilot bar */}
        <div className="space-y-3 mb-4">
          <form onSubmit={handleAiSubmit}>
            <div className={`flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-br from-chart-1/10 to-chart-3/10 border-2 shadow-md backdrop-blur-sm transition-colors ${aiAsking ? 'border-chart-1/50' : 'border-chart-1/30'}`}>
              <div className={`flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-chart-1 to-chart-3 shadow flex-shrink-0 transition-opacity ${aiAsking ? 'opacity-70' : ''}`}>
                <Sparkles className={`w-4 h-4 text-white ${aiAsking ? 'animate-pulse' : ''}`} />
              </div>
              <input
                type="text"
                value={aiQuery}
                onChange={(e) => { setAiQuery(e.target.value); if (aiResponse) setAiResponse(null); if (aiError) setAiError(null); }}
                placeholder={placeholders[placeholderIndex]}
                disabled={aiAsking}
                className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/70 focus:outline-none text-sm disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={aiAsking || !aiQuery.trim()}
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-primary hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              >
                <Send className={`w-4 h-4 text-primary-foreground ${aiAsking ? 'animate-pulse' : ''}`} />
              </button>
            </div>
          </form>
          {(aiResponse || aiError) && (
            <div className={`rounded-2xl p-4 border ${aiError ? 'bg-destructive/5 border-destructive/20' : 'bg-gradient-to-br from-chart-1/5 to-chart-3/5 border-chart-1/20'}`}>
              <div className="flex items-start gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-chart-1 to-chart-3 flex-shrink-0 mt-0.5">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  {aiError
                    ? <p className="text-xs text-destructive">{aiError}</p>
                    : <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{aiResponse}</p>
                  }
                </div>
                <button onClick={() => { setAiResponse(null); setAiError(null); }} className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 text-lg leading-none">×</button>
              </div>
            </div>
          )}
        </div>
        {/* AI Daily Brief on mobile home slide */}
            <DailyBriefSection />

            {isCompleted ? (
              /* ── TODAY'S SNAPSHOT (post-session) ─────────────────────── */
              <div className="bg-card border border-border rounded-3xl p-5 shadow-sm flex-1 flex flex-col gap-4">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Today's Snapshot</span>
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
                  <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-2xl p-3">
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-accent flex-shrink-0 flex items-center justify-center">
                      {(data.contentRecap.bestPost.thumbnail_url || data.contentRecap.bestPost.media_url) ? (
                        <img
                          src={data.contentRecap.bestPost.thumbnail_url || data.contentRecap.bestPost.media_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Play className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-violet-400 uppercase tracking-wide mb-0.5">Top Post This Week</p>
                      <p className="text-sm font-bold text-foreground truncate">{data.contentRecap.bestPost.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
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
                    <div key={s.label} className="rounded-2xl p-3 text-center bg-accent border border-border">
                      <p className="text-lg font-black text-foreground">{s.value}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Time-sensitive: next post going live */}
                {data.comingUp.items[0] && (
                  <button
                    onClick={() => navigate('/schedule')}
                    className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2.5 w-full text-left"
                  >
                    <Calendar className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                    <span className="text-xs text-foreground font-medium flex-1 truncate">
                      Next: <strong>{data.comingUp.items[0].title}</strong>
                    </span>
                    <span className="text-xs text-rose-500 font-bold flex-shrink-0">
                      {format(parseISO(data.comingUp.items[0].scheduledTime), 'h:mm a')}
                    </span>
                  </button>
                )}

                {/* Connect checklist if no accounts */}
                {!bannerDismissed && !allHandled && (
                  <div className="rounded-2xl border border-border bg-accent p-3">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Connect platforms</p>
                    {unconnectedPlatforms.map(({ key, label, icon: Icon, iconClass }) => (
                      <div key={key} className="flex items-center gap-2 py-1">
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-border flex-shrink-0" />
                        <Icon className={`w-3 h-3 ${iconClass}`} />
                        <span className="text-xs text-muted-foreground">{label}</span>
                        <button
                          onClick={() => setDismissedPlatforms(prev => new Set([...prev, key]))}
                          className="ml-auto text-muted-foreground/50 hover:text-muted-foreground"
                          aria-label={`Skip ${label}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    <button onClick={() => navigate('/settings')} className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-violet-600 text-white text-xs font-bold hover:bg-violet-700 transition-colors" >
                      <Plug className="w-3 h-3" />
                      Connect
                    </button>
                    <button onClick={() => setBannerDismissed(true)} className="mt-1.5 w-full text-[10px] text-muted-foreground hover:text-foreground">Skip all</button>
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
              <div className="bg-card border border-border rounded-3xl p-5 shadow-sm flex-1 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Weekly Preview</span>
                </div>

                <div className="grid grid-cols-3 gap-3 my-4">
                  {[
                    { label: 'Views', value: contentStat, color: '#ddd6fe' },
                    { label: 'Posts', value: String(data.contentRecap.postsCount || 0), color: '#fde68a' },
                    { label: 'Tips', value: tipsStat, color: '#a7f3d0' },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl p-3 text-center bg-accent border border-border">
                      <p className="text-xl font-black text-foreground">{s.value}</p>
                      <p className="text-[10px] font-bold text-muted-foreground uppercase mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>

                {!bannerDismissed && !allHandled && (
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

            <p className="text-center text-xs text-muted-foreground mt-4 font-medium animate-swipe-hint">
              {isCompleted ? 'Swipe to review cards →' : 'Swipe left to continue →'}
            </p>
          </div>
        )}

        {/* Slide 1 — Content Recap */}
        {currentSlide === 'content' && (
          <div className="flex-1 flex flex-col">
            <p className="text-xs font-black tracking-widest text-purple-400 uppercase mb-1">WEEKLY REVIEW</p>
            <h2 className="text-4xl font-black text-foreground mb-6">Content<br />Recap</h2>
            <div className="bg-card border border-border rounded-3xl shadow-sm flex-1 overflow-auto">
              <ContentRecapCard
                data={data.contentRecap}
                isExpanded={true}
                onToggleExpand={() => {}}
                onViewAnalytics={() => navigate('/analytics')}
                hideCollapseButton={true}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4 font-medium animate-swipe-hint">
              Swipe right to continue →
            </p>
          </div>
        )}

        {/* Slide 2 — Coming Up */}
        {currentSlide === 'schedule' && (
          <div className="flex-1 flex flex-col">
            <p className="text-xs font-black tracking-widest text-rose-400 uppercase mb-1">SCHEDULE</p>
            <h2 className="text-4xl font-black text-foreground mb-6">Coming<br />Up</h2>
            <div className="bg-card border border-border rounded-3xl shadow-sm flex-1 overflow-auto">
              <ComingUpCard
                data={data.comingUp}
                isExpanded={true}
                onToggleExpand={() => {}}
                onEditPost={(id) => navigate(`/schedule?post=${id}&edit=true`)}
                onReschedule={(id) => navigate(`/schedule?post=${id}&reschedule=true`)}
                onViewCalendar={() => navigate('/schedule')}
                hideCollapseButton={true}
              />
            </div>
            <p className="text-center text-xs text-muted-foreground mt-4 font-medium animate-swipe-hint">
              Swipe right to continue →
            </p>
          </div>
        )}

        {/* Slide 4 — Smart Tips */}
        {currentSlide === 'tips' && (
          <div className="flex-1 flex flex-col">
            <p className="text-xs font-black tracking-widest text-emerald-500 uppercase mb-1">AI INSIGHTS</p>
            <h2 className="text-4xl font-black text-foreground mb-6">Smart<br />Tips</h2>
            <div className="bg-card border border-border rounded-3xl shadow-sm flex-1 overflow-auto">
              <SmartTipsCard
                data={data.smartTips}
                isExpanded={true}
                onToggleExpand={() => {}}
                onTipAction={(tip) => {
                  if (tip.actionUrl) navigate(tip.actionUrl);
                  else navigate('/studio');
                }}
                hideCollapseButton={true}
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
                    : 'w-2.5 h-2.5 bg-border hover:bg-muted-foreground'
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
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-card border-2 border-border text-foreground font-bold text-sm hover:bg-accent transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </button>
            ) : (
              <>
                <button
                  onClick={handleSkipAll}
                  className="flex-1 py-3.5 rounded-2xl border-2 border-border bg-card/60 text-muted-foreground font-bold text-sm hover:bg-card transition-colors"
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

      {/* ── MOBILE: Command Center (scrollable below swipe cards) ─── */}
      <div className="lg:hidden px-4 py-8 bg-background">
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs font-black tracking-widest text-muted-foreground uppercase">Command Center</span>
          <div className="flex-1 h-px bg-border" />
        </div>
        <ActionDashboard onNavigate={navigate} embedded={true} />
      </div>
    </>
  );
}

export { ContentRecapCard } from './ContentRecapCard';
export { EngagementCard } from './EngagementCard';
export { ComingUpCard } from './ComingUpCard';
export { SmartTipsCard } from './SmartTipsCard';
export { PulseCard } from './PulseCard';
