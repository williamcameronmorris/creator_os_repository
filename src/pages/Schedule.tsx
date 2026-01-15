import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, Instagram, Youtube, Plus, Sparkles, Edit, Trash2, DollarSign, Lightbulb, Type, Hash, BarChart3, Bot, ArrowRight, Info, Zap, TrendingUp, Cpu } from 'lucide-react';
import { format } from 'date-fns';
import { PostComposer } from '../components/PostComposer';
import { AnalyticsCTABanner } from '../components/AnalyticsCTABanner';
import { useNavigate } from 'react-router-dom';
import { getAIQuota, formatResetTime, type AIQuotaInfo } from '../lib/aiQuota';

interface Post {
  id: string;
  platform: string;
  caption: string;
  media_urls: string[];
  scheduled_date: string | null;
  status: string;
  deal_id?: string | null;
  is_sponsored?: boolean;
}

export function Schedule() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | undefined>();
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'draft'>('all');
  const [aiQuota, setAiQuota] = useState<AIQuotaInfo | null>(null);

  useEffect(() => {
    if (user) {
      loadPosts();
      loadAIQuota();
    }
  }, [user]);

  const loadAIQuota = async () => {
    if (!user) return;
    const quota = await getAIQuota(user.id);
    setAiQuota(quota);
  };

  const loadPosts = async () => {
    if (!user) return;

    const query = supabase
      .from('content_posts')
      .select('*')
      .eq('user_id', user.id)
      .in('status', ['scheduled', 'draft']);

    if (filter !== 'all') {
      query.eq('status', filter);
    }

    const { data, error } = await query.order('scheduled_date', { ascending: true, nullsFirst: false });

    if (!error && data) {
      setPosts(data);
    }
    setLoading(false);
  };

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return;

    const { error } = await supabase
      .from('content_posts')
      .delete()
      .eq('id', postId);

    if (!error) {
      loadPosts();
    }
  };

  const handleEdit = (post: Post) => {
    setEditingPost(post);
    setShowComposer(true);
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return Instagram;
      case 'youtube':
        return Youtube;
      case 'tiktok':
        return Sparkles;
      default:
        return Calendar;
    }
  };

  const filteredPosts = posts.filter(post => {
    if (filter === 'all') return true;
    return post.status === filter;
  });

  const scheduledPosts = posts.filter(post => post.status === 'scheduled');
  const totalScheduled = scheduledPosts.length;
  const freeLimit = 5;

  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const thisWeekPosts = scheduledPosts.filter(post => {
    if (!post.scheduled_date) return false;
    const postDate = new Date(post.scheduled_date);
    return postDate >= now && postDate <= next7Days;
  }).length;

  const publishingSoonPosts = scheduledPosts.filter(post => {
    if (!post.scheduled_date) return false;
    const postDate = new Date(post.scheduled_date);
    return postDate >= now && postDate <= next24Hours;
  }).length;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              The Studio
            </h1>
            <p className="text-muted-foreground">
              AI-powered tools for content creation and scheduling
            </p>
          </div>
          <button
            onClick={() => {
              setEditingPost(undefined);
              setShowComposer(true);
            }}
            className="flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            New Post
          </button>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">AI Tools</h2>
            <p className="text-muted-foreground">Supercharge your content with AI-powered tools</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button
            onClick={() => setShowComposer(true)}
            className="group relative p-6 rounded-2xl bg-slate-950 dark:bg-slate-950 border border-slate-800 hover:border-blue-500/50 transition-all hover:shadow-xl text-left overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-blue-500 mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <Lightbulb className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Content Ideas Generator</h3>
              <p className="text-sm text-slate-400 mb-4">
                Generate fresh ideas based on your niche and trending topics
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-blue-400">
                <Sparkles className="w-4 h-4" />
                <span>Generate Ideas</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowComposer(true)}
            className="group relative p-6 rounded-2xl bg-slate-950 dark:bg-slate-950 border border-slate-800 hover:border-purple-500/50 transition-all hover:shadow-xl text-left overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500 mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <Type className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Caption Optimizer</h3>
              <p className="text-sm text-slate-400 mb-4">
                AI-powered caption suggestions and tone adjustments
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-purple-400">
                <Sparkles className="w-4 h-4" />
                <span>Optimize Caption</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowComposer(true)}
            className="group relative p-6 rounded-2xl bg-slate-950 dark:bg-slate-950 border border-slate-800 hover:border-emerald-500/50 transition-all hover:shadow-xl text-left overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <Hash className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Hashtag Generator</h3>
              <p className="text-sm text-slate-400 mb-4">
                Relevant hashtag recommendations to boost your reach
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
                <Sparkles className="w-4 h-4" />
                <span>Generate Hashtags</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => navigate('/analytics')}
            className="group relative p-6 rounded-2xl bg-slate-950 dark:bg-slate-950 border border-slate-800 hover:border-orange-500/50 transition-all hover:shadow-xl text-left overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500 mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Best Time to Post</h3>
              <p className="text-sm text-slate-400 mb-4">
                AI predicts optimal posting times based on your audience
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-orange-400">
                <Sparkles className="w-4 h-4" />
                <span>Find Best Time</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => setShowComposer(true)}
            className="group relative p-6 rounded-2xl bg-slate-950 dark:bg-slate-950 border border-slate-800 hover:border-rose-500/50 transition-all hover:shadow-xl text-left overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500 mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <BarChart3 className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Performance Score</h3>
              <p className="text-sm text-slate-400 mb-4">
                Performance prediction for drafts before publishing
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-rose-400">
                <Sparkles className="w-4 h-4" />
                <span>Predict Performance</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>

          <button
            onClick={() => navigate('/settings')}
            className="group relative p-6 rounded-2xl bg-slate-950 dark:bg-slate-950 border border-slate-800 hover:border-violet-500/50 transition-all hover:shadow-xl text-left overflow-hidden"
          >
            <div className="relative z-10">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-violet-500 mb-4 group-hover:scale-110 transition-transform shadow-lg">
                <Bot className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">AI Community Manager</h3>
              <p className="text-sm text-slate-400 mb-4">
                AI bot to engage with comments automatically
              </p>
              <div className="flex items-center gap-2 text-sm font-semibold text-violet-400">
                <Sparkles className="w-4 h-4" />
                <span>Setup Auto-Reply</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </button>
        </div>
      </div>

      {aiQuota && (
        <div className="mb-8">
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-violet-500/10 via-purple-500/10 to-fuchsia-500/10 border-2 border-violet-500/20 shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/20 rounded-full blur-3xl"></div>
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-fuchsia-500/20 rounded-full blur-3xl"></div>

            <div className="relative z-10">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg">
                    <Cpu className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-foreground mb-1">AI Request Quota</h3>
                    <p className="text-sm text-muted-foreground">Free tier daily usage</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-foreground mb-1">
                    {aiQuota.requestsRemaining}
                    <span className="text-sm font-normal text-muted-foreground ml-1">remaining</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {formatResetTime(aiQuota.resetAt)}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Usage today</span>
                  <span className="font-semibold text-foreground">
                    {aiQuota.requestsUsed} / {aiQuota.dailyLimit} requests
                  </span>
                </div>

                <div className="relative">
                  <div className="h-3 bg-secondary/50 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-500 ${
                        aiQuota.requestsRemaining === 0
                          ? 'bg-gradient-to-r from-red-500 to-rose-500'
                          : aiQuota.requestsRemaining <= 3
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500'
                          : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                      }`}
                      style={{ width: `${(aiQuota.requestsUsed / aiQuota.dailyLimit) * 100}%` }}
                    ></div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-foreground drop-shadow-lg">
                      {Math.round((aiQuota.requestsUsed / aiQuota.dailyLimit) * 100)}%
                    </span>
                  </div>
                </div>

                {aiQuota.requestsRemaining === 0 ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                    <Info className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-600 dark:text-red-400">
                      <span className="font-semibold">Daily limit reached.</span> Your quota will reset {formatResetTime(aiQuota.resetAt).toLowerCase()}. Upgrade to Pro for unlimited AI requests.
                    </div>
                  </div>
                ) : aiQuota.requestsRemaining <= 3 ? (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-amber-600 dark:text-amber-400">
                      <span className="font-semibold">Running low on AI requests.</span> Consider upgrading to Pro for unlimited access to all AI features.
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-6">Content Scheduling Stats</h2>

        <div className="grid md:grid-cols-3 gap-4 mb-6">
          <div className="relative p-6 rounded-xl bg-card border border-border shadow-md overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-muted-foreground">Total Scheduled</span>
                <Calendar className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-bold text-foreground">{totalScheduled}</span>
                <span className="text-sm text-muted-foreground">posts</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all duration-500"
                    style={{ width: `${Math.min((totalScheduled / freeLimit) * 100, 100)}%` }}
                  ></div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {freeLimit - totalScheduled > 0 ? `${freeLimit - totalScheduled} left` : 'Limit reached'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">Max {freeLimit} on free plan</p>
            </div>
          </div>

          <div className="relative p-6 rounded-xl bg-card border border-border shadow-md overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
            <div className="relative z-10">
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

          <div className="relative p-6 rounded-xl bg-card border border-border shadow-md overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl"></div>
            <div className="relative z-10">
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

        <div className="relative p-8 rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-pink-500/20 border border-blue-500/30 shadow-xl overflow-hidden mb-6">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10 backdrop-blur-3xl"></div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl"></div>

          <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 shadow-lg">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">Stay Consistent With Scheduling</h3>
              </div>
              <p className="text-muted-foreground mb-4">
                Keep your audience engaged by maintaining a regular posting schedule. Plan your content ahead and never miss a post.
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="w-4 h-4" />
                <span>Schedule up to {freeLimit} posts on the free plan</span>
              </div>
            </div>
            <button
              onClick={() => {
                setEditingPost(undefined);
                setShowComposer(true);
              }}
              className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white rounded-xl font-semibold transition-all shadow-lg hover:shadow-xl hover:scale-105"
            >
              <Plus className="w-5 h-5" />
              Schedule Post
            </button>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-foreground mb-1">Manual Publishing Note</h4>
            <p className="text-sm text-muted-foreground">
              Posts are currently scheduled for manual publishing. Auto-posting integration with Instagram, TikTok, and YouTube is coming soon. You'll receive notifications when it's time to publish your scheduled content.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold text-foreground mb-4">Content Schedule</h2>
        <p className="text-muted-foreground mb-6">Manage your scheduled and draft posts</p>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm ${
              filter === 'all'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm ${
              filter === 'scheduled'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Scheduled
          </button>
          <button
            onClick={() => setFilter('draft')}
            className={`px-4 py-2 rounded-xl font-medium transition-colors shadow-sm ${
              filter === 'draft'
                ? 'bg-primary text-primary-foreground'
                : 'bg-card border border-border text-muted-foreground hover:bg-accent hover:text-foreground'
            }`}
          >
            Drafts
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-8 rounded-xl text-center bg-card border border-border">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="p-12 rounded-xl text-center bg-card border border-border shadow-md">
          <Calendar className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-bold mb-2 text-foreground">
            {filter === 'all' ? 'No posts yet' : filter === 'scheduled' ? 'No scheduled posts' : 'No drafts'}
          </h3>
          <p className="mb-6 text-muted-foreground">
            Create your first post to get started with content scheduling
          </p>
          <button
            onClick={() => {
              setEditingPost(undefined);
              setShowComposer(true);
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium transition-colors shadow-md"
          >
            <Plus className="w-5 h-5" />
            Create Post
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredPosts.map((post) => {
            const Icon = getPlatformIcon(post.platform);
            return (
              <div
                key={post.id}
                className={`p-6 rounded-xl relative bg-card border border-border shadow-md hover:shadow-lg transition-shadow ${
                  post.is_sponsored ? 'border-l-4 border-l-amber-500' : ''
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-chart-1/20 flex-shrink-0">
                    <Icon className="w-6 h-6 text-chart-1" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-foreground">
                        {post.platform.charAt(0).toUpperCase() + post.platform.slice(1)} Post
                      </h3>
                      {post.is_sponsored && (
                        <span className="flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold">
                          <DollarSign className="w-3 h-3" />
                          Sponsored
                        </span>
                      )}
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        post.status === 'scheduled'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                      }`}>
                        {post.status}
                      </span>
                    </div>

                    <p className="text-sm mb-3 line-clamp-2 text-muted-foreground">
                      {post.caption || 'No caption'}
                    </p>

                    {post.media_urls && post.media_urls.length > 0 && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className="flex -space-x-2">
                          {post.media_urls.slice(0, 3).map((url, idx) => (
                            <div
                              key={idx}
                              className="w-10 h-10 rounded-lg border-2 border-card overflow-hidden"
                            >
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {post.media_urls.length} {post.media_urls.length === 1 ? 'file' : 'files'}
                        </span>
                      </div>
                    )}

                    {post.scheduled_date && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        {format(new Date(post.scheduled_date), 'MMM d, yyyy h:mm a')}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(post)}
                      className="p-2 rounded-lg transition-colors hover:bg-accent"
                    >
                      <Edit className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </button>
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="p-2 rounded-lg transition-colors hover:bg-accent"
                    >
                      <Trash2 className="w-5 h-5 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredPosts.length > 0 && (
        <div className="mt-12">
          <AnalyticsCTABanner />
        </div>
      )}

      {showComposer && (
        <PostComposer
          onClose={() => {
            setShowComposer(false);
            setEditingPost(undefined);
          }}
          onSuccess={() => {
            loadPosts();
          }}
          editPost={editingPost}
        />
      )}
    </div>
  );
}
