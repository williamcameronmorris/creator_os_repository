import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Calendar, Send, AlertTriangle, Image as ImageIcon, Sparkles, Clock } from 'lucide-react';

interface TimeSlot {
  label: string;
  datetime: string;
  reason: string;
  score: number;
}

interface SchedulingStageProps {
  workflowId: string;
  contentType: string;
  onComplete: () => void;
}

export function SchedulingStage({ workflowId, contentType, onComplete }: SchedulingStageProps) {
  const [loading, setLoading] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [caption, setCaption] = useState('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  useEffect(() => {
    loadWorkflowData();
    loadOptimalTimes();
  }, [workflowId]);

  const loadWorkflowData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('content_workflow_stages')
      .select('*')
      .eq('id', workflowId)
      .maybeSingle();

    if (data) {
      const script = data.script_content as any;
      if (script) {
        let fullCaption = script.caption || '';
        if (script.hashtags) {
          const tags = Array.isArray(script.hashtags) ? script.hashtags.join(' ') : script.hashtags;
          fullCaption += `\n\n${tags}`;
        }
        setCaption(fullCaption);
      }

      const creation = data.creation_notes as any;
      if (creation?.media_url) {
        setMediaUrl(creation.media_url);
      }
    }
    setLoading(false);
  };

  const loadOptimalTimes = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Pull last 90 days of published posts with engagement data
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: posts } = await supabase
      .from('content_posts')
      .select('scheduled_date, published_date, engagement_rate, likes, comments, views')
      .eq('user_id', user.id)
      .eq('status', 'published')
      .gte('published_date', ninetyDaysAgo.toISOString())
      .not('engagement_rate', 'is', null)
      .order('engagement_rate', { ascending: false })
      .limit(50);

    if (!posts || posts.length === 0) {
      // No data — fall back to generic best practices
      setTimeSlots(getDefaultTimeSlots());
      return;
    }

    // Group by hour-of-day and compute avg engagement
    const hourBuckets: Record<number, { total: number; count: number }> = {};
    for (const post of posts) {
      const dateStr = post.published_date || post.scheduled_date;
      if (!dateStr) continue;
      const hour = new Date(dateStr).getHours();
      if (!hourBuckets[hour]) hourBuckets[hour] = { total: 0, count: 0 };
      hourBuckets[hour].total += post.engagement_rate || 0;
      hourBuckets[hour].count += 1;
    }

    const avgByHour = Object.entries(hourBuckets)
      .map(([hour, { total, count }]) => ({ hour: Number(hour), avg: total / count, count }))
      .sort((a, b) => b.avg - a.avg);

    if (avgByHour.length === 0) {
      setTimeSlots(getDefaultTimeSlots());
      return;
    }

    // Build top 3 recommended slots (next 7 days at top hours)
    const now = new Date();
    const slots: TimeSlot[] = [];
    const usedHours = new Set<number>();

    for (const { hour, avg, count } of avgByHour.slice(0, 4)) {
      if (usedHours.has(hour)) continue;
      usedHours.add(hour);

      // Find next occurrence of this hour (at least 1h from now)
      const candidate = new Date();
      candidate.setHours(hour, 0, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);

      const dayLabel = candidate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeLabel = candidate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      slots.push({
        label: `${dayLabel} at ${timeLabel}`,
        datetime: candidate.toISOString().slice(0, 16),
        reason: `${avg.toFixed(1)}% avg engagement across ${count} post${count > 1 ? 's' : ''} at this hour`,
        score: Math.round(avg),
      });

      if (slots.length >= 3) break;
    }

    setTimeSlots(slots.length > 0 ? slots : getDefaultTimeSlots());
  };

  const getDefaultTimeSlots = (): TimeSlot[] => {
    const now = new Date();
    const makeSlot = (daysAhead: number, hour: number, reason: string): TimeSlot => {
      const d = new Date(now);
      d.setDate(d.getDate() + daysAhead);
      d.setHours(hour, 0, 0, 0);
      const dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const timeLabel = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return { label: `${dayLabel} at ${timeLabel}`, datetime: d.toISOString().slice(0, 16), reason, score: 0 };
    };
    return [
      makeSlot(0, 18, 'General best practice: weekday evening'),
      makeSlot(1, 12, 'General best practice: midday'),
      makeSlot(2, 9, 'General best practice: morning'),
    ];
  };

  const handleSchedule = async () => {
    if (!scheduledDate) return;
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: post, error } = await supabase
      .from('content_posts')
      .insert({
        user_id: user.id,
        platform: 'instagram',
        content_type: contentType,
        caption: caption,
        media_urls: mediaUrl ? [mediaUrl] : [],
        scheduled_date: new Date(scheduledDate).toISOString(),
        status: 'scheduled'
      })
      .select()
      .maybeSingle();

    if (error || !post) {
      console.error("Error scheduling:", error);
      setLoading(false);
      return;
    }

    await supabase
      .from('content_workflow_stages')
      .update({
        current_stage: 'engagement',
        published_post_id: post.id,
        schedule_date: scheduledDate,
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);

    onComplete();
    setLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-900">Packaging & Scheduling</h2>
        <p className="text-slate-500 text-sm">Finalize your post and pick a time slot.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-slate-900 rounded-2xl overflow-hidden shadow-xl aspect-[9/16] relative flex items-center justify-center">
            {mediaUrl ? (
              contentType === 'reel' || contentType === 'tiktok' || mediaUrl.match(/\.(mp4|mov|webm)$/i) ? (
                <video src={mediaUrl} controls className="w-full h-full object-cover" />
              ) : (
                <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="text-slate-500 flex flex-col items-center">
                <ImageIcon className="w-12 h-12 mb-2 opacity-50" />
                <p>No media attached</p>
              </div>
            )}

            {!mediaUrl && (
              <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center p-6 text-center">
                <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl text-white text-sm">
                  <AlertTriangle className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                  Warning: No media file found.
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="font-bold text-slate-900 mb-4">Final Polish</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Caption</label>
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  className="w-full p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none min-h-[200px] text-sm"
                  placeholder="Write your final caption..."
                />
              </div>

              {timeSlots.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-blue-500" />
                    {timeSlots[0].score > 0 ? 'Optimal Times (based on your data)' : 'Suggested Times'}
                  </label>
                  <div className="space-y-2">
                    {timeSlots.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => setScheduledDate(slot.datetime)}
                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                          scheduledDate === slot.datetime
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                            : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-medium text-slate-800">{slot.label}</p>
                            <p className="text-xs text-slate-500">{slot.reason}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Or pick a custom time</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="datetime-local"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="w-full pl-12 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-200">
              <button
                onClick={handleSchedule}
                disabled={loading || !scheduledDate}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                {loading ? 'Scheduling...' : <><Send className="w-5 h-5" /> Confirm Schedule</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
