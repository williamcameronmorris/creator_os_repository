import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageCircle, Share2, Pin, ExternalLink, Clock } from 'lucide-react';

interface LiveMetrics {
  views: number;
  likes: number;
  comments: number;
  engagementRate: number;
}

function buildPostUrl(platform: string, post: Record<string, any>): string | null {
  if (platform === 'instagram' && post.instagram_post_id) {
    return `https://www.instagram.com/p/${post.instagram_post_id}/`;
  }
  if (platform === 'tiktok' && post.tiktok_post_id) {
    return `https://www.tiktok.com/@me/video/${post.tiktok_post_id}`;
  }
  if (platform === 'youtube' && post.youtube_video_id) {
    return `https://www.youtube.com/watch?v=${post.youtube_video_id}`;
  }
  return null;
}

interface EngagementStageProps {
  workflowId: string;
  contentType: string;
  onComplete: () => void;
}

export function EngagementStage({ workflowId, contentType: _contentType, onComplete }: EngagementStageProps) {
  const [loading, setLoading] = useState(false);
  const [postUrl, setPostUrl] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>('instagram');
  const [checklist, setChecklist] = useState<{id: string, label: string, icon: any, checked: boolean}[]>([]);
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics | null>(null);

  const getChecklist = (plat: string) => {
    switch (plat) {
      case 'youtube':
        return [
          { id: 'watch', label: 'Watch full video (verify upload quality)', icon: <Share2 className="w-4 h-4" /> },
          { id: 'pin', label: 'Pin a comment with a question/CTA', icon: <Pin className="w-4 h-4" /> },
          { id: 'community', label: 'Share to Community tab', icon: <MessageCircle className="w-4 h-4" /> },
          { id: 'reply', label: 'Reply to first 5 comments', icon: <MessageCircle className="w-4 h-4" /> }
        ];
      case 'tiktok':
        return [
          { id: 'story', label: 'Share video to TikTok Story', icon: <Share2 className="w-4 h-4" /> },
          { id: 'comment', label: 'Post a comment with extra context', icon: <MessageCircle className="w-4 h-4" /> },
          { id: 'repost', label: 'Ask friends to Repost', icon: <Share2 className="w-4 h-4" /> }
        ];
      default:
        return [
          { id: 'story', label: 'Share post to Story with "New Post" sticker', icon: <Share2 className="w-4 h-4" /> },
          { id: 'link', label: 'Add "Link in Bio" if applicable', icon: <ExternalLink className="w-4 h-4" /> },
          { id: 'pin', label: 'Pin your own comment with CTA', icon: <Pin className="w-4 h-4" /> },
          { id: 'reply', label: 'Reply to comments immediately', icon: <MessageCircle className="w-4 h-4" /> }
        ];
    }
  };

  useEffect(() => {
    loadWorkflowData();
  }, [workflowId]);

  const loadWorkflowData = async () => {
    setLoading(true);
    const { data: workflow } = await supabase
      .from('content_workflow_stages')
      .select('platform, published_post_id, engagement_notes')
      .eq('id', workflowId)
      .maybeSingle();

    if (workflow) {
      const plat = workflow.platform || 'instagram';
      setPlatform(plat);

      const defaults = getChecklist(plat).map(i => ({...i, checked: false}));

      if (workflow.engagement_notes) {
        try {
          const saved = typeof workflow.engagement_notes === 'string'
            ? JSON.parse(workflow.engagement_notes)
            : workflow.engagement_notes;
          if (saved?.checklist) {
            setChecklist(defaults.map(d => {
              const found = saved.checklist.find((s: any) => s.id === d.id);
              return found ? { ...d, checked: found.checked } : d;
            }));
          } else {
            setChecklist(defaults);
          }
        } catch {
          setChecklist(defaults);
        }
      } else {
        setChecklist(defaults);
      }

      if (workflow.published_post_id) {
        const { data: post } = await supabase
          .from('content_posts')
          .select('instagram_post_id, tiktok_post_id, youtube_video_id, views, likes, comments, engagement_rate, platform')
          .eq('id', workflow.published_post_id)
          .maybeSingle();

        if (post) {
          const url = buildPostUrl(plat, post);
          if (url) setPostUrl(url);

          if (post.views || post.likes) {
            setLiveMetrics({
              views: post.views || 0,
              likes: post.likes || 0,
              comments: post.comments || 0,
              engagementRate: Number(post.engagement_rate) || 0,
            });
          }
        }
      }
    }
    setLoading(false);
  };

  const toggleItem = async (id: string) => {
    const updated = checklist.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    );
    const previous = checklist;
    setChecklist(updated);

    const { error } = await supabase
      .from('content_workflow_stages')
      .update({
        engagement_notes: JSON.stringify({ checklist: updated }),
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);
    // Revert the optimistic toggle if the save didn't persist.
    if (error) setChecklist(previous);
  };

  const handleFinish = async () => {
    setLoading(true);
    await supabase
      .from('content_workflow_stages')
      .update({
        current_stage: 'analysis',
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);

    onComplete();
    setLoading(false);
  };

  const checkedCount = checklist.filter(i => i.checked).length;
  const progress = checklist.length > 0 ? Math.round((checkedCount / checklist.length) * 100) : 0;
  const allDone = checklist.length > 0 && checkedCount === checklist.length;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 border border-border flex items-center justify-center">
            <Clock className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
              The Golden Hour
            </h2>
            <p className="t-body">Algorithms boost content that gets engagement in the first 60 minutes. Complete this checklist to maximize reach.</p>
          </div>
        </div>
      </div>

      {liveMetrics && (liveMetrics.views > 0 || liveMetrics.likes > 0) && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Views', value: liveMetrics.views.toLocaleString() },
            { label: 'Likes', value: liveMetrics.likes.toLocaleString() },
            { label: 'Engagement', value: `${liveMetrics.engagementRate.toFixed(1)}%` },
          ].map((m) => (
            <div key={m.label} className="bg-card border border-border p-4 text-center">
              <p className="t-micro text-muted-foreground mb-1">{m.label}</p>
              <p className="text-foreground" style={{ fontSize: '1.25rem', fontWeight: 500, letterSpacing: '-0.01em' }}>{m.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-card border border-border">
        <div className="h-px bg-foreground/10 relative">
          <div className="absolute inset-y-0 left-0 bg-accent transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="t-micro text-foreground">
              <span className="capitalize">{platform}</span> checklist
            </h3>
            {postUrl && (
              <a href={postUrl} target="_blank" rel="noreferrer" className="t-micro text-accent hover:underline inline-flex items-center gap-1">
                Go to post <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="divide-y divide-border border-t border-b border-border">
            {checklist.map((item) => (
              <label key={item.id} className="flex items-center gap-3 py-3 cursor-pointer group">
                <input
                  type="checkbox"
                  className="hidden"
                  checked={item.checked}
                  onChange={() => toggleItem(item.id)}
                />
                <div className={`w-5 h-5 border flex items-center justify-center transition-colors ${
                  item.checked ? 'border-accent bg-accent' : 'border-border group-hover:border-foreground'
                }`}>
                  {item.checked && (
                    <svg viewBox="0 0 16 16" className="w-3 h-3 text-accent-foreground" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 8.5L6.5 12L13 4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <div className={`w-7 h-7 border border-border flex items-center justify-center flex-shrink-0 ${item.checked ? 'text-accent border-accent' : 'text-foreground'}`}>
                  {item.icon}
                </div>
                <span className={`text-sm ${item.checked ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{item.label}</span>
              </label>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleFinish}
              disabled={loading}
              className="btn-ie btn-ie-solid disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="btn-ie-text">{allDone ? 'Golden hour complete' : 'Finish engagement'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
