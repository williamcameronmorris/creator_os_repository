import { Eyebrow, Panel, StatNumber } from '../ui/tac';
import { fmtCompact, fmtDate, fmtPct, type PublicKitPlatform } from '../../lib/mediaKit';
import { PLATFORM_ICONS, platformLabel } from './platformMeta';
import { AtSign } from 'lucide-react';

/**
 * One panel per platform. Followers carry the gold; everything else is ink.
 * A number that is manual or stale is dated rather than hidden: a brand will
 * not mind a date, and silently showing old numbers as current is the thing
 * that costs a creator the deal.
 */
export function StatGrid({ platforms }: { platforms: PublicKitPlatform[] }) {
  if (platforms.length === 0) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {platforms.map((p) => {
        const Icon = PLATFORM_ICONS[p.platform] ?? AtSign;
        const stats: { value: string; label: string; tone?: 'accent' }[] = [];
        if (p.followers != null) {
          stats.push({ value: fmtCompact(p.followers), label: p.platform === 'youtube' ? 'SUBSCRIBERS' : 'FOLLOWERS', tone: 'accent' });
        }
        if (p.growth_30d_pct != null) stats.push({ value: fmtPct(p.growth_30d_pct), label: '30-DAY GROWTH' });
        if (p.engagement_rate != null) stats.push({ value: `${p.engagement_rate}%`, label: 'ENGAGEMENT' });
        if (p.avg_views != null) stats.push({ value: fmtCompact(p.avg_views), label: 'MEDIAN VIEWS' });
        if (p.total_posts > 0) stats.push({ value: fmtCompact(p.total_posts), label: 'POSTS' });
        const note = p.followers_source === 'manual'
          ? `${p.platform === 'youtube' ? 'SUBSCRIBERS' : 'FOLLOWERS'} ENTERED${p.followers_as_of ? ` ${fmtDate(p.followers_as_of).toUpperCase()}` : ''}`
          : p.as_of ? `AS OF ${fmtDate(p.as_of).toUpperCase()}` : null;
        return (
          <Panel key={p.platform} className="p-5">
            <div className="flex items-center gap-2">
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--accent)' }} />
              <Eyebrow>
                {platformLabel(p.platform).toUpperCase()}
                {p.handle ? ` · @${p.handle}` : ''}
              </Eyebrow>
            </div>
            {stats.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-4 gap-y-5 mt-4">
                {stats.map((s) => (
                  <StatNumber key={s.label} value={s.value} label={s.label} tone={s.tone} />
                ))}
              </div>
            ) : (
              <p className="t-micro mt-4 text-muted-foreground">NUMBERS COMING SOON</p>
            )}
            {note && <p className="t-micro mt-4 text-muted-foreground">{note}</p>}
          </Panel>
        );
      })}
    </div>
  );
}
