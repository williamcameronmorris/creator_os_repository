import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown } from 'lucide-react';

export type RangePreset = 'last_7d' | 'last_30d' | 'last_90d' | 'custom';
export type ComparisonPreset = 'previous_period' | 'none';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface DateComparisonValue {
  range: DateRange;
  rangePreset: RangePreset;
  comparison: DateRange | null;
  comparisonPreset: ComparisonPreset;
}

interface DateComparisonPillProps {
  value: DateComparisonValue;
  onChange: (next: DateComparisonValue) => void;
}

/**
 * Single inline control showing both ranges (e.g. '1/1 – 3/31 vs 10/3 – 12/31').
 * Click opens a popover with two stacked sections: Date Range, Compare to.
 *
 * Lives at the report-shell level — every MetricWidget on the page reads from
 * the same DateComparisonValue so a single change re-runs every section.
 */
export function DateComparisonPill({ value, onChange }: DateComparisonPillProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 border border-border bg-card px-3 py-2 text-sm hover:bg-muted transition-colors"
      >
        <Calendar className="w-4 h-4 text-muted-foreground" />
        <span className="tabular-nums">{summarize(value)}</span>
        <ChevronDown className="w-3 h-3 text-muted-foreground" strokeWidth={2.5} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-[420px] border border-border bg-popover shadow-lg">
          <PopoverBody value={value} onChange={onChange} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

function PopoverBody({
  value,
  onChange,
  onClose,
}: {
  value: DateComparisonValue;
  onChange: (next: DateComparisonValue) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DateComparisonValue>(value);

  const updateRangePreset = (preset: RangePreset) => {
    if (preset === 'custom') {
      setDraft((d) => ({ ...d, rangePreset: preset }));
      return;
    }
    const range = computePresetRange(preset);
    const comparison =
      draft.comparisonPreset === 'previous_period' ? previousPeriod(range) : null;
    setDraft((d) => ({ ...d, rangePreset: preset, range, comparison }));
  };

  const updateComparisonPreset = (preset: ComparisonPreset) => {
    const comparison = preset === 'previous_period' ? previousPeriod(draft.range) : null;
    setDraft((d) => ({ ...d, comparisonPreset: preset, comparison }));
  };

  const apply = () => {
    onChange(draft);
    onClose();
  };

  return (
    <div>
      <Section label="Date Range">
        <select
          value={draft.rangePreset}
          onChange={(e) => updateRangePreset(e.target.value as RangePreset)}
          className="t-micro border border-border bg-input px-2 py-1.5 mb-3 w-full"
        >
          <option value="last_7d">Last 7 days</option>
          <option value="last_30d">Last 30 days</option>
          <option value="last_90d">Last 90 days</option>
          <option value="custom">Custom</option>
        </select>
        <DateInputPair
          start={draft.range.start}
          end={draft.range.end}
          onChange={(start, end) =>
            setDraft((d) => ({
              ...d,
              rangePreset: 'custom',
              range: { start, end },
              comparison:
                d.comparisonPreset === 'previous_period'
                  ? previousPeriod({ start, end })
                  : null,
            }))
          }
        />
      </Section>

      <Section label="Compare to">
        <select
          value={draft.comparisonPreset}
          onChange={(e) => updateComparisonPreset(e.target.value as ComparisonPreset)}
          className="t-micro border border-border bg-input px-2 py-1.5 mb-3 w-full"
        >
          <option value="previous_period">Previous period</option>
          <option value="none">No comparison</option>
        </select>
        {draft.comparison && (
          <DateInputPair
            start={draft.comparison.start}
            end={draft.comparison.end}
            onChange={(start, end) =>
              setDraft((d) => ({ ...d, comparison: { start, end } }))
            }
          />
        )}
      </Section>

      <div className="border-t border-border px-4 py-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="t-micro border border-border bg-card px-3 py-1.5 hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={apply}
          className="t-micro border border-foreground bg-foreground text-primary-foreground px-3 py-1.5 hover:bg-accent hover:border-accent hover:text-accent-foreground"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pt-4 pb-3 border-b border-border">
      <div className="t-micro text-muted-foreground mb-2">{label}</div>
      {children}
    </div>
  );
}

function DateInputPair({
  start,
  end,
  onChange,
}: {
  start: Date;
  end: Date;
  onChange: (start: Date, end: Date) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <input
        type="date"
        value={toInputDate(start)}
        onChange={(e) => onChange(fromInputDate(e.target.value), end)}
        className="text-sm border border-border bg-input px-2 py-1.5 tabular-nums"
      />
      <input
        type="date"
        value={toInputDate(end)}
        onChange={(e) => onChange(start, fromInputDate(e.target.value))}
        className="text-sm border border-border bg-input px-2 py-1.5 tabular-nums"
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function summarize(v: DateComparisonValue): string {
  const r = `${formatShort(v.range.start)} – ${formatShort(v.range.end)}`;
  if (!v.comparison) return r;
  return `${r} vs ${formatShort(v.comparison.start)} – ${formatShort(v.comparison.end)}`;
}

function formatShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
}

function toInputDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function fromInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function computePresetRange(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  const days = preset === 'last_7d' ? 7 : preset === 'last_30d' ? 30 : 90;
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function previousPeriod(range: DateRange): DateRange {
  const ms = range.end.getTime() - range.start.getTime();
  const end = new Date(range.start.getTime() - 1);
  const start = new Date(end.getTime() - ms);
  return { start, end };
}

export function defaultDateComparison(): DateComparisonValue {
  const range = computePresetRange('last_30d');
  return {
    range,
    rangePreset: 'last_30d',
    comparison: previousPeriod(range),
    comparisonPreset: 'previous_period',
  };
}
