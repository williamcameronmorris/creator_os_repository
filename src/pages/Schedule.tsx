import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, Instagram, Youtube, Plus, Sparkles, Edit, Trash2, DollarSign, TrendingUp, Lock, Crown, CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, AlertTriangle, AtSign, LayoutGrid, List, ChevronDown } from 'lucide-react';
import { useTimezone } from '../hooks/useTimezone';
import { formatInTz } from '../lib/timezone';
import { CalendarView } from '../components/CalendarView';

interface Post {
  id: string;
  platform: string;
  caption: string;
  media_urls: string[];
  scheduled_date: string | null;
  scheduled_for: string | null;
  status: string;
  deal_id?: string | null;
  is_sponsored?: boolean;
  publish_status: string | null;
  publish_error: string | null;
  platform_post_id: string | null;
  published_at: string | null;
  thumbnail_url?: string | null;
  media_type?: string | null;
}

type CalGranularity = 'monthly' | 'weekly' | 'daily';

export function Schedule() {
  const { user } = useAuth();
  const { tier } = useSubscription();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'draft' | 'published'>('all');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('calendar');
  const [calGranularity, setCalGranularity] = useState<CalGranularity>('weekly');
  const [calDropdownOpen, setCalDropdownOpen] = useState(false);
  const calDropdownRef = useRef<HTMLDivElement>(null);

  const isPremium = tier === 'paid';
  const { timezone } = useTimezone();

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (calDropdownRef.current && !calDropdownRef.current.contains(e.target as Node)) {
        setCalDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const loadPosts = async () => {
    if (!user) return;
    const selectCols = 'id, platform, caption, media_urls, scheduled_date, scheduled_for, status, deal_id, is_sponsored, publish_status, publish_error, platform_post_id, published_at, thumbnail_url, media_type';

    // Scheduled + draft posts are few; always load all of them so they
    // are never pushed out by the published-posts pagination window.
    const { data: activePosts } = await supabase
      .from('content_posts_unified')
      .select(selectCols)
      .eq('user_id', user.id)
      .in('status', ['scheduled', 'draft'])
      .order('scheduled_for', { ascending: true, nullsFirst: false });

    // Published posts: most recent 200.
    const { data: publishedPosts } = await supabase
      .from('content_posts_unified')
      .select(selectCols)
      .eq('user_id', user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(0, 199);

    setPosts([...(activePosts || []), ...(publishedPosts || [])]);
    setLoading(false);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
    const { error } = await supabase.from('content_posts_unified').delete().eq('id', postId);
    if (!error) loadPosts();
  };

  const handleEdit = (post: Post) => navigate(`/schedule/edit/${post.id}`);

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram': return Instagram;
      case 'youtube':   return Youtube;
      case 'tiktok':    return Sparkles;
      case 'threads':   return AtSign;
      default:          return Calendar;
    }
  };

  // Client-side filter
  const filteredPosts = filter === 'all'
    ? posts
    : posts.filter(p => p.status === filter);

  const getPlatformPostUrl = (platform: string, platformPostId: string | null): string | null => {
    if (!platformPostId) return null;
    switch (platform) {
      case 'youtube':  return `https://www.youtube.com/watch?v=${platformPostId}`;
      case 'instagram': return `https://www.instagram.com/p/${platformPostId}/`;
      case 'threads':  return `https://www.threads.net/post/${platformPostId}`;
      default: return null;
    }
  };

  const scheduledPosts = posts.filter(p => p.status === 'scheduled');
  const totalScheduled = scheduledPosts.length;
  const schedulingLimit = isPremium ? 999 : 5;

  const handleNewPost = () => {
    if (!isPremium && totalScheduled >= schedulingLimit) {
      alert(`You've reached the limit of ${schedulingLimit} scheduled posts on the free plan. Upgrade to schedule unlimited posts.`);
      return;
    }
    navigate('/compose');
  };

  const now = new Date();
  const next7Days  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000);
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const thisWeekPosts = scheduledPosts.filter(p => {
    const dateStr = p.scheduled_for || p.scheduled_date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= now && d <= next7Days;
  }).length;

  const publishingSoonPosts = scheduledPosts.filter(p => {
    const dateStr = p.scheduled_for || p.scheduled_date;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    return d >= now && d <= next24Hours;
  }).length;

  const granularityLabels: Record<CalGranularity, string> = {
    monthly: 'Monthly',
    weekly:  'Weekly',
    daily:   'Daily',
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Ã¢ÂÂÃ¢ÂÂ Page header Ã¢ÂÂÃ¢ÂÂ */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h1 className="t-display t-h1 mb-1">Content Schedule</h1>
            <p className="t-micro text-muted-foreground">Manage your scheduled and draft posts</p>
          </div>
          <button
            onClick={handleNewPost}
            className="btn-ie btn-ie-solid flex items-center gap-2 flex-shrink-0"
          >
            <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
            <span>New Post</span>
          </button>
        </div>

        {/* Ã¢ÂÂÃ¢ÂÂ Filter + view controls Ã¢ÂÂÃ¢ÂÂ */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Status filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {(['all', 'scheduled', 'draft', 'published'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 font-medium transition-colors text-sm border ${
                  filter === f
                    ? 'bg-foreground text-background border-foreground'
                    : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                {f === 'all' ? 'All' : f === 'scheduled' ? 'Scheduled' : f === 'draft' ? 'Drafts' : 'Published'}
              </button>
            ))}
          </div>

          {/* View toggle + calendar granularity */}
          <div className="flex items-center gap-2">
            {/* List / Calendar toggle */}
            <div className="flex items-center border border-border overflow-hidden">
              <button
                onClick={() => setViewMode('list')}
                className={`p-2.5 transition-colors border-r border-border ${viewMode === 'list' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent'}`}
                title="List view"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('calendar')}
                className={`p-2.5 transition-colors ${viewMode === 'calendar' ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent'}`}
                title="Calendar view"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

            {/* Granularity dropdown Ã¢ÂÂ only in calendar mode */}
            {viewMode === 'calendar' && (
              <div className="relative" ref={calDropdownRef}>
                <button
                  onClick={() => setCalDropdownOpen(o => !o)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-border text-sm font-medium text-foreground hover:bg-accent transition-colors"
                >
                  {granularityLabels[calGranularity]}
                  <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${calDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {calDropdownOpen && (
                  <div className="absolute right-0 mt-1 w-32 bg-card border border-border overflow-hidden z-10">
                    {(['daily', 'weekly', 'monthly'] as CalGranularity[]).map(g => (
                      <button
                        key={g}
                        onClick={() => { setCalGranularity(g); setCalDropdownOpen(false); }}
                        className={`w-full px-3 py-2 text-sm text-left transition-colors border-b border-border last:border-b-0 ${calGranularity === g ? 'bg-foreground text-background font-semibold' : 'text-foreground hover:bg-accent'}`}
                      >
                        {granularityLabels[g]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Ã¢ÂÂÃ¢ÂÂ Content area Ã¢ÂÂÃ¢ÂÂ */}
      <div className="mb-8">
        {/* Calendar view */}
        {viewMode === 'calendar' && !loading && (
          <CalendarView
            posts={posts.filter(p => p.status === 'scheduled' && (p.scheduled_date || p.scheduled_for))}
            timezone={timezone}
            onPostClick={p => handleEdit(p as Post)}
            granularity={calGranularity}
          />
        )}

        {/* List view */}
        {viewMode === 'list' && loading && (
          <div className="p-8 text-center bg-card border border-border">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        )}

        {viewMode === 'list' && !loading && filteredPosts.length === 0 && (
          <div className="p-12 text-center bg-card border border-border">
            <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-xl font-bold mb-2 text-foreground">
              {filter === 'all' ? 'No posts yet' : filter === 'scheduled' ? 'No scheduled posts' : filter === 'draft' ? 'No drafts' : 'No published posts'}
            </h3>
            <p className="mb-6 text-muted-foreground">
              {filter === 'draft'
                ? 'Drafts you save will appear here'
                : 'Create your first post to get started with content scheduling'}
            </p>
            <button
              onClick={handleNewPost}
              className="btn-ie btn-ie-solid inline-flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Create Post
            </button>
          </div>
        )}

        {viewMode === 'list' && !loading && filteredPosts.length > 0 && (
          <div className="grid gap-3">
            {filteredPosts.map((post) => {
              const Icon = getPlatformIcon(post.platform);
              return (
                <div
                  key={post.id}
                  className={`p-4 relative bg-card border border-border overflow-hidden ${
                    post.is_sponsored ? 'border-l-4 border-l-amber-500' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Platform icon */}
                    <div className="flex items-center justify-center w-10 h-10 border border-border bg-accent flex-shrink-0 mt-0.5">
                      <Icon className="w-5 h-5 text-chart-1" />
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      {/* Title row: badges + actions */}
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                          <h3 className="font-semibold text-foreground text-sm">
                            {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)} Post
                          </h3>
                          {post.is_sponsored && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-amber-500/10 text-amber-600 font-semibold">
                              <DollarSign className="w-3 h-3" />
                              Sponsored
                            </span>
                          )}
                          {post.status !== 'published' && (
                            <span className={`px-1.5 py-0.5 text-xs rounded-full font-semibold ${
                              post.status === 'scheduled' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'
                            }`}>
                              {post.status}
                            </span>
                          )}
                          {post.publish_status === 'publishing' && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-600 font-semibold">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              PublishingÃ¢ÂÂ¦
                            </span>
                          )}
                          {post.publish_status === 'published' && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-600 font-semibold">
                              <CheckCircle2 className="w-3 h-3" />
                              Published
                            </span>
                          )}
                          {post.publish_status === 'failed' && (
                            <span className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-full bg-red-500/10 text-red-600 font-semibold">
                              <XCircle className="w-3 h-3" />
                              Failed
                            </span>
                          )}
                        </div>

                        {/* Action buttons Ã¢ÂÂ always top-right, compact */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {post.publish_status === 'failed' && (
                            <button
                              onClick={async () => {
                                await supabase.from('content_posts_unified').update({ publish_status: null, publish_error: null }).eq('id', post.id);
                                loadPosts();
                              }}
                              className="p-1.5 transition-colors hover:bg-accent border border-border"
                              title="Retry publish"
                            >
                              <RefreshCw className="w-4 h-4 text-orange-500" />
                            </button>
                          )}
                          {post.status !== 'published' && (
                            <button onClick={() => handleEdit(post)} className="p-1.5 transition-colors hover:bg-accent border border-border">
                              <Edit className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                            </button>
                          )}
                          <button onClick={() => handleDelete(post.id)} className="p-1.5 transition-colors hover:bg-accent border border-border">
                            <Trash2 className="w-4 h-4 text-muted-foreground hover:text-foreground" />
                          </button>
                        </div>
                      </div>

                      {/* Caption + optional thumbnail row */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm mb-2 line-clamp-2 text-muted-foreground">
                            {post.caption || 'No caption'}
                          </p>

                          {(post.scheduled_for || post.scheduled_date) && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                              {post.publish_status === 'published' && post.published_at
                                ? `Published ${formatInTz(post.published_at, timezone)}`
                                : formatInTz((post.scheduled_for || post.scheduled_date), timezone)}
                            </div>
                          )}

                          {post.publish_status === 'failed' && post.publish_error && (
                            <div className="flex items-start gap-2 mt-2 p-2 bg-red-500/10 border border-red-500/20">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                              <p className="text-xs text-red-600">{post.publish_error}</p>
                            </div>
                          )}

                          {post.publish_status === 'published' && (() => {
                            const url = getPlatformPostUrl(post.platform, post.platform_post_id);
                            return url ? (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 mt-1 text-xs text-primary hover:underline">
                                <ExternalLink className="w-3 h-3" />
                                View on {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)}
                              </a>
                            ) : null;
                          })()}
                        </div>

                        {/* Thumbnail Ã¢ÂÂ smaller on mobile, larger on desktop */}
                        {post.media_urls && post.media_urls.length > 0 && (
                          <div className="relative flex-shrink-0">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 overflow-hidden border border-border bg-accent">
                              <img src={post.media_type === 'video' && post.thumbnail_url ? post.thumbnail_url : post.media_urls[0]} alt="" className="w-full h-full object-cover" />
                            </div>
                            {post.media_urls.length > 1 && (
                              <div className="absolute -bottom-1 -right-1 px-1 py-0.5 bg-card border border-border text-[10px] text-muted-foreground font-semibold">
                                +{post.media_urls.length - 1}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ã¢ÂÂÃ¢ÂÂ Stats Ã¢ÂÂÃ¢ÂÂ */}
      <div className="mb-8">
        <h2 className="t-h2 font-bold text-foreground mb-4">Content Scheduling Stats</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="p-5 bg-card border border-border overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Scheduled</span>
                <div className="flex items-center gap-2">
                  {!isPremium && (
                    <span className="text-xs px-2 py-1 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      Limited
                    </span>
                  )}
                  <Calendar className="w-5 h-5 text-blue-500" />
                </div>
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-foreground">{totalScheduled}</span>
                <span className="text-sm text-muted-foreground">posts</span>
              </div>
              {!isPremium ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-secondary overflow-hidden border border-border">
                      <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${Math.min((totalScheduled / schedulingLimit) * 100, 100)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {schedulingLimit - totalScheduled > 0 ? `${schedulingLimit - totalScheduled} left` : 'Limit reached'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Max {schedulingLimit} on free plan</p>
                </>
              ) : (
                <p className="text-xs text-emerald-600 font-medium mt-2 flex items-center gap-1">
                  <Crown className="w-3 h-3" />
                  Unlimited scheduling
                </p>
              )}
            </div>
          </div>

          <div className="p-5 bg-card border border-border overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">This Week</span>
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-foreground">{thisWeekPosts}</span>
                <span className="text-sm text-muted-foreground">posts</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Next 7 days</p>
            </div>
          </div>

          <div className="p-5 bg-card border border-border overflow-hidden">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Publishing Soon</span>
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-foreground">{publishingSoonPosts}</span>
                <span className="text-sm text-muted-foreground">posts</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Next 24 hours</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-foreground mb-1">Auto-Publishing Active</h4>
            <p className="text-sm text-muted-foreground">
              Scheduled posts are automatically published to Instagram, TikTok, and YouTube at their scheduled time. YouTube posts require a video file and a fresh YouTube reconnect to grant upload permissions. Failed posts can be retried using the refresh button.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
