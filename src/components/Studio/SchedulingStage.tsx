import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useBrand } from '../../contexts/BrandContext';
import { Image as ImageIcon, Sparkles, Clock, AlertTriangle } from 'lucide-react';
import { DateTimePicker } from '../DateTimePicker';
import { useTimezone } from '../../hooks/useTimezone';
import { localInputToUtc } from '../../lib/timezone';

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
  const { timezone } = useTimezone();
  const { activeBrand } = useBrand();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [scheduledDate, setScheduledDate] = useState('');
  const [caption, setCaption] = useState('');
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);

  useEffect(() => {
    if (!activeBrand) return;
    loadWorkflowData();
    loadOptimalTimes();
  }, [workflowId, activeBrand]);

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
    if (!activeBrand) return;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const { data: posts } = await supabase
      .from('content_posts')
      .select('scheduled_date, published_date, engagement_rate, likes, comments, views')
      .eq('user_id', user.id)
      .eq('brand_id', activeBrand.id)
      .eq('status', 'published')
      .gte('published_date', ninetyDaysAgo.toISOString())
      .not('engagement_rate', 'is', null)
      .order('engagement_rate', { ascending: false })
      .limit(50);

    if (!posts || posts.length === 0) {
      setTimeSlots(getDefaultTimeSlots());
      return;
    }

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

    const now = new Date();
    const slots: TimeSlot[] = [];
    const usedHours = new Set<number>();

    for (const { hour, avg, count } of avgByHour.slice(0, 4)) {
      if (usedHours.has(hour)) continue;
      usedHours.add(hour);

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
    if (!scheduledDate || loading) return;
    setLoading(true);
    setError('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be signed in to schedule.');
      if (!activeBrand) throw new Error('No active brand selected.');

      // Convert the picker's wall-clock value in the user's profile timezone,
      // and set BOTH scheduled_for (what the publisher claims by) and
      // scheduled_date — previously only scheduled_date was set, so the post
      // was never picked up and silently never published.
      const utc = localInputToUtc(scheduledDate, timezone);

      const { data: post, error: insertError } = await supabase
        .from('content_posts')
        .insert({
          user_id: user.id,
          brand_id: activeBrand.id,
          platform: 'instagram',
          content_type: contentType,
          caption: caption,
          media_urls: mediaUrl ? [mediaUrl] : [],
          scheduled_date: utc,
          scheduled_for: utc,
          status: 'scheduled',
        })
        .select()
        .maybeSingle();

      if (insertError || !post) throw insertError || new Error('Could not schedule the post.');

      const { error: stageError } = await supabase
        .from('content_workflow_stages')
        .update({
          // Engagement stage retired — advance straight to analysis.
          current_stage: 'analysis',
          published_post_id: post.id,
          schedule_date: utc,
          updated_at: new Date().toISOString(),
        })
        .eq('id', workflowId);
      if (stageError) throw stageError;

      onComplete();
    } catch (err) {
      setError((err as Error).message || 'Could not schedule the post.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-foreground" style={{ fontSize: '1.5rem', fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
          Packaging &amp; scheduling
        </h2>
        <p className="t-body">Finalize your post and pick a time slot.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="bg-foreground overflow-hidden aspect-[9/16] relative flex items-center justify-center">
            {mediaUrl ? (
              contentType === 'reel' || contentType === 'tiktok' || mediaUrl.match(/\.(mp4|mov|webm)$/i) ? (
                <video src={mediaUrl} controls className="w-full h-full object-cover" />
              ) : (
                <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
              )
            ) : (
              <div className="text-background/40 flex flex-col items-center">
                <ImageIcon className="w-10 h-10 mb-2" />
                <p className="text-sm">No media attached</p>
              </div>
            )}

            {!mediaUrl && (
              <div className="absolute inset-x-4 bottom-4 flex items-start gap-2 p-3 bg-background border border-border text-xs text-foreground">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <p>Warning: no media file found.</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-card border border-border p-6 flex flex-col">
          <h3 className="t-micro text-foreground mb-4">Final polish</h3>

          <div className="space-y-5">
            <div>
              <label className="block t-micro text-muted-foreground mb-2">Caption</label>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="w-full p-3 bg-background border border-border focus:outline-none focus:border-foreground text-sm text-foreground placeholder:text-muted-foreground min-h-[180px] resize-y"
                placeholder="Write your final caption…"
              />
            </div>

            {timeSlots.length > 0 && (
              <div>
                <label className="t-micro text-muted-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-accent" />
                  {timeSlots[0].score > 0 ? 'Optimal times (based on your data)' : 'Suggested times'}
                </label>
                <div className="divide-y divide-border border border-border">
                  {timeSlots.map((slot, i) => (
                    <button
                      key={i}
                      onClick={() => setScheduledDate(slot.datetime)}
                      className={`w-full text-left p-3 transition-colors flex items-center gap-3 ${
                        scheduledDate === slot.datetime
                          ? 'bg-foreground/5'
                          : 'hover:bg-foreground/5'
                      }`}
                    >
                      <Clock className={`w-4 h-4 flex-shrink-0 ${scheduledDate === slot.datetime ? 'text-accent' : 'text-muted-foreground'}`} />
                      <div className="min-w-0">
                        <p className={`text-sm ${scheduledDate === slot.datetime ? 'text-accent' : 'text-foreground'}`} style={{ fontWeight: 500 }}>{slot.label}</p>
                        <p className="t-body">{slot.reason}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block t-micro text-muted-foreground mb-2">Or pick a custom time</label>
              <DateTimePicker value={scheduledDate} onChange={(v) => setScheduledDate(v)} />
            </div>
          </div>

          {error && (
            <p className="mt-4 text-sm text-terracotta" style={{ color: '#B07050' }}>
              {error}
            </p>
          )}

          <button
            onClick={handleSchedule}
            disabled={loading || !scheduledDate}
            className="btn-ie btn-ie-solid w-full mt-6 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span className="btn-ie-text">{loading ? 'Scheduling…' : 'Confirm schedule'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
