import { useState, useRef, useEffect } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isSameDay,
  addMonths, subMonths, isToday, isBefore, startOfDay
} from 'date-fns';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';

interface DateTimePickerProps {
  value: string;               // "YYYY-MM-DDTHH:MM" (datetime-local format)
  onChange: (value: string) => void;
  min?: string;                // same format
  className?: string;
}

export function DateTimePicker({ value, onChange, min, className }: DateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    if (value) return startOfMonth(new Date(value));
    return startOfMonth(new Date());
  });
  const ref = useRef<HTMLDivElement>(null);

  // Parse the current value into date and time parts
  const selectedDate = value ? new Date(value) : null;
  const timeValue = value ? value.slice(11, 16) : '';

  // Parse min date
  const minDate = min ? startOfDay(new Date(min)) : undefined;

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Build calendar grid
  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function selectDay(day: Date) {
    // Keep existing time or default to 12:00
    const hours = selectedDate ? format(selectedDate, 'HH') : '12';
    const mins = selectedDate ? format(selectedDate, 'mm') : '00';
    const newValue = `${format(day, 'yyyy-MM-dd')}T${hours}:${mins}`;
    onChange(newValue);
  }

  function handleTimeChange(newTime: string) {
    if (!selectedDate) {
      // If no date selected yet, use today
      const today = format(new Date(), 'yyyy-MM-dd');
      onChange(`${today}T${newTime}`);
    } else {
      onChange(`${format(selectedDate, 'yyyy-MM-dd')}T${newTime}`);
    }
  }

  function isDayDisabled(day: Date) {
    if (!minDate) return false;
    return isBefore(day, minDate);
  }

  // Display text
  const displayText = selectedDate
    ? `${format(selectedDate, 'MMM d, yyyy')} at ${format(selectedDate, 'h:mm a')}`
    : '';

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3 rounded-xl border bg-background text-foreground text-left flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all ${className || 'border-border'}`}
      >
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {displayText ? (
          <span className="text-sm">{displayText}</span>
        ) : (
          <span className="text-sm text-muted-foreground">Pick a date and time</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-2 w-[320px] rounded-2xl border border-border bg-background shadow-2xl p-4 space-y-4 animate-in fade-in slide-in-from-top-2">
          {/* Month nav */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(subMonths(viewMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-foreground" />
            </button>
            <span className="text-sm font-semibold text-foreground">
              {format(viewMonth, 'MMMM yyyy')}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              className="p-1.5 rounded-lg hover:bg-accent transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-foreground" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-xs font-medium text-muted-foreground py-1">
                {d}
              </div>
            ))}

            {/* Day cells */}
            {days.map((day, i) => {
              const inMonth = isSameMonth(day, viewMonth);
              const selected = selectedDate ? isSameDay(day, selectedDate) : false;
              const today = isToday(day);
              const disabled = isDayDisabled(day);

              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={[
                    'w-9 h-9 rounded-lg text-sm transition-all flex items-center justify-center',
                    disabled && 'opacity-25 cursor-not-allowed',
                    !disabled && !selected && 'hover:bg-accent cursor-pointer',
                    !inMonth && !selected && 'text-muted-foreground/40',
                    inMonth && !selected && 'text-foreground',
                    today && !selected && 'font-bold ring-1 ring-primary/40',
                    selected && 'bg-primary text-white font-semibold shadow-md',
                  ].filter(Boolean).join(' ')}
                >
                  {format(day, 'd')}
                </button>
              );
            })}
          </div>

          {/* Time picker */}
          <div className="flex items-center gap-3 pt-2 border-t border-border">
            <label className="text-xs font-medium text-muted-foreground">Time</label>
            <input
              type="time"
              value={timeValue}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Quick actions */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                selectDay(now);
              }}
              className="flex-1 text-xs py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => {
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                selectDay(tomorrow);
              }}
              className="flex-1 text-xs py-1.5 rounded-lg border border-border hover:bg-accent text-muted-foreground transition-colors"
            >
              Tomorrow
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
                className="flex-1 text-xs py-1.5 rounded-lg border border-border hover:bg-accent text-red-400 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
