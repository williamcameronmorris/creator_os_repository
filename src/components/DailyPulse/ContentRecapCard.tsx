import { ArrowRight, Play } from 'lucide-react';
import { PulseCard } from './PulseCard';

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

interface ContentRecapCardProps {
  data: ContentRecapData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onViewAnalytics: () => void;
  hideCollapseButton?: boolean;
}

export function ContentRecapCard({
  data,
  isExpanded,
  onToggleExpand,
  onViewAnalytics,
  hideCollapseButton,
}: ContentRecapCardProps) {
  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const maxDailyViews = Math.max(...data.dailyViews, 1);
  const barColors = ['#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#e5e7eb', '#d1d5db', '#9ca3af'];

  const badges = [];
  if (data.viewsChange > 0) {
    badges.push({ label: `+${data.viewsChange}%`, variant: 'success' as const });
  } else if (data.viewsChange < 0) {
    badges.push({ label: `${data.viewsChange}%`, variant: 'danger' as const });
  }
  if (data.postsCount > 0) {
    badges.push({ label: `${data.postsCount} posts`, variant: 'default' as const });
  }

  return (
    <PulseCard
      category="content"
      categoryLabel="WEEKLY REVIEW"
      title="Content Recap"
      metric={formatNumber(data.totalViews)}
      metricLabel="views this week"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      hideCollapseButton={hideCollapseButton}
    >
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">Your Week in Numbers</p>
          <div className="flex items-end gap-1 h-16">
            {data.dailyViews.map((views, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-md transition-all hover:opacity-80"
                style={{
                  height: `${(views / maxDailyViews) * 100}%`,
                  backgroundColor: barColors[index],
                  minHeight: '4px',
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
              <span key={i} className="text-xs text-gray-400 flex-1 text-center">
                {day}
              </span>
            ))}
          </div>
        </div>

        {data.bestPost && (
          <div className="bg-violet-50 rounded-xl p-3 border border-violet-100">
            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-2">⭐ Top Post This Week</p>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl bg-gray-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {(data.bestPost.thumbnail_url || data.bestPost.media_url) ? (
                  <img
                    src={data.bestPost.thumbnail_url || data.bestPost.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Play className="w-6 h-6 text-gray-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {data.bestPost.title}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {formatNumber(data.bestPost.views)} views · {formatNumber(data.bestPost.likes)} likes
                </p>
                {data.postsCount > 1 && (
                  <p className="text-xs font-semibold text-violet-600 mt-1">
                    {Math.round(
                      ((data.bestPost.views - data.totalViews / data.postsCount) /
                        (data.totalViews / data.postsCount)) *
                        100
                    )}% above your average
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {data.recentPosts.length > 0 && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">This Week's Posts</p>
            <div className="space-y-3">
              {data.recentPosts.slice(0, 5).map((post) => {
                const imgSrc = post.thumbnail_url || post.media_url;
                return (
                  <div key={post.id} className="bg-gray-50 rounded-xl overflow-hidden">
                    {imgSrc && (
                      <div className="w-full aspect-video bg-gray-200 overflow-hidden">
                        <img
                          src={imgSrc}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{post.platform}</span>
                      </div>
                      {post.caption ? (
                        <p className="text-xs text-gray-700 line-clamp-2 mb-2">{post.caption}</p>
                      ) : (
                        <p className="text-xs font-medium text-gray-900 truncate mb-2">{post.title}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{formatNumber(post.views)} views</span>
                        <span>{formatNumber(post.likes)} likes</span>
                        <span>{formatNumber(post.comments)} comments</span>
                      </div>
                    </div>
                  </div>
                );
              })}
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
