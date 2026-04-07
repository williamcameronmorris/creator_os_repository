import { useState } from 'react';
import { TrendingUp, ChevronDown, Eye, Heart, Instagram, Youtube, Music2 } from 'lucide-react';

// -- Types -------------------------------------------------------------------
interface TopPost {
  platform: 'instagram' | 'youtube' | 'tiktok';
  title: string;
  engagementRate: number;
  views: number;
  thumbnail?: string;
}

type TimeWindow = '24h' | '7d' | '30d';

// -- Platform config ---------------------------------------------------------
const PLATFORM_META: Record<string, {
  label: string;
  icon: typeof Instagram;
  accent: string;
  accentBg: string;
  accentBorder: string;
}> = {
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    accent: 'text-pink-600 dark:text-pink-400',
    accentBg: 'bg-pink-500/10',
    accentBorder: 'border-pink-500/20',
  },
  youtube: {
    label: 'YouTube',
    icon: Youtube,
    accent: 'text-red-600 dark:text-red-400',
    accentBg: 'bg-red-500/10',
    accentBorder: 'border-red-500/20',
  },
  tiktok: {
    label: 'TikTok',
    icon: Music2,
    accent: 'text-cyan-600 dark:text-cyan-400',
    accentBg: 'bg-cyan-500/10',
    accentBorder: 'border-cyan-500/20',
  },
};

// -- Mock data ---------------------------------------------------------------
const MOCK_DATA: Record<TimeWindow, TopPost[]> = {
  '24h': [
    { platform: 'instagram', title: 'Why your mix sounds thin in mono', engagementRate: 8.4, views: 12400 },
    { platform: 'youtube', title: '5 EQ mistakes killing your guitar tone', engagementRate: 6.2, views: 31200 },
    { platform: 'tiktok', title: 'This $50 mic vs $3000 mic', engagementRate: 5.1, views: 89300 },
  ],
  '7d': [
    { platform: 'tiktok', title: 'POV: your first time in a real studio', engagementRate: 11.3, views: 243000 },
    { platform: 'instagram', title: 'The gain staging trick nobody talks about', engagementRate: 9.7, views: 28100 },
    { platform: 'youtube', title: 'I recorded an album in 48 hours', engagementRate: 7.8, views: 67500 },
  ],
  '30d': [
    { platform: 'youtube', title: 'Complete home studio setup guide 2026', engagementRate: 12.1, views: 189000 },
    { platform: 'tiktok', title: 'Analog vs digital and it is not close', engagementRate: 10.4, views: 512000 },
    { platform: 'instagram', title: 'My pedalboard evolution over 10 years', engagementRate: 8.9, views: 45200 },
  ],
};

// -- Helpers -----------------------------------------------------------------
function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// -- Platform card -----------------------------------------------------------
function PlatformCard({ post }: { post: TopPost }) {
  const meta = PLATFORM_META[post.platform];
  const Icon = meta.icon;

  return (
    <div className="min-w-[280px] w-[280px] md:min-w-0 md:w-auto bg-card border border-border rounded-2xl p-4 snap-start flex-shrink-0 md:flex-shrink">
      {/* Platform header */}
      <div className="flex items-center gap-2 mb-3">
        <div className={`w-7 h-7 rounded-lg ${meta.accentBg} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${meta.accent}`} />
        </div>
        <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
          {meta.label}
        </span>
      </div>

      {/* Post title */}
      <p className="text-sm font-bold text-foreground leading-snug mb-4 line-clamp-2 min-h-[2.5rem]">
        {post.title}
      </p>

      {/* Metrics */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Heart className="w-3 h-3" />
            Engagement
          </p>
          <p className={`text-2xl font-black tabular-nums ${meta.accent}`}>
            {post.engagementRate}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 justify-end">
            <Eye className="w-3 h-3" />
            Views
          </p>
          <p className="text-lg font-bold text-foreground tabular-nums">
            {formatViews(post.views)}
          </p>
        </div>
      </div>
    </div>
  );
}

// -- Empty state -------------------------------------------------------------
function EmptyState() {
  return (
    <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
        <TrendingUp className="w-5 h-5 text-primary" />
      </div>
      <p className="text-sm font-bold text-foreground">No performance data yet</p>
      <p className="text-xs text-muted-foreground max-w-xs">
        Connect your platforms to see which posts are performing best across Instagram, YouTube, and TikTok.
      </p>
    </div>
  );
}

// == MAIN EXPORT =============================================================
export function TopPerformingSection() {
  const [sectionOpen, setSectionOpen] = useState(false);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d');

  // Sort by engagement rate descending (dynamic card order)
  const posts = [...(MOCK_DATA[timeWindow] || [])].sort(
    (a, b) => b.engagementRate - a.engagementRate
  );

  const hasData = posts.length > 0;

  const handleTimeChange = (tw: TimeWindow, e: React.MouseEvent) => {
    e.stopPropagation();
    setTimeWindow(tw);
  };

  const handleSectionToggle = () => {
    setSectionOpen((prev) => !prev);
  };

  return (
    <div className="mb-8">
      {hasData ? (
        <div className="bg-card border border-border rounded-2xl overflow-hidden transition-all duration-200">
          {/* Section header */}
          <button
            onClick={handleSectionToggle}
            className="w-full flex items-center gap-2.5 p-4 text-left hover:bg-accent/50 transition-colors"
          >
            <TrendingUp className="w-4 h-4 text-primary flex-shrink-0" />
            <span className="text-xs font-black tracking-widest text-muted-foreground uppercase flex-1">
              Top Performing
            </span>

            {/* Time window pills */}
            <div className="flex items-center gap-1 mr-1">
              {(['24h', '7d', '30d'] as TimeWindow[]).map((tw) => (
                <button
                  key={tw}
                  onClick={(e) => handleTimeChange(tw, e)}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full transition-colors ${
                    timeWindow === tw
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                >
                  {tw}
                </button>
              ))}
            </div>

            <ChevronDown className={`w-4.5 h-4.5 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${
              sectionOpen ? 'rotate-180' : ''
            }`} />
          </button>

          {/* Collapsible content */}
          <div
            className={`overflow-hidden transition-all duration-300 ${
              sectionOpen ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            {/* Mobile: horizontal scroll with peek | Desktop: grid */}
            <div className="px-3 pb-3">
              <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory scrollbar-hide md:grid md:grid-cols-3 md:overflow-x-visible">
                {posts.map((post) => (
                  <PlatformCard key={post.platform} post={post} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
