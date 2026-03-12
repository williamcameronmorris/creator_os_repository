import { useState } from 'react';
import { ChevronLeft, ChevronRight, Instagram, Youtube, Sparkles, AtSign, Calendar } from 'lucide-react';
import { formatInTz } from '../lib/timezone';

interface CalPost {
  id: string;
  platform: string;
  caption: string;
  scheduled_date: string;
  status: string;
}

interface CalendarViewProps {
  posts: CalPost[];
  timezone: string;
  onPostClick: (post: CalPost) => void;
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

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function startOfMonth(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * A month-grid calendar view for scheduled posts.
 * Shows up to 2 posts per day cell with overflow indicator.
 * Clicking a post card calls onPostClick for editing.
 */
export function CalendarView({ posts, timezone, onPostClick }: CalendarViewProps) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  // Build a map: "YYYY-MM-DD" → posts
  const postsByDay: Record<string, CalPost[]> = {};
  for (const post of posts) {
    if (!post.scheduled_date) continue;
    try {
      // Convert UTC stored date to local display date in user's tz
      const localStr = formatInTz(post.scheduled_date, timezone, {
        year: 'numeric', month: '2-digit', day: '2-digit',
        timeZone: timezone,
      });
      // formatInTz returns "MM/DD/YYYY" style via en-US defaults — use a date-only formatter
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date(post.scheduled_date));
      // parts is "YYYY-MM-DD" (en-CA format)
      if (!postsByDay[parts]) postsByDay[parts] = [];
      postsByDay[parts].push(post);
    } catch (_) { /* skip */ }
  }

  const firstDayOfMonth = startOfMonth(viewYear, viewMonth);
  const startWeekday = firstDayOfMonth.getDay(); // 0=Sun
  const totalDays = daysInMonth(viewYear, viewMonth);

  // Pad with null for leading empty cells
  const cells: (number | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];

  const isToday = (day: number) =>
    day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();

  const dayKey = (day: number) => {
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${viewYear}-${m}-${d}`;
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <button
          onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <h3 className="text-base font-bold text-foreground">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </h3>
        <button
          onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-border">
        {DAY_NAMES.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`empty-${idx}`} className="min-h-[80px] border-r border-b border-border/50 bg-muted/20" />;
          }

          const key = dayKey(day);
          const dayPosts = postsByDay[key] || [];
          const visible = dayPosts.slice(0, 2);
          const overflow = dayPosts.length - 2;

          return (
            <div
              key={key}
              className={`min-h-[80px] p-1.5 border-r border-b border-border/50 ${
                isToday(day) ? 'bg-primary/5' : 'bg-card'
              } ${(idx + 1) % 7 === 0 ? 'border-r-0' : ''}`}
            >
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday(day) ? 'bg-primary text-primary-foreground' : 'text-foreground'
              }`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {visible.map((post) => {
                  const Icon = PLATFORM_ICONS[post.platform] || Calendar;
                  const color = PLATFORM_COLORS[post.platform] || 'bg-gray-500';
                  return (
                    <button
                      key={post.id}
                      onClick={() => onPostClick(post)}
                      className={`w-full flex items-center gap-1 px-1.5 py-1 rounded text-left text-[10px] font-medium text-white truncate ${color} hover:opacity-90 transition-opacity`}
                      title={post.caption || post.platform}
                    >
                      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
                      <span className="truncate">{post.caption?.slice(0, 18) || post.platform}</span>
                    </button>
                  );
                })}
                {overflow > 0 && (
                  <p className="text-[10px] text-muted-foreground pl-1">+{overflow} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
