import { Heart, MessageCircle, Bookmark, Share2, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { PulseCard } from './PulseCard';

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

interface EngagementCardProps {
  data: EngagementData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewAnalytics: () => void;
}

export function EngagementCard({
  data,
  isExpanded,
  onToggleExpand,
  onViewAnalytics,
}: EngagementCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const badges = [];
  if (data.engagementChange > 0) {
    badges.push({ label: `+${data.engagementChange}%`, variant: 'success' as const });
  } else if (data.engagementChange < 0) {
    badges.push({ label: `${data.engagementChange}%`, variant: 'danger' as const });
  }
  if (data.engagementRate > 0) {
    badges.push({ label: `${data.engagementRate.toFixed(1)}% rate`, variant: 'default' as const });
  }

  const metricItems = [
    { icon: Heart, label: 'Likes', value: data.metrics.likes, change: data.metrics.likesChange, color: 'text-rose-500' },
    { icon: MessageCircle, label: 'Comments', value: data.metrics.comments, change: data.metrics.commentsChange, color: 'text-sky-500' },
    { icon: Bookmark, label: 'Saves', value: data.metrics.saves, change: data.metrics.savesChange, color: 'text-amber-500' },
    { icon: Share2, label: 'Shares', value: data.metrics.shares, change: data.metrics.sharesChange, color: 'text-teal-500' },
  ];

  return (
    <PulseCard
      category="engagement"
      categoryLabel="ENGAGEMENT"
      title="Audience Activity"
      metric={formatNumber(data.totalEngagement)}
      metricLabel="interactions this week"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Engagement Breakdown</p>
          <div className="grid grid-cols-2 gap-3">
            {metricItems.map((item) => {
              const Icon = item.icon;
              const isPositive = item.change > 0;
              const isNegative = item.change < 0;

              return (
                <div key={item.label} className="bg-accent rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-foreground">
                      {formatNumber(item.value)}
                    </span>
                    {item.change !== 0 && (
                      <span className={`flex items-center text-xs font-medium ${
                        isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {isPositive ? '+' : ''}{item.change}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {data.topPosts.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Top Performing Posts</p>
            <div className="space-y-2">
              {data.topPosts.slice(0, 3).map((post, index) => (
                <div key={post.id} className="flex items-center gap-3 p-3 bg-accent rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 text-sm font-bold text-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.engagementRate.toFixed(1)}% engagement rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onViewAnalytics}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
        >
          View Full Analytics
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PulseCard>
  );
}
import { Heart, MessageCircle, Bookmark, Share2, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { PulseCard } from './PulseCard';

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

interface EngagementCardProps {
  data: EngagementData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewAnalytics: () => void;
}

export function EngagementCard({
  data,
  isExpanded,
  onToggleExpand,
  onViewAnalytics,
}: EngagementCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const badges = [];
  if (data.engagementChange > 0) {
    badges.push({ label: `+${data.engagementChange}%`, variant: 'success' as const });
  } else if (data.engagementChange < 0) {
    badges.push({ label: `${data.engagementChange}%`, variant: 'danger' as const });
  }
  if (data.engagementRate > 0) {
    badges.push({ label: `${data.engagementRate.toFixed(1)}% rate`, variant: 'default' as const });
  }

  const metricItems = [
    { icon: Heart, label: 'Likes', value: data.metrics.likes, change: data.metrics.likesChange, color: 'text-rose-500' },
    { icon: MessageCircle, label: 'Comments', value: data.metrics.comments, change: data.metrics.commentsChange, color: 'text-sky-500' },
    { icon: Bookmark, label: 'Saves', value: data.metrics.saves, change: data.metrics.savesChange, color: 'text-amber-500' },
    { icon: Share2, label: 'Shares', value: data.metrics.shares, change: data.metrics.sharesChange, color: 'text-teal-500' },
  ];

  return (
    <PulseCard
      category="engagement"
      categoryLabel="ENGAGEMENT"
      title="Audience Activity"
      metric={formatNumber(data.totalEngagement)}
      metricLabel="interactions this week"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Engagement Breakdown</p>
          <div className="grid grid-cols-2 gap-3">
            {metricItems.map((item) => {
              const Icon = item.icon;
              const isPositive = item.change > 0;
              const isNegative = item.change < 0;

              return (
                <div key={item.label} className="bg-accent rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-foreground">
                      {formatNumber(item.value)}
                    </span>
                    {item.change !== 0 && (
                      <span className={`flex items-center text-xs font-medium ${
                        isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-muted-foreground'
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {isPositive ? '+' : ''}{item.change}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {data.topPosts.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Top Performing Posts</p>
            <div className="space-y-2">
              {data.topPosts.slice(0, 3).map((post, index) => (
                <div key={post.id} className="flex items-center gap-3 p-3 bg-accent rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 text-sm font-bold text-foreground">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.engagementRate.toFixed(1)}% engagement rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onViewAnalytics}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
        >
          View Full Analytics
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PulseCard>
  );
}
import { Heart, MessageCircle, Bookmark, Share2, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import { PulseCard } from './PulseCard';

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

interface EngagementCardProps {
  data: EngagementData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewAnalytics: () => void;
}

export function EngagementCard({
  data,
  isExpanded,
  onToggleExpand,
  onViewAnalytics,
}: EngagementCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const badges = [];
  if (data.engagementChange > 0) {
    badges.push({ label: `+${data.engagementChange}%`, variant: 'success' as const });
  } else if (data.engagementChange < 0) {
    badges.push({ label: `${data.engagementChange}%`, variant: 'danger' as const });
  }
  if (data.engagementRate > 0) {
    badges.push({ label: `${data.engagementRate.toFixed(1)}% rate`, variant: 'default' as const });
  }

  const metricItems = [
    { icon: Heart, label: 'Likes', value: data.metrics.likes, change: data.metrics.likesChange, color: 'text-rose-500' },
    { icon: MessageCircle, label: 'Comments', value: data.metrics.comments, change: data.metrics.commentsChange, color: 'text-sky-500' },
    { icon: Bookmark, label: 'Saves', value: data.metrics.saves, change: data.metrics.savesChange, color: 'text-amber-500' },
    { icon: Share2, label: 'Shares', value: data.metrics.shares, change: data.metrics.sharesChange, color: 'text-teal-500' },
  ];

  return (
    <PulseCard
      category="engagement"
      categoryLabel="ENGAGEMENT"
      title="Audience Activity"
      metric={formatNumber(data.totalEngagement)}
      metricLabel="interactions this week"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Engagement Breakdown</p>
          <div className="grid grid-cols-2 gap-3">
            {metricItems.map((item) => {
              const Icon = item.icon;
              const isPositive = item.change > 0;
              const isNegative = item.change < 0;

              return (
                <div key={item.label} className="bg-gray-100 rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${item.color}`} />
                    <span className="text-xs text-gray-500">{item.label}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold text-gray-900">
                      {formatNumber(item.value)}
                    </span>
                    {item.change !== 0 && (
                      <span className={`flex items-center text-xs font-medium ${
                        isPositive ? 'text-emerald-600' : isNegative ? 'text-red-500' : 'text-gray-400'
                      }`}>
                        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
                        {isPositive ? '+' : ''}{item.change}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {data.topPosts.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Top Performing Posts</p>
            <div className="space-y-2">
              {data.topPosts.slice(0, 3).map((post, index) => (
                <div key={post.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 text-sm font-bold text-gray-700">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{post.title}</p>
                    <p className="text-xs text-gray-500">{post.engagementRate.toFixed(1)}% engagement rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={onViewAnalytics}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
        >
          View Full Analytics
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PulseCard>
  );
}
