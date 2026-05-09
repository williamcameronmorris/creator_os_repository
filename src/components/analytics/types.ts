// Shared types for the analytics primitive components. The shape mirrors how
// Sprout Social structures their per-section breakdowns: a chart paired with N
// tables, each table having a label column + N value columns + a delta column.
//
// Kept deliberately generic: a single MetricWidget can render audience growth
// (line chart + one table), engagements (area chart + one table with two value
// columns), or message volume (dual-line chart + two stacked tables).

export type Platform = 'instagram' | 'tiktok' | 'youtube';

export type DeltaDirection = 'up' | 'down' | 'flat' | 'na';

export interface MetricDelta {
  /** Numeric percent change vs comparison period. null when no comparison data. */
  pct: number | null;
  direction: DeltaDirection;
}

export interface KpiCardData {
  label: string;
  /** Pre-formatted value string (e.g. '2,450,968', '5%', 'N/A'). */
  value: string;
  delta: MetricDelta;
  /** When true, the value renders in gold. Reserve for the hero KPI per row. */
  hero?: boolean;
}

export interface BreakdownRow {
  /** Row label. The total row uses something like 'Net Audience Growth'; per-platform
   *  rows use platform-native names like 'Instagram Net Follower Growth'. */
  label: string;
  /** Pre-formatted value strings, one per column defined in BreakdownColumn[]. */
  values: (string | null)[];
  delta: MetricDelta;
  /** When true, renders the row in semibold (the aggregate row). */
  isTotal?: boolean;
}

export interface BreakdownColumn {
  /** Column header label. Most widgets use 'Totals'; engagement rate uses 'Rate'. */
  label: string;
}

export interface ChartSeries {
  /** Data points; x is an ISO date string or label, y is the numeric value. */
  data: Array<{ x: string; y: number }>;
  /** Display name (used in legends and tooltips). */
  name: string;
  /** Stroke/fill color. Defaults to chart-1 (charcoal). */
  color?: string;
  /** 'line' = stroke only; 'area' = stroke + fill; defaults to area. */
  variant?: 'line' | 'area';
}
