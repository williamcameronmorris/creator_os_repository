import type { ReactNode } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { ChartSeries } from './types';

interface MetricWidgetProps {
  title: string;
  subtitle?: string;
  /** Optional right-aligned action (gear icon, info, etc). */
  action?: ReactNode;
  /** One or more time series. Multi-series renders all on the same chart. */
  series: ChartSeries[];
  /** Tables stacked beneath the chart. Pass [] to render chart-only. */
  children?: ReactNode;
  /** Height of the chart in px. Defaults to 280. */
  chartHeight?: number;
}

/**
 * The canonical analytics section: header (title + subtitle + optional action),
 * a chart, then any number of breakdown tables stacked underneath.
 *
 * Charts pull from the chart-* CSS variables (charcoal grayscale + gold). Avoid
 * passing platform-coded colors here on purpose — Clio's visual system is
 * monochrome-with-one-accent, not Sprout's pink/teal/purple.
 */
export function MetricWidget({
  title,
  subtitle,
  action,
  series,
  children,
  chartHeight = 280,
}: MetricWidgetProps) {
  // Pivot multi-series data into a single recharts-compatible array.
  // Assumes all series share the same x-axis labels.
  const merged = mergeSeries(series);
  const isLineOnly = series.every((s) => s.variant === 'line');

  return (
    <section className="border border-border bg-card">
      <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>

      {merged.length > 0 && (
        <div className="px-5 pb-4" style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            {isLineOnly ? (
              <LineChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)' }} />
                {series.map((s, idx) => (
                  <Line
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={s.color ?? defaultColor(idx)}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            ) : (
              <AreaChart data={merged} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="x"
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                />
                <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: 'var(--border)' }} />
                {series.map((s, idx) => (
                  <Area
                    key={s.name}
                    type="monotone"
                    dataKey={s.name}
                    stroke={s.color ?? defaultColor(idx)}
                    fill={s.color ?? defaultColor(idx)}
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {children}
    </section>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 0,
  fontSize: 12,
  color: 'var(--popover-foreground)',
};

function defaultColor(idx: number): string {
  // Charcoal first, then darker accent variants. Gold (chart-4) is reserved
  // for the hero series — pass it explicitly via series.color when wanted.
  const palette = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-5)'];
  return palette[idx % palette.length];
}

function mergeSeries(series: ChartSeries[]): Array<Record<string, string | number>> {
  if (series.length === 0) return [];
  const xMap = new Map<string, Record<string, string | number>>();
  for (const s of series) {
    for (const point of s.data) {
      const row = xMap.get(point.x) ?? { x: point.x };
      row[s.name] = point.y;
      xMap.set(point.x, row);
    }
  }
  return Array.from(xMap.values());
}
