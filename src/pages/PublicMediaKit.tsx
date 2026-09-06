import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AtSign } from 'lucide-react';
import { Eyebrow, StatNumber, Takeaway } from '../components/ui/tac';
import { StatGrid } from '../components/MediaKit/StatGrid';
import { RateCard } from '../components/MediaKit/RateCard';
import { PostGrid } from '../components/MediaKit/PostGrid';
import { ContactForm } from '../components/MediaKit/ContactForm';
import { PLATFORM_ICONS } from '../components/MediaKit/platformMeta';
import { fetchPublicKit, fmtCompact, fmtDate, type PublicKit } from '../lib/mediaKit';

/**
 * /kit/:slug — the public media kit.
 *
 * No <Layout>, no bottom nav, no auth or brand context: a brand opens this
 * from a DM with nothing but the link. Always cream, whatever theme the
 * viewer's own session uses, because this is the product layer of the brand
 * system, not the app's dark room.
 */
export function PublicMediaKit() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [kit, setKit] = useState<PublicKit | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = document.documentElement;
    const hadDark = el.classList.contains('dark');
    el.classList.remove('dark');
    return () => {
      if (hadDark) el.classList.add('dark');
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setKit(undefined);
    setError(null);
    fetchPublicKit(slug)
      .then((k) => {
        if (cancelled) return;
        setKit(k);
        if (k?.kit.display_name) document.title = `${k.kit.display_name} · Media kit`;
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 space-y-8">{children}</div>
    </main>
  );

  if (error) {
    return shell(<p className="t-micro text-muted-foreground">{error.toUpperCase()}</p>);
  }
  if (kit === undefined) {
    return shell(<p className="t-micro text-muted-foreground">LOADING…</p>);
  }
  if (kit === null) {
    return shell(
      <div className="space-y-3">
        <Eyebrow>MEDIA KIT</Eyebrow>
        <h1 className="text-2xl font-bold tracking-tight">This media kit isn’t published.</h1>
        <p className="text-sm text-muted-foreground">Check the link, or ask the creator for a fresh one.</p>
      </div>,
    );
  }

  const k = kit.kit;
  const meta = [k.location, k.website?.replace(/^https?:\/\//, '').replace(/\/+$/, '')].filter(Boolean).join(' · ');

  return shell(
    <>
      <header className="flex items-start gap-5">
        {k.avatar_url && (
          <img
            src={k.avatar_url}
            alt=""
            className="w-20 h-20 sm:w-24 sm:h-24 object-cover border border-border shrink-0"
          />
        )}
        <div className="min-w-0">
          <Eyebrow>MEDIA KIT</Eyebrow>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight mt-1">
            {k.display_name ?? slug}
          </h1>
          {k.headline && <p className="text-sm text-muted-foreground mt-1">{k.headline}</p>}
          {meta && <p className="t-micro mt-2 text-muted-foreground">{meta.toUpperCase()}</p>}
        </div>
      </header>

      {k.bio && <p className="text-sm leading-relaxed max-w-prose">{k.bio}</p>}

      {kit.platforms.length > 0 && (
        <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
          {kit.totals.followers > 0 && (
            <StatNumber value={fmtCompact(kit.totals.followers)} label="TOTAL FOLLOWERS" tone="accent" />
          )}
          <ul className="flex flex-wrap gap-2">
            {kit.platforms.map((p) => {
              const Icon = PLATFORM_ICONS[p.platform] ?? AtSign;
              const chip = (
                <span className="inline-flex items-center gap-1.5 h-7 px-2 border border-border t-micro text-foreground">
                  <Icon className="w-3.5 h-3.5" />
                  {p.handle ? `@${p.handle}` : p.platform.toUpperCase()}
                  {p.followers != null && <span className="text-muted-foreground">· {fmtCompact(p.followers)}</span>}
                </span>
              );
              return (
                <li key={p.platform}>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{chip}</a>
                  ) : chip}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <StatGrid platforms={kit.platforms} />

      {kit.stats_stale && kit.stats_as_of && (
        <Takeaway>Numbers on this page were last updated {fmtDate(kit.stats_as_of)}.</Takeaway>
      )}

      <RateCard rates={kit.rates} />
      <PostGrid posts={kit.top_posts} />
      <ContactForm slug={slug} kit={k} />

      <footer className="pt-6 border-t border-border">
        <p className="t-micro text-muted-foreground">MADE WITH CLIOPATRA</p>
      </footer>
    </>,
  );
}
