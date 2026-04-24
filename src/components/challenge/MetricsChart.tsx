import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { ChallengeMetricSnapshot, MetricDefinition } from '../../hooks/useChallenge';

interface MetricsChartProps {
  metrics: ChallengeMetricSnapshot[]; // includes baseline (day 0) and any checkpoints
  metricDefinitions: MetricDefinition[];
}

// Industrial editorial-friendly stroke colors. We don't pull theme tokens at runtime
// because Recharts requires real CSS color strings at render time.
const STROKES = ['#1A1816', '#C8A24B', '#8A857C', '#3C3933', '#B4573E'];

/**
 * MetricsChart — line chart of each metric value across day 0 (baseline)
 * through any captured checkpoints (7, 14, 21, 30).
 *
 * Hidden if the user has no baseline yet.
 */
export function MetricsChart({ metrics, metricDefinitions }: MetricsChartProps) {
  if (!metrics.length || !metricDefinitions.length) return null;

  // Sort snapshots by day ascending
  const sorted = [...metrics].sort((a, b) => a.captured_at_day - b.captured_at_day);

  // Build a row per snapshot: { day: 0, [metricKey]: value, ... }
  const data = sorted.map((snap) => {
    const row: Record<string, number | string> = { day: snap.captured_at_day };
    for (const def of metricDefinitions) {
      const v = snap.values?.[def.key];
      if (typeof v === 'number') row[def.key] = v;
    }
    return row;
  });

  const showChart = data.length >= 2; // need baseline + at least one checkpoint

  if (!showChart) {
    return (
      <div className="card-industrial p-6">
        <div className="t-micro text-muted-foreground mb-2">Progress chart</div>
        <p className="t-body text-muted-foreground">
          Hit your first checkpoint (day 7) to start seeing your metrics chart.
        </p>
      </div>
    );
  }

  return (
    <div className="card-industrial p-6">
      <div className="flex items-baseline justify-between mb-4">
        <div className="t-micro text-muted-foreground">Metrics over time</div>
        <div className="t-micro text-muted-foreground">Baseline → Day {data[data.length - 1].day}</div>
      </div>
      <div style={{ width: '100%', height: 320 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="#D9D2C4" strokeDasharray="0" vertical={false} />
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, 30]}
              ticks={[0, 7, 14, 21, 30]}
              tickFormatter={(v) => (v === 0 ? 'Base' : `D${v}`)}
              stroke="#8A857C"
              tick={{ fill: '#8A857C', fontSize: 11, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
            />
            <YAxis
              stroke="#8A857C"
              tick={{ fill: '#8A857C', fontSize: 11, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}
              tickFormatter={(v) => Intl.NumberFormat('en', { notation: 'compact' }).format(v as number)}
              width={48}
            />
            <Tooltip
              contentStyle={{
                background: '#FBF9F4',
                border: '1px solid #D9D2C4',
                borderRadius: 0,
                fontFamily: 'Switzer, system-ui, sans-serif',
                fontSize: 13,
              }}
              labelFormatter={(v) => (v === 0 ? 'Baseline' : `Day ${v}`)}
              formatter={(value: any, name: string) => {
                const def = metricDefinitions.find((d) => d.key === name);
                return [Number(value).toLocaleString(), def?.label || name];
              }}
            />
            <Legend
              wrapperStyle={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase' }}
              formatter={(value: string) => {
                const def = metricDefinitions.find((d) => d.key === value);
                return def?.label || value;
              }}
            />
            {metricDefinitions.map((def, i) => (
              <Line
                key={def.key}
                type="monotone"
                dataKey={def.key}
                stroke={STROKES[i % STROKES.length]}
                strokeWidth={1.5}
                dot={{ r: 3, strokeWidth: 1 }}
                activeDot={{ r: 5 }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
