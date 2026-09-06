import { Eyebrow, Panel } from '../ui/tac';
import { fmtMoney, type PublicKitRate } from '../../lib/mediaKit';
import { platformLabel } from './platformMeta';

/** Rate rows. Gold is spent on the price and nothing else. */
export function RateCard({ rates }: { rates: PublicKitRate[] }) {
  if (rates.length === 0) return null;
  return (
    <Panel className="p-5">
      <Eyebrow>RATES</Eyebrow>
      <ul className="mt-2">
        {rates.map((r, i) => (
          <li key={`${r.label}-${i}`} className="flex items-baseline justify-between gap-4 py-3 border-b border-border last:border-b-0">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{r.label}</div>
              <div className="t-micro mt-0.5 text-muted-foreground">
                {[r.platform ? platformLabel(r.platform).toUpperCase() : null, r.description?.toUpperCase()].filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="text-base font-bold tabular-nums shrink-0" style={{ color: 'var(--accent)' }}>
              {fmtMoney(r.price_cents, r.currency, r.price_prefix)}
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
