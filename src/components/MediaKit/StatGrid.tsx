import { Eyebrow, Panel, StatNumber } from '../ui/tac';
import { fmtCompact, fmtDate, fmtPct, type PublicKitPlatform } from '../../lib/mediaKit';
import { PLATFORM_ICONS, platformLabel } from './platformMeta';
import { AtSign } from 'lucide-react';

/** median_views is the current name; avg_views is the old one the function
 *  still sends alongside it. Read both so a page served from cache mid-deploy
 *  does not blank the number out. */
function medianViews(p: PublicKitPlatform): number | null {
  return p.median_views ?? p.avg_views ?? null;
}

/**
 * One panel per platform. Followers carry the gold; everything else is ink.
 * A number that is manual or stale is dated rather than hidden: a brand will
 * not mind a date, and silently showing old numbers as current is the thing
 * that costs a creator the deal.
 *
 * Views sit side by side across platforms here, and each platform counts a
 * view differently (a TikTok view and a YouTube view are not the same event),
 * so a one-line note says so rather than letting a brand read the panels as a
 * league table.
 */
export function StatGrid({ platforms }: { platforms: PublicKitPlatform[] }) {
  if (platforms.length === 0) return null;
  const platformsWithViews = platforms.filter((p) => medianViews(p) != null).length;
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
        const med = medianViews(p);
        if (med != null) stats.push({ value: fmtCompact(med), label: 'MEDIAN VIEWS' });
        if (p.total_posts != null && p.total_posts > 0) stats.push({ value: fmtCompact(p.total_posts), label: 'POSTS' });
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
      {platformsWithViews > 1 && (
        <p className="sm:col-span-2 text-sm text-muted-foreground">
          Each platform counts a view its own way, so view numbers are not
          comparable between platforms.
        </p>
      )}
    </div>
  );
}
