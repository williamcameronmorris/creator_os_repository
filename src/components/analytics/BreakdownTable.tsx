import { ArrowUp, ArrowDown } from 'lucide-react';
import type { BreakdownColumn, BreakdownRow } from './types';
import { formatDelta } from './format';

interface BreakdownTableProps {
  /** Header label for the leftmost column (e.g. 'Audience Metrics'). */
  rowHeader: string;
  /** Value column definitions. Most widgets pass one column ('Totals'); some
   *  (like Engagements per Post) pass two. */
  columns: BreakdownColumn[];
  rows: BreakdownRow[];
}

/**
 * The table that lives below a chart inside MetricWidget. Total row (isTotal=true)
 * renders semibold; per-platform sub-rows are regular weight. Missing values
 * render as an em-dash glyph — the standard data-table convention for null cells.
 */
export function BreakdownTable({ rowHeader, columns, rows }: BreakdownTableProps) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-t border-border">
          <th className="t-micro text-muted-foreground text-left py-3 px-4 font-normal">
            {rowHeader}
          </th>
          {columns.map((col) => (
            <th
              key={col.label}
              className="t-micro text-muted-foreground text-right py-3 px-4 font-normal"
            >
              {col.label}
            </th>
          ))}
          <th className="t-micro text-muted-foreground text-right py-3 px-4 font-normal w-24">
            % Change
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={`${row.label}-${idx}`} className="border-t border-border">
            <td className={`py-3 px-4 ${row.isTotal ? 'font-semibold' : ''}`}>{row.label}</td>
            {columns.map((col, colIdx) => (
              <td
                key={col.label}
                className={`py-3 px-4 text-right tabular-nums ${
                  row.isTotal ? 'font-semibold' : ''
                }`}
              >
                {row.values[colIdx] ?? '—'}
              </td>
            ))}
            <td className="py-3 px-4 text-right">
              <DeltaCell delta={row.delta} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DeltaCell({ delta }: { delta: BreakdownRow['delta'] }) {
  if (delta.direction === 'na') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (delta.direction === 'flat') {
    return <span className="text-muted-foreground t-micro">0%</span>;
  }
  const Icon = delta.direction === 'up' ? ArrowUp : ArrowDown;
  const tone = delta.direction === 'down' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className={`t-micro inline-flex items-center gap-1 justify-end ${tone}`}>
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      {formatDelta(delta)}
    </span>
  );
}
