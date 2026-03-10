import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  MessageCircle,
  RefreshCw,
  Instagram,
  Youtube,
  Heart,
  ExternalLink,
  Search,
  CheckCheck,
  Filter,
  ChevronDown,
  Reply,
  Send,
  X,
} from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';

// Threads icon
function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.5 12.068c0-3.512.85-6.367 2.495-8.423C5.845 1.34 8.598.16 12.18.136h.014c2.746.018 5.113.854 6.832 2.417 1.681 1.527 2.604 3.606 2.769 6.18l.004.09h-2.507l-.004-.077c-.133-1.973-.832-3.534-2.083-4.638-1.212-1.069-2.897-1.645-5.01-1.658-2.685.018-4.766.923-6.189 2.694-1.371 1.705-2.064 4.128-2.064 7.199 0 3.077.693 5.499 2.064 7.203 1.423 1.77 3.504 2.676 6.189 2.694 2.11-.014 3.73-.59 4.812-1.71.941-.978 1.428-2.338 1.498-4.155v-.09h-7.34v-2.254h9.79v.09c-.068 2.598-.82 4.65-2.273 6.1-1.51 1.508-3.668 2.285-6.494 2.303z"/>
    </svg>
  );
}

type Platform = 'all' | 'instagram' | 'youtube' | 'threads';
type FilterMode = 'all' | 'unread' | 'unanswered';

interface Comment {
  id: string;
  platform: string;
  post_id: string;
  post_caption: string | null;
  post_thumbnail_url: string | null;
  post_permalink: string | null;
  comment_id: string;
  author_name: string | null;
  author_username: string | null;
  author_avatar_url: string | null;
  text: string;
  likes_count: number;
  is_read: boolean;
  is_replied: boolean;
  reply_text: string | null;
  parent_comment_id: string | null;
  comment_created_at: string | null;
}

const PLATFORM_CONFIG = {
  instagram: {
    label: 'Instagram',
    Icon: Instagram,
    color: 'text-pink-500',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    dot: 'bg-pink-500',
  },
  youtube: {
    label: 'YouTube',
    Icon: Youtube,
    color: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    dot: 'bg-red-500',
  },
  threads: {
    label: 'Threads',
    Icon: ThreadsIcon,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    dot: 'bg-gray-700',
  },
  tiktok: {
    label: 'TikTok',
    Icon: MessageCircle,
    color: 'text-gray-900',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    dot: 'bg-gray-900',
  },
};

export function Inbox() {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [platform, setPlatform] = useState<Platform>('all');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [search, setSearch] = useState('');
  const [selectedComment, setSelectedComment] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replySuccess, setReplySuccess] = useState(false);
  const [counts, setCounts] = useState({ total: 0, unread: 0, unanswered: 0 });

  const loadComments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('comments')
        .select('*')
        .eq('user_id', user.id)
        .order('comment_created_at', { ascending: false })
        .limit(200);

      if (platform !== 'all') query = query.eq('platform', platform);
      if (filterMode === 'unread') query = query.eq('is_read', false);
      if (filterMode === 'unanswered') query = query.eq('is_replied', false).is('parent_comment_id', null);

      const { data } = await query;
      const all = data || [];

      const filtered = search
        ? all.filter(
            (c) =>
              c.text?.toLowerCase().includes(search.toLowerCase()) ||
              c.author_name?.toLowerCase().includes(search.toLowerCase()) ||
              c.author_username?.toLowerCase().includes(search.toLowerCase())
          )
        : all;

      setComments(filtered);

      // Update counts
      const { data: countData } = await supabase
        .from('comments')
        .select('is_read, is_replied, parent_comment_id')
        .eq('user_id', user.id);

      if (countData) {
        setCounts({
          total: countData.length,
          unread: countData.filter((c) => !c.is_read).length,
          unanswered: countData.filter((c) => !c.is_replied && !c.parent_comment_id).length,
        });
      }
    } finally {
      setLoading(false);
    }
  }, [user, platform, filterMode, search]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const syncComments = async () => {
    if (!user || syncing) return;
    setSyncing(true);
    try {
      await supabase.functions.invoke('fetch-comments', {
        body: { userId: user.id },
      });
      await loadComments();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  };

  const markAsRead = async (comment: Comment) => {
    if (comment.is_read) return;
    await supabase.from('comments').update({ is_read: true }).eq('id', comment.id);
    setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, is_read: true } : c)));
    setCounts((prev) => ({ ...prev, unread: Math.max(0, prev.unread - 1) }));
  };

  const markAllRead = async () => {
    if (!user) return;
    await supabase.from('comments').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false);
    setComments((prev) => prev.map((c) => ({ ...c, is_read: true })));
    setCounts((prev) => ({ ...prev, unread: 0 }));
  };

  const openComment = (comment: Comment) => {
    setSelectedComment(comment);
    setReplyText('');
    markAsRead(comment);
  };

  const sendReply = async () => {
    if (!selectedComment || !replyText.trim()) return;
    setSendingReply(true);
    setReplyError(null);
    setReplySuccess(false);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // Call the reply-to-comment edge function — posts live to the platform
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reply-to-comment`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            commentId: selectedComment.comment_id,
            platform: selectedComment.platform,
            replyText: replyText.trim(),
          }),
        }
      );

      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Reply failed');

      // Update local state
      const trimmed = replyText.trim();
      setComments((prev) =>
        prev.map((c) =>
          c.id === selectedComment.id
            ? { ...c, is_replied: true, reply_text: trimmed }
            : c
        )
      );
      setSelectedComment((prev) =>
        prev ? { ...prev, is_replied: true, reply_text: trimmed } : null
      );
      setReplyText('');
      setReplySuccess(true);
      setTimeout(() => setReplySuccess(false), 3000);
    } catch (err: any) {
      setReplyError(err.message || 'Failed to send reply. Please try again.');
    } finally {
      setSendingReply(false);
    }
  };

  const getPlatformConfig = (p: string) =>
    PLATFORM_CONFIG[p as keyof typeof PLATFORM_CONFIG] || PLATFORM_CONFIG.tiktok;

  const platformTabs: { key: Platform; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'instagram', label: 'Instagram' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'threads', label: 'Threads' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Comment Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts.unread > 0 ? (
              <span className="text-primary font-medium">{counts.unread} unread</span>
            ) : (
              'All caught up'
            )}{' '}
            · {counts.total} total comments
          </p>
        </div>
        <div className="flex items-center gap-2">
          {counts.unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-border bg-card hover:bg-accent transition-all"
            >
              <CheckCheck className="w-4 h-4" />
              Mark all read
            </button>
          )}
          <button
            onClick={syncComments}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: counts.total, icon: MessageCircle, color: 'text-primary' },
          { label: 'Unread', value: counts.unread, icon: MessageCircle, color: 'text-amber-500' },
          { label: 'Unanswered', value: counts.unanswered, icon: Reply, color: 'text-blue-500' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left panel: filters + list */}
        <div className="flex-1 min-w-0">
          {/* Platform tabs */}
          <div className="flex gap-1 mb-3 bg-muted p-1 rounded-xl overflow-x-auto">
            {platformTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setPlatform(tab.key)}
                className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  platform === tab.key
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search + filter row */}
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search comments..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div className="relative">
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as FilterMode)}
                className="appearance-none pl-3 pr-8 py-2 rounded-xl border border-border bg-card text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="all">All</option>
                <option value="unread">Unread</option>
                <option value="unanswered">Unanswered</option>
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Comment list */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-center py-16 px-4">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
              <p className="text-muted-foreground font-medium mb-1">No comments found</p>
              <p className="text-sm text-muted-foreground mb-4">
                {counts.total === 0
                  ? 'Hit Sync to pull in comments from your connected platforms.'
                  : 'Try adjusting your filters.'}
              </p>
              {counts.total === 0 && (
                <button
                  onClick={syncComments}
                  disabled={syncing}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                >
                  Sync Now
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              {comments.map((comment) => {
                const config = getPlatformConfig(comment.platform);
                const PlatIcon = config.Icon;
                const isSelected = selectedComment?.id === comment.id;
                const timeAgo = comment.comment_created_at
                  ? formatDistanceToNow(parseISO(comment.comment_created_at), { addSuffix: true })
                  : '';

                return (
                  <button
                    key={comment.id}
                    onClick={() => openComment(comment)}
                    className={`w-full text-left p-3 rounded-xl border transition-all ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : comment.is_read
                        ? 'border-border bg-card hover:bg-accent'
                        : 'border-primary/30 bg-card hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {comment.author_avatar_url ? (
                          <img
                            src={comment.author_avatar_url}
                            alt={comment.author_name || ''}
                            className="w-9 h-9 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                            {(comment.author_name || '?')[0].toUpperCase()}
                          </div>
                        )}
                        <div className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ${config.bg} border border-white flex items-center justify-center`}>
                          <PlatIcon className={`w-2.5 h-2.5 ${config.color}`} />
                        </div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {comment.author_name || comment.author_username || 'Unknown'}
                          </span>
                          {!comment.is_read && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                          )}
                          {comment.is_replied && (
                            <span className="text-xs text-emerald-600 font-medium flex-shrink-0">Replied</span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">{timeAgo}</span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{comment.text}</p>
                        {comment.likes_count > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <Heart className="w-3 h-3 text-pink-500" />
                            <span className="text-xs text-muted-foreground">{comment.likes_count}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right panel: comment detail */}
        <div className="lg:w-96 flex-shrink-0">
          {selectedComment ? (
            <div className="sticky top-24 p-5 rounded-xl bg-card border border-border space-y-4">
              {/* Close button */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Comment Detail</span>
                <button
                  onClick={() => setSelectedComment(null)}
                  className="p-1 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Post context */}
              {selectedComment.post_thumbnail_url && (
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted">
                  <img
                    src={selectedComment.post_thumbnail_url}
                    alt="Post"
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Original post</p>
                    <p className="text-sm text-foreground line-clamp-3">
                      {selectedComment.post_caption || 'No caption'}
                    </p>
                    {selectedComment.post_permalink && (
                      <a
                        href={selectedComment.post_permalink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                      >
                        View post <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Author */}
              <div className="flex items-center gap-3">
                {selectedComment.author_avatar_url ? (
                  <img
                    src={selectedComment.author_avatar_url}
                    alt={selectedComment.author_name || ''}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
                    {(selectedComment.author_name || '?')[0].toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="font-semibold text-foreground text-sm">{selectedComment.author_name}</p>
                  {selectedComment.author_username && (
                    <p className="text-xs text-muted-foreground">@{selectedComment.author_username}</p>
                  )}
                </div>
                <div className="ml-auto">
                  {selectedComment.likes_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Heart className="w-4 h-4 text-pink-500" />
                      <span className="text-sm text-muted-foreground">{selectedComment.likes_count}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Comment text */}
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm text-foreground leading-relaxed">{selectedComment.text}</p>
              </div>

              {/* Previous reply */}
              {selectedComment.is_replied && selectedComment.reply_text && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-xs font-semibold text-emerald-700 mb-1">Your reply</p>
                  <p className="text-sm text-emerald-800">{selectedComment.reply_text}</p>
                </div>
              )}

              {/* Reply box */}
              <div className="space-y-2">
                <textarea
                  value={replyText}
                  onChange={(e) => { setReplyText(e.target.value); setReplyError(null); }}
                  placeholder="Write a reply..."
                  rows={3}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />

                {replyError && (
                  <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{replyError}</p>
                )}
                {replySuccess && (
                  <p className="text-xs text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                    Reply posted live to {selectedComment.platform}!
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={sendReply}
                    disabled={!replyText.trim() || sendingReply}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-40"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {sendingReply ? 'Posting...' : selectedComment.is_replied ? 'Reply Again' : 'Post Reply'}
                  </button>
                  <p className="text-xs text-muted-foreground">Posts live to {selectedComment.platform}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="sticky top-24 p-8 rounded-xl bg-card border border-border text-center">
              <MessageCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Select a comment to view details and draft a reply</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
