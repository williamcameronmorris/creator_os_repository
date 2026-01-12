import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { Calendar, Clock, Instagram, Youtube, Plus, Sparkles, Edit, Trash2, Image as ImageIcon, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { PostComposer } from '../components/PostComposer';

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
  const { darkMode } = useTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [editingPost, setEditingPost] = useState<Post | undefined>();
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'draft'>('all');

  useEffect(() => {
    if (user) {
      loadPosts();
    }
  }, [user]);

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

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Content Schedule
            </h1>
            <p className="text-muted-foreground">
              Manage your scheduled and draft posts
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
