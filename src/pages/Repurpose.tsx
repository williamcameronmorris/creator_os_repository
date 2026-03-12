import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Repeat2,
  Copy,
  Check,
  Loader2,
  RefreshCw,
  Instagram,
  Youtube,
  Hash,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Send,
} from 'lucide-react';
import { ThreadsIcon } from '../components/icons/ThreadsIcon';


// ── Icons ──────────────────────────────────────────────────────────────────────

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.32 6.32 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.83a8.16 8.16 0 004.77 1.52V6.9a4.85 4.85 0 01-1-.21z" />
    </svg>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────────

const PLATFORM_CONFIG: Record<string, {
  label: string;
  icon: React.FC<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  textColor: string;
}> = {
  instagram: {
    label: 'Instagram',
    icon: Instagram,
    color: 'from-pink-500 to-orange-400',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    textColor: 'text-pink-600',
  },
  tiktok: {
    label: 'TikTok',
    icon: TikTokIcon,
    color: 'from-gray-900 to-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    textColor: 'text-gray-700',
  },
  youtube: {
    label: 'YouTube',
    icon: Youtube,
    color: 'from-red-600 to-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    textColor: 'text-red-600',
  },
  threads: {
    label: 'Threads',
    icon: ThreadsIcon,
    color: 'from-gray-800 to-gray-900',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    textColor: 'text-gray-800',
  },
};

const ALL_PLATFORMS = ['instagram', 'tiktok', 'youtube', 'threads'];

interface ContentPost {
  id: string;
  platform: string;
  caption: string | null;
  thumbnail_url: string | null;
  media_type: string | null;
  published_date: string | null;
  likes: number;
  comments: number;
}

interface RepurposeResult {
  caption: string;
  hashtags: string[];
  tips: string[];
}

// ── Helper ─────────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function Repurpose() {
  const { user } = useAuth();

  // Posts
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [selectedPost, setSelectedPost] = useState<ContentPost | null>(null);

  // Repurpose config
  const [targetPlatforms, setTargetPlatforms] = useState<string[]>(['instagram', 'tiktok', 'youtube', 'threads']);
  const [customCaption, setCustomCaption] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  // Results
  const [results, setResults] = useState<Record<string, RepurposeResult> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (user) loadPosts();
  }, [user]);

  const loadPosts = async () => {
    setLoadingPosts(true);
    const { data } = await supabase
      .from('content_posts')
      .select('id, platform, caption, thumbnail_url, media_type, published_date, likes, comments')
      .eq('user_id', user!.id)
      .not('caption', 'is', null)
      .order('published_date', { ascending: false })
      .limit(50);
    setPosts((data as ContentPost[]) || []);
    setLoadingPosts(false);
  };

  const togglePlatform = (p: string) => {
    setTargetPlatforms(prev =>
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  const selectPost = (post: ContentPost) => {
    setSelectedPost(post);
    setCustomCaption(post.caption || '');
    setResults(null);
    setError(null);
  };

  const runRepurpose = async () => {
    if (!user || !selectedPost) return;
    const caption = useCustom ? customCaption : (selectedPost.caption || '');
    if (!caption.trim()) {
      setError('No caption to repurpose.');
      return;
    }
    const targets = targetPlatforms.filter(p => p !== selectedPost.platform);
    if (targets.length === 0) {
      setError('Select at least one target platform different from the source.');
      return;
    }

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/repurpose-content`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            userId: user.id,
            postId: selectedPost.id,
            sourcePlatform: selectedPost.platform,
            targetPlatforms: targets,
            originalCaption: caption,
            mediaType: selectedPost.media_type,
          }),
        }
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Repurpose failed');
      setResults(json.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const copyFull = (platform: string, result: RepurposeResult) => {
    const hashtags = result.hashtags.map(h => `#${h}`).join(' ');
    const full = hashtags ? `${result.caption}\n\n${hashtags}` : result.caption;
    copyToClipboard(full, `full-${platform}`);
  };

  const toggleTips = (platform: string) =>
    setExpandedTips(prev => ({ ...prev, [platform]: !prev[platform] }));

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-2xl bg-violet-100 flex items-center justify-center">
            <Repeat2 className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Repurpose Content</h1>
            <p className="text-sm text-gray-500">Adapt any post for every platform in seconds</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Left: Post selector ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-bold text-gray-900 text-sm">Select a Post</h2>
              <button
                onClick={loadPosts}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {loadingPosts ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : posts.length === 0 ? (
              <div className="text-center py-16 px-6">
                <Repeat2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No published posts found.</p>
                <p className="text-xs text-gray-400 mt-1">Sync your accounts to load posts.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
                {posts.map(post => {
                  const cfg = PLATFORM_CONFIG[post.platform];
                  const PlatformIcon = cfg?.icon;
                  const isSelected = selectedPost?.id === post.id;
                  return (
                    <button
                      key={post.id}
                      onClick={() => selectPost(post)}
                      className={`w-full text-left px-4 py-3 flex gap-3 transition-colors hover:bg-gray-50 ${
                        isSelected ? 'bg-violet-50 border-l-2 border-violet-500' : ''
                      }`}
                    >
                      {/* Thumbnail */}
                      <div className="relative flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-gray-100">
                        {post.thumbnail_url ? (
                          <img
                            src={post.thumbnail_url}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div className={`w-full h-full bg-gradient-to-br ${cfg?.color || 'from-gray-200 to-gray-300'}`} />
                        )}
                        {PlatformIcon && (
                          <div className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <PlatformIcon className={`w-2.5 h-2.5 ${cfg?.textColor || 'text-gray-600'}`} />
                          </div>
                        )}
                      </div>

                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-800 line-clamp-2 leading-relaxed">
                          {post.caption || '(no caption)'}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-semibold capitalize ${cfg?.textColor || 'text-gray-500'}`}>
                            {post.platform}
                          </span>
                          {post.published_date && (
                            <span className="text-[10px] text-gray-400">{timeAgo(post.published_date)}</span>
                          )}
                          <span className="text-[10px] text-gray-400">
                            {(post.likes || 0) + (post.comments || 0)} interactions
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Config + Results ── */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedPost ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center h-64">
              <div className="text-center">
                <Repeat2 className="w-12 h-12 text-gray-200 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-400">Select a post to get started</p>
              </div>
            </div>
          ) : (
            <>
              {/* Config card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-5">
                {/* Source post preview */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Source Post</p>
                  <div className="flex gap-3 items-start p-3 bg-gray-50 rounded-xl">
                    {selectedPost.thumbnail_url && (
                      <img
                        src={selectedPost.thumbnail_url}
                        alt=""
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {(() => {
                          const cfg = PLATFORM_CONFIG[selectedPost.platform];
                          const Icon = cfg?.icon;
                          return Icon ? <Icon className={`w-3.5 h-3.5 ${cfg.textColor}`} /> : null;
                        })()}
                        <span className="text-xs font-semibold text-gray-600 capitalize">
                          {selectedPost.platform}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 line-clamp-2">{selectedPost.caption}</p>
                    </div>
                  </div>
                </div>

                {/* Caption override */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Caption to Repurpose</p>
                    <button
                      onClick={() => setUseCustom(!useCustom)}
                      className={`text-xs font-semibold transition-colors ${useCustom ? 'text-violet-600' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {useCustom ? 'Using custom' : 'Edit caption'}
                    </button>
                  </div>
                  {useCustom ? (
                    <textarea
                      value={customCaption}
                      onChange={e => setCustomCaption(e.target.value)}
                      rows={4}
                      className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-violet-300"
                      placeholder="Enter or edit the caption to repurpose..."
                    />
                  ) : (
                    <p className="text-xs text-gray-600 bg-gray-50 rounded-xl p-3 line-clamp-3">
                      {selectedPost.caption}
                    </p>
                  )}
                </div>

                {/* Target platforms */}
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Target Platforms</p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PLATFORMS.map(p => {
                      const cfg = PLATFORM_CONFIG[p];
                      const Icon = cfg.icon;
                      const isSource = p === selectedPost.platform;
                      const isSelected = targetPlatforms.includes(p);
                      return (
                        <button
                          key={p}
                          onClick={() => !isSource && togglePlatform(p)}
                          disabled={isSource}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                            isSource
                              ? 'opacity-40 cursor-not-allowed bg-gray-100 border-gray-200 text-gray-400'
                              : isSelected
                              ? `${cfg.bg} ${cfg.border} ${cfg.textColor}`
                              : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                          }`}
                        >
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                          {isSource && <span className="text-[9px] ml-0.5">(source)</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{error}</p>
                )}

                <button
                  onClick={runRepurpose}
                  disabled={loading || targetPlatforms.filter(p => p !== selectedPost.platform).length === 0}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-violet-200 text-white text-sm font-bold transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Repurposing with AI...
                    </>
                  ) : (
                    <>
                      <Repeat2 className="w-4 h-4" />
                      Repurpose Content
                    </>
                  )}
                </button>
              </div>

              {/* Results */}
              {results && (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider px-1">
                    AI-Adapted Versions
                  </p>
                  {Object.entries(results).map(([platform, result]) => {
                    const cfg = PLATFORM_CONFIG[platform];
                    if (!cfg) return null;
                    const Icon = cfg.icon;
                    const tipsOpen = expandedTips[platform];
                    const fullText = result.hashtags.length > 0
                      ? `${result.caption}\n\n${result.hashtags.map(h => `#${h}`).join(' ')}`
                      : result.caption;

                    return (
                      <div
                        key={platform}
                        className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${cfg.border}`}
                      >
                        {/* Platform header */}
                        <div className={`px-5 py-3 flex items-center justify-between ${cfg.bg}`}>
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${cfg.textColor}`} />
                            <span className={`text-sm font-bold ${cfg.textColor}`}>{cfg.label}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyFull(platform, result)}
                              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                                copiedKey === `full-${platform}`
                                  ? 'bg-green-100 text-green-600'
                                  : `bg-white ${cfg.textColor} hover:opacity-80`
                              } border ${cfg.border}`}
                            >
                              {copiedKey === `full-${platform}` ? (
                                <><Check className="w-3 h-3" /> Copied!</>
                              ) : (
                                <><Copy className="w-3 h-3" /> Copy All</>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="p-5 space-y-4">
                          {/* Caption */}
                          <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Caption</p>
                            <div className="relative group">
                              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed bg-gray-50 rounded-xl p-4 pr-10">
                                {result.caption}
                              </p>
                              <button
                                onClick={() => copyToClipboard(result.caption, `caption-${platform}`)}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-white border border-gray-200 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-gray-700"
                              >
                                {copiedKey === `caption-${platform}` ? (
                                  <Check className="w-3 h-3 text-green-500" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </div>

                          {/* Hashtags */}
                          {result.hashtags.length > 0 && (
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                  <Hash className="w-3 h-3" />
                                  Hashtags
                                </p>
                                <button
                                  onClick={() => copyToClipboard(result.hashtags.map(h => `#${h}`).join(' '), `hashtags-${platform}`)}
                                  className={`text-xs font-semibold flex items-center gap-1 transition-colors ${
                                    copiedKey === `hashtags-${platform}` ? 'text-green-500' : `${cfg.textColor} hover:opacity-70`
                                  }`}
                                >
                                  {copiedKey === `hashtags-${platform}` ? (
                                    <><Check className="w-3 h-3" /> Copied</>
                                  ) : (
                                    <><Copy className="w-3 h-3" /> Copy</>
                                  )}
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {result.hashtags.map((tag, i) => (
                                  <span
                                    key={i}
                                    className={`text-xs px-2.5 py-1 rounded-full font-medium ${cfg.bg} ${cfg.textColor}`}
                                  >
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Tips (collapsible) */}
                          {result.tips.length > 0 && (
                            <div>
                              <button
                                onClick={() => toggleTips(platform)}
                                className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors w-full"
                              >
                                <Lightbulb className="w-3.5 h-3.5" />
                                Platform Tips
                                {tipsOpen ? (
                                  <ChevronUp className="w-3 h-3 ml-auto" />
                                ) : (
                                  <ChevronDown className="w-3 h-3 ml-auto" />
                                )}
                              </button>
                              {tipsOpen && (
                                <ul className="mt-2 space-y-1.5">
                                  {result.tips.map((tip, i) => (
                                    <li key={i} className="flex items-start gap-2 text-xs text-gray-600">
                                      <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.textColor} bg-current`} />
                                      {tip}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          )}

                          {/* Send to scheduler */}
                          <button
                            onClick={() => {
                              // Encode caption and platform into scheduler URL for future use
                              const params = new URLSearchParams({
                                platform,
                                caption: result.caption,
                                hashtags: result.hashtags.join(','),
                              });
                              window.location.href = `/schedule/new?${params.toString()}`;
                            }}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-gray-400 hover:border-violet-300 hover:text-violet-600 text-xs font-semibold transition-all"
                          >
                            <Send className="w-3.5 h-3.5" />
                            Send to Scheduler
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
