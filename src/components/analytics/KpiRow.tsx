import { ArrowUp, ArrowDown } from 'lucide-react';
import type { KpiCardData } from './types';
import { formatDelta } from './format';

interface KpiRowProps {
  cards: KpiCardData[];
}

/**
 * Top-of-page KPI row. Four (or fewer) flat cards with a JetBrains Mono micro
 * label, a hero number, and a delta. The card flagged hero=true renders its
 * value in gold; everything else stays charcoal. No card backgrounds here on
 * purpose — the cream cards-on-cream-page lean is the Clio house style.
 */
export function KpiRow({ cards }: KpiRowProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
      {cards.map((card) => (
        <KpiCard key={card.label} card={card} />
      ))}
    </div>
  );
}

function KpiCard({ card }: { card: KpiCardData }) {
  const valueColor = card.hero ? 'text-accent' : 'text-foreground';
  return (
    <div className="bg-card p-5">
      <div className="t-micro text-muted-foreground mb-3">{card.label}</div>
      <div className={`text-3xl font-semibold tabular-nums ${valueColor}`}>{card.value}</div>
      <DeltaPill delta={card.delta} />
    </div>
  );
}

function DeltaPill({ delta }: { delta: KpiCardData['delta'] }) {
  if (delta.direction === 'na') {
    return <div className="t-micro text-muted-foreground mt-2">—</div>;
  }
  if (delta.direction === 'flat') {
    return <div className="t-micro text-muted-foreground mt-2">0%</div>;
  }
  const Icon = delta.direction === 'up' ? ArrowUp : ArrowDown;
  const tone = delta.direction === 'down' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <div className={`t-micro mt-2 inline-flex items-center gap-1 ${tone}`}>
      <Icon className="w-3 h-3" strokeWidth={2.5} />
      <span>{formatDelta(delta)}</span>
    </div>
  );
}
