import { ArrowRight, Calendar, Instagram, Youtube, Video } from 'lucide-react';
import { PulseCard } from './PulseCard';
import { format, isToday, isTomorrow, isThisWeek, parseISO } from 'date-fns';

type Platform = 'instagram' | 'youtube' | 'tiktok';
type ItemType = 'post' | 'story' | 'reel' | 'video';

interface ScheduleItem {
  id: string;
  title: string;
  scheduledTime: string;
  platform: Platform;
  type: ItemType;
}

interface ComingUpData {
  todayCount: number;
  thisWeekCount: number;
  nextPostTime?: string;
  nextPostPlatform?: Platform;
  items: ScheduleItem[];
}

interface ComingUpCardProps {
  data: ComingUpData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditPost: (postId: string) => void;
  onReschedule: (postId: string) => void;
  onViewCalendar: () => void;
  hideCollapseButton?: boolean;
}

const platformIcons: Record<Platform, typeof Instagram> = {
  instagram: Instagram,
  youtube: Youtube,
  tiktok: Video,
};

const platformColors: Record<Platform, string> = {
  instagram: 'text-pink-500',
  youtube: 'text-red-500',
  tiktok: 'text-foreground',
};

const typeLabels: Record<ItemType, string> = {
  post: 'Post',
  story: 'Story',
  reel: 'Reel',
  video: 'Video',
};

export function ComingUpCard({
  data,
  isExpanded,
  onToggleExpand,
  onEditPost,
  onReschedule,
  onViewCalendar,
  hideCollapseButton,
}: ComingUpCardProps) {
  const formatTime = (dateString: string) => {
    const date = parseISO(dateString);
    return format(date, 'h:mm a');
  };

  const formatType = (platform: Platform, type: ItemType) => {
    if (platform === 'instagram') {
      return type === 'reel' ? 'Instagram Reel' : type === 'story' ? 'Instagram Story' : 'Instagram Post';
    }
    if (platform === 'youtube') {
      return 'YouTube Video';
    }
    return 'TikTok Post';
  };

  const groupItemsByDay = (items: ScheduleItem[]) => {
    const today: ScheduleItem[] = [];
    const tomorrow: ScheduleItem[] = [];
    const thisWeek: ScheduleItem[] = [];
    items.forEach((item) => {
      const date = parseISO(item.scheduledTime);
      if (isToday(date)) {
        today.push(item);
      } else if (isTomorrow(date)) {
        tomorrow.push(item);
      } else if (isThisWeek(date)) {
        thisWeek.push(item);
      }
    });
    return { today, tomorrow, thisWeek };
  };

  const grouped = groupItemsByDay(data.items);

  const badges = [];
  if (data.nextPostTime && data.nextPostPlatform) {
    badges.push({
      label: `${format(parseISO(data.nextPostTime), 'h a')} ${data.nextPostPlatform.charAt(0).toUpperCase() + data.nextPostPlatform.slice(1)}`,
      variant: 'default' as const,
    });
  }
  if (data.thisWeekCount > 0) {
    badges.push({ label: `${data.thisWeekCount} this week`, variant: 'default' as const });
  }

  const renderScheduleGroup = (title: string, items: ScheduleItem[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <p className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
          {title}
        </p>
        <div className="space-y-2">
          {items.map((item) => {
            const PlatformIcon = platformIcons[item.platform];
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 bg-accent rounded-xl"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                    {formatTime(item.scheduledTime)}
                  </span>
                  <PlatformIcon className={`w-4 h-4 ${platformColors[item.platform]} flex-shrink-0`} />
                  <span className="text-sm text-foreground/80 truncate">
                    {formatType(item.platform, item.type)}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEditPost(item.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-border/50 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => onReschedule(item.id)}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:bg-border/50 transition-colors"
                  >
                    Reschedule
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <PulseCard
      category="schedule"
      categoryLabel="SCHEDULE"
      title="Coming Up"
      metric={data.todayCount}
      metricLabel="post today"
      badges={badges}
      isExpanded={isExpanded}
      onToggleExpand={onToggleExpand}
      hideCollapseButton={hideCollapseButton}
    >
      <div className="space-y-4">
        {data.items.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">No content scheduled</p>
          </div>
        ) : (
          <>
            {renderScheduleGroup('TODAY', grouped.today)}
            {renderScheduleGroup('TOMORROW', grouped.tomorrow)}
            {renderScheduleGroup('THIS WEEK', grouped.thisWeek)}
          </>
        )}
        <button
          onClick={onViewCalendar}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-violet-600 text-white font-medium hover:bg-violet-700 transition-colors"
        >
          View Calendar
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </PulseCard>
  );
}
