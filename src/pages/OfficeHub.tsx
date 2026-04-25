import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useTimezone } from '../hooks/useTimezone';
import { formatInTz } from '../lib/timezone';
import { ArrowRight, Image as ImageIcon } from 'lucide-react';

interface ScheduledItem {
  id: string;
  caption: string;
  platform: string;
  scheduled_date: string;
  media_urls: string[] | null;
  thumbnail_url: string | null;
  media_type: string | null;
}

export function OfficeHub() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { timezone } = useTimezone();
  const [scheduled, setScheduled] = useState<ScheduledItem[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [growthPct] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data } = await supabase
        .from('content_posts_unified')
        .select('id, caption, platform, scheduled_date, status, media_urls, thumbnail_url, media_type')
        .eq('user_id', user.id)
        .eq('status', 'scheduled').gte('scheduled_date', new Date().toISOString())
        .order('scheduled_date', { ascending: true })
        .limit(7);
      setScheduled(data || []);
      setQueueCount((data || []).length);
      setLoading(false);
    };
    load();
  }, [user]);

  // Stacked date format: "TUE APR 28" / "05:00 AM" — preserves the user's timezone.
  const formatWhen = (iso: string) => {
    const dayPart = formatInTz(iso, timezone, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: undefined,
      minute: undefined,
      year: undefined,
    }).toUpperCase();
    const timePart = formatInTz(iso, timezone, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      weekday: undefined,
      month: undefined,
      day: undefined,
      year: undefined,
    }).toUpperCase();
    return `${dayPart}\n${timePart}`;
  };

  const nextPublish = scheduled[0]
    ? formatWhen(scheduled[0].scheduled_date).replace('\n', ' · ')
    : null;

  const getThumb = (item: ScheduledItem) =>
    item.thumbnail_url || (item.media_urls && item.media_urls[0]) || null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">

      {/* Section marker + title */}
      <div className="t-micro mb-2">
        <span className="text-foreground">03</span>
        <span className="mx-2 text-muted-foreground">/</span>
        <span>OFFICE</span>
      </div>
      <h1
        className="text-foreground mb-12"
        style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1.05 }}
      >
        Scheduling and{' '}
        <em style={{ fontStyle: 'normal', color: 'var(--accent)' }}>analytics.</em>
      </h1>

      {/*
        Asymmetric layout. Desktop = sidebar (Upcoming) on left, tiles on right.
        Mobile = tiles surface FIRST, then the upcoming list below as preview cards.
      */}
      <div className="grid gap-10 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>

        {/* Upcoming — order-2 on mobile (below tiles), order-1 on sm+ */}
        <aside className="order-2 sm:order-1">
          <div className="flex items-center justify-between pb-3 border-b border-border mb-1">
            <span className="t-micro">UPCOMING · 14 DAYS</span>
            <span className="t-micro text-foreground">{String(queueCount).padStart(2,'0')}</span>
          </div>

          {loading ? (
            <div className="py-10 text-center t-micro">LOADING&hellip;</div>
          ) : scheduled.length === 0 ? (
            <div className="py-10 text-center">
              <p className="t-micro mb-4">NOTHING QUEUED</p>
              <button onClick={() => navigate('/schedule')} className="btn-ie">
                <span className="btn-ie-text">Open calendar</span>
              </button>
            </div>
          ) : (
            <div>
              {scheduled.map((item) => {
                const thumb = getThumb(item);
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate('/schedule')}
                    className="w-full text-left group"
                  >
                    <div className="flex items-center gap-3 py-3 border-b border-border">
                      {/* Thumbnail (or platform-letter fallback) */}
                      <div
                        className="flex-shrink-0 border border-border bg-muted/20 overflow-hidden flex items-center justify-center"
                        style={{ width: 56, height: 56 }}
                      >
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                      </div>

                      {/* Date stack */}
                      <div
                        className="flex-shrink-0"
                        style={{ width: 80 }}
                      >
                        <span className="t-micro" style={{ whiteSpace: 'pre-line', lineHeight: 1.3 }}>
                          {formatWhen(item.scheduled_date)}
                        </span>
                      </div>

                      {/* Caption + platform */}
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-foreground font-medium group-hover:text-accent transition-colors truncate"
                          style={{ fontSize: '14px', lineHeight: 1.35 }}
                        >
                          {item.caption ? item.caption.slice(0, 80) + (item.caption.length > 80 ? '…' : '') : 'Untitled'}
                        </div>
                        <div className="t-micro mt-0.5">{item.platform.toUpperCase()}</div>
                      </div>

                      <ArrowRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-accent transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </aside>

        {/* Schedule + Analytics tiles — order-1 on mobile (top), order-2 on sm+ */}
        <div className="order-1 sm:order-2">
          <div className="grid grid-cols-2 gap-4">

            {/* Schedule tile */}
            <button
              onClick={() => navigate('/schedule')}
              className="card-industrial p-6 text-left flex flex-col gap-4 group cursor-pointer"
              style={{ minHeight: 240 }}
            >
              <span className="t-micro">01 · SCHEDULE</span>
              <div
                className="font-mono text-foreground"
                style={{ fontSize: '2.75rem', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}
              >
                {String(queueCount).padStart(2,'0')}
                <span className="text-sm text-muted-foreground ml-1 font-normal tracking-wide" style={{ fontSize: '13px' }}>
                  queued
                </span>
              </div>
              <div className="flex-1">
                <div className="text-foreground font-semibold mb-1" style={{ fontSize: '1.2rem', letterSpacing: '-0.015em' }}>
                  Schedule
                </div>
                <div className="t-body" style={{ maxWidth: '26ch' }}>
                  {nextPublish
                    ? `Next publish: ${nextPublish}`
                    : 'Drag-and-drop calendar across every connected platform.'}
                </div>
              </div>
              <span className="t-micro text-foreground group-hover:text-accent transition-colors flex items-center gap-2">
                Open calendar <ArrowRight className="w-3 h-3" />
              </span>
            </button>

            {/* Analytics tile */}
            <button
              onClick={() => navigate('/analytics')}
              className="card-industrial p-6 text-left flex flex-col gap-4 group cursor-pointer"
              style={{ minHeight: 240 }}
            >
              <span className="t-micro">02 · ANALYTICS</span>
              <div
                className="font-mono text-foreground"
                style={{ fontSize: '2.75rem', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}
              >
                {growthPct ?? '+18'}
                <span className="text-sm text-muted-foreground ml-1 font-normal tracking-wide" style={{ fontSize: '13px' }}>
                  %
                </span>
                <span className="text-xs ml-2 font-mono" style={{ color: 'var(--chart-4)', fontSize: '11px' }}>7D</span>
              </div>
              <div className="flex-1">
                <div className="text-foreground font-semibold mb-1" style={{ fontSize: '1.2rem', letterSpacing: '-0.015em' }}>
                  Analytics
                </div>
                <div className="t-body" style={{ maxWidth: '26ch' }}>
                  Cross-platform performance, watch-through, and what&rsquo;s compounding this month.
                </div>
              </div>
              <span className="t-micro text-foreground group-hover:text-accent transition-colors flex items-center gap-2">
                View report <ArrowRight className="w-3 h-3" />
              </span>
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}
