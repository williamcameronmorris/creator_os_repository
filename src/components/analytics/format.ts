// Number formatters used across the analytics widgets. Centralized so the
// truncation rules ('2.4M' vs '2,450,968') stay consistent.

import type { MetricDelta } from './types';

/** Format a count as a localized integer string (e.g. 2450968 → '2,450,968'). */
export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  return Math.round(n).toLocaleString();
}

/** Format a percent value (0-100 range expected, e.g. 53.9 → '53.9%'). */
export function formatPercent(n: number | null | undefined, fractionDigits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  return `${n.toFixed(fractionDigits)}%`;
}

/** Compact format for KPI hero numbers when space is tight (e.g. 2450968 → '2.4M'). */
export function formatCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return 'N/A';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

/**
 * Compute a percent-change delta from two stock values (snapshot-as-stock math).
 * Returns null pct when comparison is unusable (zero base, missing data) so the
 * caller can render an em-dash placeholder.
 */
export function computeDelta(current: number | null, previous: number | null): MetricDelta {
  if (current === null || previous === null) return { pct: null, direction: 'na' };
  if (previous === 0) {
    if (current === 0) return { pct: 0, direction: 'flat' };
    return { pct: null, direction: 'na' };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  if (Math.abs(pct) < 0.05) return { pct: 0, direction: 'flat' };
  return { pct, direction: pct > 0 ? 'up' : 'down' };
}

/** Render a delta as the user-facing string (e.g. '+53.9%', '-16.1%', '—'). */
export function formatDelta(delta: MetricDelta): string {
  if (delta.pct === null) return '—';
  if (delta.direction === 'flat') return '0%';
  const sign = delta.pct > 0 ? '+' : '';
  return `${sign}${delta.pct.toFixed(1)}%`;
}
