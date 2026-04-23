import { useState } from 'react';
import { ChevronLeft, ChevronRight, Instagram, Youtube, Sparkles, AtSign, Calendar, Clock } from 'lucide-react';
import { formatInTz } from '../lib/timezone';

interface CalPost {
  id: string;
  platform: string;
  caption: string;
  scheduled_date: string;
  scheduled_for?: string | null;
  status: string;
}

interface CalendarViewProps {
  posts: CalPost[];
  timezone: string;
  onPostClick: (post: CalPost) => void;
  granularity?: 'monthly' | 'weekly' | 'daily';
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500',
  youtube: 'bg-red-500',
  tiktok: 'bg-gray-800',
  threads: 'bg-gray-600',
};

const PLATFORM_ICONS: Record<string, React.ElementType> = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Sparkles,
  threads: AtSign,
};

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_LONG  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Returns the Sunday that starts the week containing `date` */
function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a Date as YYYY-MM-DD in the local system timezone */
function toLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function CalendarView({ posts, timezone, onPostClick, granularity = 'monthly' }: CalendarViewProps) {
  const today = new Date();
  // Monthly navigation
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  // Weekly / daily navigation — offset in days from today's week-start / today
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset]   = useState(0);

  // Build postsByDay map: "YYYY-MM-DD" → posts[]
  const postsByDay: Record<string, CalPost[]> = {};
  for (const post of posts) {
    const dateStr = post.scheduled_for || post.scheduled_date;
    if (!dateStr) continue;
    try {
      const key = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(dateStr));
      if (!postsByDay[key]) postsByDay[key] = [];
      postsByDay[key].push(post);
    } catch (_) { /* skip */ }
  }

  // ── MONTHLY ────────────────────────────────────────────────────────────────
  if (granularity === 'monthly') {
    const prevMonth = () => {
      if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
      else setViewMonth(m => m - 1);
    };
    const nextMonth = () => {
      if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
      else setViewMonth(m => m + 1);
    };

    const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
    const startWeekday = firstDayOfMonth.getDay();
    const totalDays = daysInMonth(viewYear, viewMonth);
    const cells: (number | null)[] = [
      ...Array(startWeekday).fill(null),
      ...Array.from({ length: totalDays }, (_, i) => i + 1),
    ];
    const isToday = (day: number) =>
      day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
    const dayKey = (day: number) =>
      `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h3 className="text-base font-bold text-foreground">{MONTH_NAMES[viewMonth]} {viewYear}</h3>
          <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
        <div className="grid grid-cols-7 border-b border-border">
          {DAY_NAMES_SHORT.map(d => (
            <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`e-${idx}`} className="min-h-[80px] border-r border-b border-border/50 bg-muted/20" />;
            const key = dayKey(day);
            const dayPosts = postsByDay[key] || [];
            const visible = dayPosts.slice(0, 2);
            const overflow = dayPosts.length - 2;
            return (
              <div key={key} className={`min-h-[80px] p-1.5 border-r border-b border-border/50 ${isToday(day) ? 'bg-primary/5' : 'bg-card'} ${(idx + 1) % 7 === 0 ? 'border-r-0' : ''}`}>
                <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                  {day}
                </div>
                <div className="space-y-0.5">
                  {visible.map(post => {
                    const Icon = PLATFORM_ICONS[post.platform] || Calendar;
                    const color = PLATFORM_COLORS[post.platform] || 'bg-gray-500';
                    return (
                      <button key={post.id} onClick={() => onPostClick(post)}
                        className={`w-full flex items-center gap-1 px-1.5 py-1 rounded text-left text-[10px] font-medium text-white truncate ${color} hover:opacity-90 transition-opacity`}
                        title={post.caption || post.platform}>
                        <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                        <span className="truncate">{post.caption?.slice(0, 18) || post.platform}</span>
                      </button>
                    );
                  })}
                  {overflow > 0 && <p className="text-[10px] text-muted-foreground pl-1">+{overflow} more</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── WEEKLY ─────────────────────────────────────────────────────────────────
  if (granularity === 'weekly') {
    const baseWeekStart = weekStart(today);
    const currentWeekStart = new Date(baseWeekStart);
    currentWeekStart.setDate(currentWeekStart.getDate() + weekOffset * 7);

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      return d;
    });

    const weekEnd = days[6];
    const isSameMonth = currentWeekStart.getMonth() === weekEnd.getMonth();
    const headerLabel = isSameMonth
      ? `${MONTH_NAMES[currentWeekStart.getMonth()]} ${currentWeekStart.getDate()}–${weekEnd.getDate()}, ${currentWeekStart.getFullYear()}`
      : `${MONTH_NAMES[currentWeekStart.getMonth()]} ${currentWeekStart.getDate()} – ${MONTH_NAMES[weekEnd.getMonth()]} ${weekEnd.getDate()}, ${weekEnd.getFullYear()}`;

    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <button onClick={() => setWeekOffset(w => w - 1)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronLeft className="w-5 h-5 text-muted-foreground" />
          </button>
          <h3 className="text-base font-bold text-foreground">{headerLabel}</h3>
          <button onClick={() => setWeekOffset(w => w + 1)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ChevronRight className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* 7-column week grid */}
        <div className="grid grid-cols-7 border-b border-border">
          {days.map(d => {
            const isToday = toLocalDateKey(d) === toLocalDateKey(today);
            return (
              <div key={d.toISOString()} className={`py-2 flex flex-col items-center gap-0.5 ${isToday ? 'bg-primary/5' : ''}`}>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase">{DAY_NAMES_SHORT[d.getDay()]}</span>
                <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isToday ? 'bg-primary text-primary-foreground' : 'text-foreground'}`}>
                  {d.getDate()}
                </span>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-7 divide-x divide-border">
          {days.map(d => {
            const key = toLocalDateKey(d);
            const dayPosts = postsByDay[key] || [];
            const isToday = key === toLocalDateKey(today);
            return (
              <div key={key} className={`min-h-[160px] p-1.5 ${isToday ? 'bg-primary/5' : 'bg-card'}`}>
                {dayPosts.length === 0 ? (
                  <div className="h-full flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground/40">—</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {dayPosts.map(post => {
                      const Icon = PLATFORM_ICONS[post.platform] || Calendar;
                      const color = PLATFORM_COLORS[post.platform] || 'bg-gray-500';
                      const timeStr = post.scheduled_for || post.scheduled_date;
                      const time = timeStr
                        ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(timeStr))
                        : '';
                      return (
                        <button key={post.id} onClick={() => onPostClick(post)}
                          className={`w-full flex flex-col items-start gap-0.5 px-1.5 py-1.5 rounded text-left ${color} hover:opacity-90 transition-opacity`}
                          title={post.caption || post.platform}>
                          <div className="flex items-center gap-1 w-full">
                            <Icon className="w-2.5 h-2.5 flex-shrink-0 text-white" />
                            <span className="text-[10px] font-medium text-white truncate">{post.caption?.slice(0, 14) || post.platform}</span>
                          </div>
                          {time && <span className="text-[9px] text-white/70">{time}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── DAILY ──────────────────────────────────────────────────────────────────
  const viewDate = new Date(today);
  viewDate.setDate(viewDate.getDate() + dayOffset);
  viewDate.setHours(0, 0, 0, 0);

  const dayKey = toLocalDateKey(viewDate);
  const todayKey = toLocalDateKey(today);
  const isViewingToday = dayKey === todayKey;
  const dayPosts = (postsByDay[dayKey] || []).sort((a, b) => {
    const aDate = a.scheduled_for || a.scheduled_date;
    const bDate = b.scheduled_for || b.scheduled_date;
    if (!aDate) return 1;
    if (!bDate) return -1;
    return new Date(aDate).getTime() - new Date(bDate).getTime();
  });

  const dayLabel = isViewingToday ? 'Today' : dayOffset === 1 ? 'Tomorrow' : dayOffset === -1 ? 'Yesterday'
    : `${DAY_NAMES_LONG[viewDate.getDay()]}, ${MONTH_NAMES[viewDate.getMonth()]} ${viewDate.getDate()}`;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <button onClick={() => setDayOffset(d => d - 1)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="text-center">
          <h3 className="text-base font-bold text-foreground">{dayLabel}</h3>
          {!isViewingToday && (
            <p className="text-xs text-muted-foreground">
              {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getDate()}, {viewDate.getFullYear()}
            </p>
          )}
        </div>
        <button onClick={() => setDayOffset(d => d + 1)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="p-4">
        {dayPosts.length === 0 ? (
          <div className="py-12 flex flex-col items-center gap-2 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No posts scheduled</p>
            <p className="text-xs text-muted-foreground/60">{isViewingToday ? 'Nothing scheduled for today' : 'Nothing on this day'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {dayPosts.map(post => {
              const Icon = PLATFORM_ICONS[post.platform] || Calendar;
              const color = PLATFORM_COLORS[post.platform] || 'bg-gray-500';
              const dailyTimeStr = post.scheduled_for || post.scheduled_date;
              const time = dailyTimeStr
                ? new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(dailyTimeStr))
                : null;
              return (
                <button key={post.id} onClick={() => onPostClick(post)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-accent transition-colors text-left">
                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${color}`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground capitalize mb-0.5">{post.platform} post</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">{post.caption || 'No caption'}</p>
                  </div>
                  {time && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 mt-0.5">
                      <Clock className="w-3 h-3" />
                      {time}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!isViewingToday && (
        <div className="px-4 pb-4">
          <button onClick={() => setDayOffset(0)} className="w-full py-2 text-xs font-medium text-primary hover:text-primary/80 transition-colors">
            Back to today
          </button>
        </div>
      )}
    </div>
  );
}
