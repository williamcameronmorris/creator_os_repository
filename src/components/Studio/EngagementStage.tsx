import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageCircle, Share2, Pin, Heart, CheckCircle2, ExternalLink, Clock, Eye, ThumbsUp, BarChart2 } from 'lucide-react';

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

export function EngagementStage({ workflowId, contentType, onComplete }: EngagementStageProps) {
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
          { id: 'community', label: 'Share to Community Tab', icon: <MessageCircle className="w-4 h-4" /> },
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

      // Pull real post data if available
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
    setChecklist(updated);

    await supabase
      .from('content_workflow_stages')
      .update({
        engagement_notes: JSON.stringify({ checklist: updated }),
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);
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

  const progress = Math.round((checklist.filter(i => i.checked).length / checklist.length) * 100);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-amber-100 text-amber-600 rounded-full mb-4 ring-4 ring-amber-50">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900">The Golden Hour</h2>
        <p className="text-gray-500 max-w-md mx-auto mt-2">
          Algorithms boost content that gets engagement in the first 60 minutes. Complete this checklist to maximize reach.
        </p>
      </div>

      {liveMetrics && (liveMetrics.views > 0 || liveMetrics.likes > 0) && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <Eye className="w-4 h-4 text-gray-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{liveMetrics.views.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Views</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <ThumbsUp className="w-4 h-4 text-gray-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{liveMetrics.likes.toLocaleString()}</p>
            <p className="text-xs text-gray-400">Likes</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
            <BarChart2 className="w-4 h-4 text-gray-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-gray-900">{liveMetrics.engagementRate.toFixed(1)}%</p>
            <p className="text-xs text-gray-400">Engagement</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="h-2 bg-gray-100">
          <div className="h-full bg-amber-500 transition-all duration-500 ease-out" style={{ width: `${progress}%` }} />
        </div>

        <div className="p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-lg text-gray-900 flex items-center gap-2">
              <span className="capitalize">{platform}</span> Checklist
            </h3>
            {postUrl && (
              <a href={postUrl} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                Go to Post <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="space-y-3">
            {checklist.map((item) => (
              <label key={item.id} className={`flex items-center p-4 rounded-xl border-2 transition-all cursor-pointer group ${item.checked ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 hover:border-amber-200 hover:bg-amber-50/30'}`}>
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 transition-colors ${item.checked ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-300 group-hover:border-amber-400'}`}>
                  {item.checked && <CheckCircle2 className="w-4 h-4" />}
                </div>
                <input type="checkbox" className="hidden" checked={item.checked} onChange={() => toggleItem(item.id)} />
                <div className="flex-1 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${item.checked ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                    {item.icon}
                  </div>
                  <span className={`font-medium ${item.checked ? 'text-emerald-900' : 'text-gray-700'}`}>{item.label}</span>
                </div>
              </label>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
            <button onClick={handleFinish} disabled={loading} className="px-8 py-3 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-shadow shadow-lg flex items-center gap-2">
              {progress === 100 ? <><Heart className="w-4 h-4 text-red-400 fill-red-400" /> Golden Hour Complete</> : "Finish Engagement"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
