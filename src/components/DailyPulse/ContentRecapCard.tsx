import { ArrowRight, Play, Heart, MessageCircle, Eye, Instagram, Youtube, Video } from 'lucide-react';
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

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

// ── Platform badge config ──────────────────────────────────────────────────
const PLATFORM = {
  instagram: {
    label: 'Instagram',
    badgeClass: 'bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400',
    Icon: Instagram,
    aspect: 'aspect-square',
  },
  youtube: {
    label: 'YouTube',
    badgeClass: 'bg-red-600',
    Icon: Youtube,
    aspect: 'aspect-video',
  },
  tiktok: {
    label: 'TikTok',
    badgeClass: 'bg-black',
    Icon: Video,
    aspect: 'aspect-[9/16]',
  },
} as const;

type PlatformKey = keyof typeof PLATFORM;

// ── Instagram-style post card ─────────────────────────────────────────────
function InstagramCard({ post }: { post: ContentPost }) {
  const imgSrc = post.thumbnail_url || post.media_url;
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden bg-accent group cursor-pointer">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30">
          <Instagram className="w-8 h-8 text-pink-300 dark:text-pink-600" />
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      {/* Platform badge — top right */}
      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center shadow-md">
        <Instagram className="w-3 h-3 text-white" />
      </div>

      {/* Stats + caption — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        {post.title && (
          <p className="text-white text-[11px] font-medium line-clamp-1 mb-1.5 drop-shadow">
            {post.title}
          </p>
        )}
        <div className="flex items-center gap-2.5">
          {post.likes > 0 && (
            <span className="flex items-center gap-1 text-white/90 text-[11px] font-semibold drop-shadow">
              <Heart className="w-3 h-3 fill-white" />
              {formatNumber(post.likes)}
            </span>
          )}
          {post.comments > 0 && (
            <span className="flex items-center gap-1 text-white/80 text-[11px] font-semibold drop-shadow">
              <MessageCircle className="w-3 h-3" />
              {formatNumber(post.comments)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── YouTube-style post card ───────────────────────────────────────────────
function YouTubeCard({ post }: { post: ContentPost }) {
  const imgSrc = post.thumbnail_url || post.media_url;
  return (
    <div className="col-span-2 rounded-2xl overflow-hidden bg-accent group cursor-pointer">
      <div className="relative aspect-video">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-50 to-gray-100 dark:from-red-950/30 dark:to-zinc-900">
            <Youtube className="w-10 h-10 text-red-300 dark:text-red-600" />
          </div>
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-red-600/90 backdrop-blur-sm flex items-center justify-center shadow-xl transition-transform duration-200 group-hover:scale-110">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* YT badge */}
        <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide shadow">
          YT
        </div>

        {/* Bottom gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Stats overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          {post.views > 0 && (
            <span className="flex items-center gap-1 text-white/80 text-[11px] font-semibold drop-shadow">
              <Eye className="w-3 h-3" />
              {formatNumber(post.views)} views
            </span>
          )}
        </div>
      </div>

      {/* Title below thumbnail (YouTube card style) */}
      {post.title && (
        <div className="p-2.5 bg-card border-t border-border">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {post.title}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Generic fallback card ─────────────────────────────────────────────────
function GenericCard({ post }: { post: ContentPost }) {
  const imgSrc = post.thumbnail_url || post.media_url;
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden bg-accent group cursor-pointer">
      {imgSrc ? (
        <img src={imgSrc} alt={post.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-accent">
          <Video className="w-7 h-7 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-white text-[11px] font-medium line-clamp-2">{post.title}</p>
      </div>
    </div>
  );
}

// ── Post card router ──────────────────────────────────────────────────────
function PostCard({ post }: { post: ContentPost }) {
  if (post.platform === 'youtube') return <YouTubeCard post={post} />;
  if (post.platform === 'instagram') return <InstagramCard post={post} />;
  return <GenericCard post={post} />;
}

// ── Main component ────────────────────────────────────────────────────────
export function ContentRecapCard({
  data, isExpanded, onToggleExpand, onViewAnalytics, hideCollapseButton,
}: ContentRecapCardProps) {
  const maxDailyViews = Math.max(...data.dailyViews, 1);

  const badges = [];
  if (data.viewsChange > 0) badges.push({ label: `+${data.viewsChange}%`, variant: 'success' as const });
  else if (data.viewsChange < 0) badges.push({ label: `${data.viewsChange}%`, variant: 'danger' as const });
  if (data.postsCount > 0) badges.push({ label: `${data.postsCount} posts`, variant: 'default' as const });

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

        {/* ── Bar chart ───────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Your Week in Numbers</p>
          <div className="flex items-end gap-1 h-16">
            {data.dailyViews.map((views, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-md transition-all hover:opacity-80 bg-violet-200 dark:bg-violet-800"
                style={{ height: `${Math.max((views / maxDailyViews) * 100, 4)}%`, opacity: views > 0 ? 1 : 0.3 }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
              <span key={i} className="text-xs text-muted-foreground flex-1 text-center">{day}</span>
            ))}
          </div>
        </div>

        {/* ── Top post ────────────────────────────────────────────── */}
        {data.bestPost && (
          <div className="bg-violet-50 dark:bg-violet-950/30 rounded-2xl p-3 border border-violet-100 dark:border-violet-900">
            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-2.5">
              ⭐ Top Post This Week
            </p>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl bg-accent flex-shrink-0 overflow-hidden relative">
                {(data.bestPost.thumbnail_url || data.bestPost.media_url) ? (
                  <img
                    src={data.bestPost.thumbnail_url || data.bestPost.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50 dark:from-pink-950/30 dark:to-purple-950/30">
                    <Play className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                {/* Mini platform badge */}
                <div className={
                  `absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center shadow ${
                    data.bestPost.platform === 'youtube' ? 'bg-red-600' :
                    data.bestPost.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-600' :
                    'bg-black'
                  }`
                }>
                  {data.bestPost.platform === 'youtube' ? (
                    <Youtube className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <Instagram className="w-2.5 h-2.5 text-white" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                  {data.bestPost.title}
                </p>
                <div className="flex items-center gap-2.5 mt-1.5">
                  {data.bestPost.views > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" /> {formatNumber(data.bestPost.views)}
                    </span>
                  )}
                  {data.bestPost.likes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="w-3 h-3" /> {formatNumber(data.bestPost.likes)}
                    </span>
                  )}
                  {data.bestPost.comments > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="w-3 h-3" /> {formatNumber(data.bestPost.comments)}
                    </span>
                  )}
                </div>
                {data.postsCount > 1 && data.totalViews > 0 && (
                  <p className="text-xs font-semibold text-violet-600 mt-1">
                    {Math.abs(Math.round(
                      ((data.bestPost.likes + data.bestPost.comments - data.totalViews / data.postsCount) /
                        Math.max(data.totalViews / data.postsCount, 1)) * 100
                    ))}% above avg
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent posts grid — platform-native cards ────────────── */}
        {data.recentPosts.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Recent Posts</p>
            <div className="grid grid-cols-2 gap-2">
              {data.recentPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────────── */}
        <button
          onClick={onViewAnalytics}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
        >
          View Full Analytics <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PulseCard>
  );
}
import { ArrowRight, Play, Heart, MessageCircle, Eye, Instagram, Youtube, Video } from 'lucide-react';
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

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}

// ── Platform badge config ──────────────────────────────────────────────────
const PLATFORM = {
  instagram: {
    label: 'Instagram',
    badgeClass: 'bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400',
    Icon: Instagram,
    aspect: 'aspect-square',
  },
  youtube: {
    label: 'YouTube',
    badgeClass: 'bg-red-600',
    Icon: Youtube,
    aspect: 'aspect-video',
  },
  tiktok: {
    label: 'TikTok',
    badgeClass: 'bg-black',
    Icon: Video,
    aspect: 'aspect-[9/16]',
  },
} as const;

type PlatformKey = keyof typeof PLATFORM;

// ── Instagram-style post card ─────────────────────────────────────────────
function InstagramCard({ post }: { post: ContentPost }) {
  const imgSrc = post.thumbnail_url || post.media_url;
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 group cursor-pointer">
      {imgSrc ? (
        <img
          src={imgSrc}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
          <Instagram className="w-8 h-8 text-pink-300" />
        </div>
      )}

      {/* Bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      {/* Platform badge — top right */}
      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-orange-400 flex items-center justify-center shadow-md">
        <Instagram className="w-3 h-3 text-white" />
      </div>

      {/* Stats + caption — bottom */}
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        {post.title && (
          <p className="text-white text-[11px] font-medium line-clamp-1 mb-1.5 drop-shadow">
            {post.title}
          </p>
        )}
        <div className="flex items-center gap-2.5">
          {post.likes > 0 && (
            <span className="flex items-center gap-1 text-white/90 text-[11px] font-semibold drop-shadow">
              <Heart className="w-3 h-3 fill-white" />
              {formatNumber(post.likes)}
            </span>
          )}
          {post.comments > 0 && (
            <span className="flex items-center gap-1 text-white/80 text-[11px] font-semibold drop-shadow">
              <MessageCircle className="w-3 h-3" />
              {formatNumber(post.comments)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── YouTube-style post card ───────────────────────────────────────────────
function YouTubeCard({ post }: { post: ContentPost }) {
  const imgSrc = post.thumbnail_url || post.media_url;
  return (
    <div className="col-span-2 rounded-2xl overflow-hidden bg-gray-100 group cursor-pointer">
      <div className="relative aspect-video">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={post.title}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-50 to-gray-100">
            <Youtube className="w-10 h-10 text-red-300" />
          </div>
        )}

        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-red-600/90 backdrop-blur-sm flex items-center justify-center shadow-xl transition-transform duration-200 group-hover:scale-110">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>

        {/* YT badge */}
        <div className="absolute top-2 right-2 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded tracking-wide shadow">
          YT
        </div>

        {/* Bottom gradient */}
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Stats overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-2.5">
          {post.views > 0 && (
            <span className="flex items-center gap-1 text-white/80 text-[11px] font-semibold drop-shadow">
              <Eye className="w-3 h-3" />
              {formatNumber(post.views)} views
            </span>
          )}
        </div>
      </div>

      {/* Title below thumbnail (YouTube card style) */}
      {post.title && (
        <div className="p-2.5 bg-card border-t border-border">
          <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
            {post.title}
          </p>
        </div>
      )}
    </div>
  );
}

// ── Generic fallback card ─────────────────────────────────────────────────
function GenericCard({ post }: { post: ContentPost }) {
  const imgSrc = post.thumbnail_url || post.media_url;
  return (
    <div className="relative aspect-square rounded-2xl overflow-hidden bg-gray-100 group cursor-pointer">
      {imgSrc ? (
        <img src={imgSrc} alt={post.title} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-accent">
          <Video className="w-7 h-7 text-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-2.5">
        <p className="text-white text-[11px] font-medium line-clamp-2">{post.title}</p>
      </div>
    </div>
  );
}

// ── Post card router ──────────────────────────────────────────────────────
function PostCard({ post }: { post: ContentPost }) {
  if (post.platform === 'youtube') return <YouTubeCard post={post} />;
  if (post.platform === 'instagram') return <InstagramCard post={post} />;
  return <GenericCard post={post} />;
}

// ── Main component ────────────────────────────────────────────────────────
export function ContentRecapCard({
  data, isExpanded, onToggleExpand, onViewAnalytics, hideCollapseButton,
}: ContentRecapCardProps) {
  const maxDailyViews = Math.max(...data.dailyViews, 1);

  const badges = [];
  if (data.viewsChange > 0) badges.push({ label: `+${data.viewsChange}%`, variant: 'success' as const });
  else if (data.viewsChange < 0) badges.push({ label: `${data.viewsChange}%`, variant: 'danger' as const });
  if (data.postsCount > 0) badges.push({ label: `${data.postsCount} posts`, variant: 'default' as const });

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

        {/* ── Bar chart ───────────────────────────────────────────── */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">Your Week in Numbers</p>
          <div className="flex items-end gap-1 h-16">
            {data.dailyViews.map((views, index) => (
              <div
                key={index}
                className="flex-1 rounded-t-md transition-all hover:opacity-80 bg-violet-200 dark:bg-violet-800"
                style={{ height: `${Math.max((views / maxDailyViews) * 100, 4)}%`, opacity: views > 0 ? 1 : 0.3 }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
              <span key={i} className="text-xs text-muted-foreground flex-1 text-center">{day}</span>
            ))}
          </div>
        </div>

        {/* ── Top post ────────────────────────────────────────────── */}
        {data.bestPost && (
          <div className="bg-violet-50 dark:bg-violet-950/30 rounded-2xl p-3 border border-violet-100 dark:border-violet-900">
            <p className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-2.5">
              ⭐ Top Post This Week
            </p>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl bg-gray-200 flex-shrink-0 overflow-hidden relative">
                {(data.bestPost.thumbnail_url || data.bestPost.media_url) ? (
                  <img
                    src={data.bestPost.thumbnail_url || data.bestPost.media_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-pink-50 to-purple-50">
                    <Play className="w-6 h-6 text-gray-400" />
                  </div>
                )}
                {/* Mini platform badge */}
                <div className={
                  `absolute bottom-1 right-1 w-4 h-4 rounded-full flex items-center justify-center shadow ${
                    data.bestPost.platform === 'youtube' ? 'bg-red-600' :
                    data.bestPost.platform === 'instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-600' :
                    'bg-black'
                  }`
                }>
                  {data.bestPost.platform === 'youtube' ? (
                    <Youtube className="w-2.5 h-2.5 text-white" />
                  ) : (
                    <Instagram className="w-2.5 h-2.5 text-white" />
                  )}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground line-clamp-2 leading-snug">
                  {data.bestPost.title}
                </p>
                <div className="flex items-center gap-2.5 mt-1.5">
                  {data.bestPost.views > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Eye className="w-3 h-3" /> {formatNumber(data.bestPost.views)}
                    </span>
                  )}
                  {data.bestPost.likes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="w-3 h-3" /> {formatNumber(data.bestPost.likes)}
                    </span>
                  )}
                  {data.bestPost.comments > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MessageCircle className="w-3 h-3" /> {formatNumber(data.bestPost.comments)}
                    </span>
                  )}
                </div>
                {data.postsCount > 1 && data.totalViews > 0 && (
                  <p className="text-xs font-semibold text-violet-600 mt-1">
                    {Math.abs(Math.round(
                      ((data.bestPost.likes + data.bestPost.comments - data.totalViews / data.postsCount) /
                        Math.max(data.totalViews / data.postsCount, 1)) * 100
                    ))}% above avg
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Recent posts grid — platform-native cards ────────────── */}
        {data.recentPosts.length > 0 && (
          <div>
            <p className="text-sm font-medium text-foreground mb-3">Recent Posts</p>
            <div className="grid grid-cols-2 gap-2">
              {data.recentPosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────────── */}
        <button
          onClick={onViewAnalytics}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
        >
          View Full Analytics <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PulseCard>
  );
}
