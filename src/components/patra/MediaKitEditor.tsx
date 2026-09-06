import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, ArrowDown, Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useBrand } from '../../contexts/BrandContext';
import { useAccount } from '../../contexts/AccountContext';
import { Button } from '../ui/Button';
import { MediaKitLeads } from './MediaKitLeads';
import { platformLabel } from '../MediaKit/platformMeta';
import {
  centsToDollars, createKit, dollarsToCents, kitUrl, listRates, loadKit, normalizeConfigs, saveKit, saveRates,
  slugFromName, SLUG_RE, SYNCED_FOLLOWER_PLATFORMS, uploadKitAvatar,
  type ContactMode, type KitPlatformConfig, type MediaKitRateRow, type MediaKitRow,
} from '../../lib/mediaKitAdmin';

const ERROR_COLOR = '#B07050';
const field =
  'w-full px-3 py-2 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors';
const small = 'px-2 py-1 bg-background border border-border text-foreground text-sm focus:outline-none focus:border-accent transition-colors';
const PREFIXES = ['', 'from', 'starting at'];

/**
 * The owner's side of the media kit, one per brand. Everything on the public
 * page is set here; nothing is saved until SAVE, except publish, which is its
 * own switch so it cannot happen by accident while editing.
 */
export function MediaKitEditor() {
  const { user } = useAuth();
  const { activeBrand } = useBrand();
  const { accounts } = useAccount();
  const [kit, setKit] = useState<MediaKitRow | null | undefined>(undefined);
  const [draft, setDraft] = useState<MediaKitRow | null>(null);
  const [rates, setRates] = useState<MediaKitRateRow[]>([]);
  const [deletedRateIds, setDeletedRateIds] = useState<string[]>([]);
  const [newSlug, setNewSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const connectedPlatforms = useMemo(() => Array.from(new Set(accounts.map((a) => a.platform))), [accounts]);

  const load = useCallback(async () => {
    if (!activeBrand) return;
    setError('');
    try {
      const k = await loadKit(activeBrand.id);
      setKit(k);
      if (k) {
        const normalized = { ...k, platforms: normalizeConfigs(k.platforms, connectedPlatforms) };
        setDraft(normalized);
        setRates(await listRates(k.id));
        setDeletedRateIds([]);
      } else {
        setDraft(null);
        setNewSlug(slugFromName(activeBrand.name));
      }
    } catch (err) {
      setError((err as Error).message);
      setKit(null);
    }
  }, [activeBrand, connectedPlatforms]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 3000);
    return () => clearTimeout(t);
  }, [flash]);

  const set = <K extends keyof MediaKitRow>(k: K, v: MediaKitRow[K]) =>
    setDraft((d) => (d ? { ...d, [k]: v } : d));

  const setPlatform = (platform: string, patch: Partial<KitPlatformConfig>) =>
    setDraft((d) =>
      d ? { ...d, platforms: d.platforms.map((c) => (c.platform === platform ? { ...c, ...patch } : c)) } : d,
    );

  const handleCreate = async () => {
    if (!user || !activeBrand) return;
    if (!SLUG_RE.test(newSlug)) {
      setError('Links are 3 to 32 characters: letters, numbers, dashes or underscores.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await createKit(user.id, activeBrand, newSlug, normalizeConfigs([], connectedPlatforms));
      await load();
      setFlash('Media kit created. It stays a draft until you publish it.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!draft || !kit) return;
    if (!SLUG_RE.test(draft.slug)) {
      setError('Links are 3 to 32 characters: letters, numbers, dashes or underscores.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await saveKit(kit.id, {
        slug: draft.slug,
        display_name: draft.display_name?.trim() || null,
        headline: draft.headline?.trim() || null,
        bio: draft.bio?.trim() || null,
        avatar_url: draft.avatar_url?.trim() || null,
        location: draft.location?.trim() || null,
        website: draft.website?.trim() || null,
        platforms: draft.platforms,
        show_top_posts: draft.show_top_posts,
        top_posts_limit: Math.min(12, Math.max(1, Number(draft.top_posts_limit) || 6)),
        contact_mode: draft.contact_mode,
        contact_email: draft.contact_email?.trim() || null,
        contact_url: draft.contact_url?.trim() || null,
        contact_label: draft.contact_label?.trim() || 'Contact for collabs',
      });
      const savedRates = await saveRates(kit, rates, deletedRateIds);
      setKit(saved);
      setDraft({ ...saved, platforms: normalizeConfigs(saved.platforms, connectedPlatforms) });
      setRates(savedRates);
      setDeletedRateIds([]);
      setFlash('Saved.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async (next: boolean) => {
    if (!kit) return;
    setBusy(true);
    setError('');
    try {
      const saved = await saveKit(kit.id, { is_published: next });
      setKit(saved);
      setDraft((d) => (d ? { ...d, is_published: saved.is_published } : d));
      setFlash(next ? 'Published. Anyone with the link can see it now.' : 'Unpublished. The link shows a "not published" page.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleAvatarFile = async (file: File | undefined) => {
    if (!file || !user || !activeBrand) return;
    setUploading(true);
    setError('');
    try {
      const url = await uploadKitAvatar(user.id, activeBrand.id, file);
      set('avatar_url', url);
      setFlash('Image uploaded. Save to keep it.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const copyLink = async () => {
    if (!kit) return;
    try {
      await navigator.clipboard.writeText(kitUrl(kit.slug));
      setFlash('Link copied.');
    } catch {
      setFlash(kitUrl(kit.slug));
    }
  };

  // ── Rates ────────────────────────────────────────────────────────────────
  const setRate = (i: number, patch: Partial<MediaKitRateRow>) =>
    setRates((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRate = () =>
    setRates((rs) => [
      ...rs,
      { label: '', description: null, price_cents: null, price_prefix: null, currency: 'USD', platform: null, sort_order: rs.length, is_visible: true },
    ]);
  const removeRate = (i: number) =>
    setRates((rs) => {
      const r = rs[i];
      if (r.id) setDeletedRateIds((ids) => [...ids, r.id!]);
      return rs.filter((_, j) => j !== i);
    });
  const moveRate = (i: number, dir: -1 | 1) =>
    setRates((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  if (!activeBrand || kit === undefined) return <div className="py-16 text-center t-micro">LOADING&hellip;</div>;

  const errorBox = error && (
    <div className="p-3 border text-sm" style={{ borderColor: ERROR_COLOR, color: ERROR_COLOR }}>{error}</div>
  );
  const flashBox = flash && (
    <div className="border border-border px-4 py-3 t-micro text-foreground" style={{ background: 'var(--card)' }}>✓ {flash}</div>
  );

  // ── No kit yet ───────────────────────────────────────────────────────────
  if (!kit || !draft) {
    return (
      <div className="space-y-6">
        {errorBox}
        <div className="bg-card border border-border p-6 space-y-4">
          <div className="t-micro">01 · Your link</div>
          <p className="text-sm text-foreground max-w-prose">
            One page a brand can open with nothing but the link: your numbers, your rates, your best posts, and a form
            that lands here in Patra. It starts as a draft.
          </p>
          <div className="flex items-center gap-2">
            <span className="t-micro text-muted-foreground shrink-0">{kitUrl('').replace(/\/$/, '')}/</span>
            <input
              className={field}
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
              placeholder="your-name"
              maxLength={32}
              aria-label="Link"
            />
          </div>
          <Button onClick={handleCreate} disabled={busy}>{busy ? 'CREATING…' : 'CREATE MEDIA KIT'}</Button>
        </div>
      </div>
    );
  }

  const dirty = JSON.stringify({ ...draft, is_published: kit.is_published, updated_at: kit.updated_at }) !==
    JSON.stringify({ ...kit, platforms: normalizeConfigs(kit.platforms, connectedPlatforms) }) || deletedRateIds.length > 0;

  return (
    <div className="space-y-8">
      {flashBox}
      {errorBox}

      {/* ── Status strip ─────────────────────────────────────────────── */}
      <div className="bg-card border border-border p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="t-micro">{kit.is_published ? <span style={{ color: 'var(--accent)' }}>PUBLISHED</span> : 'DRAFT'} · {kit.view_count} {kit.view_count === 1 ? 'VIEW' : 'VIEWS'}</div>
          <div className="text-sm text-foreground truncate mt-0.5">{kitUrl(kit.slug)}</div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={copyLink} className="t-micro text-foreground hover:text-accent transition-colors flex items-center gap-1.5">
            <Copy className="w-3 h-3" /> COPY LINK
          </button>
          <a
            href={kitUrl(kit.slug)}
            target="_blank"
            rel="noopener noreferrer"
            className="t-micro text-foreground hover:text-accent transition-colors flex items-center gap-1.5"
          >
            <ExternalLink className="w-3 h-3" /> OPEN
          </a>
          <Button size="sm" variant={kit.is_published ? 'secondary' : 'primary'} onClick={() => handlePublish(!kit.is_published)} disabled={busy}>
            {kit.is_published ? 'UNPUBLISH' : 'PUBLISH'}
          </Button>
        </div>
      </div>

      {/* ── 01 Link + profile ────────────────────────────────────────── */}
      <section className="bg-card border border-border p-6 space-y-4">
        <div className="t-micro">01 · Who this is</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="t-micro block mb-1.5">Link</span>
            <div className="flex items-center gap-2">
              <span className="t-micro text-muted-foreground shrink-0">/kit/</span>
              <input className={field} value={draft.slug} onChange={(e) => set('slug', e.target.value.toLowerCase())} maxLength={32} />
            </div>
          </label>
          <label className="block">
            <span className="t-micro block mb-1.5">Name</span>
            <input className={field} value={draft.display_name ?? ''} onChange={(e) => set('display_name', e.target.value)} maxLength={80} />
          </label>
          <label className="block sm:col-span-2">
            <span className="t-micro block mb-1.5">Headline</span>
            <input className={field} value={draft.headline ?? ''} onChange={(e) => set('headline', e.target.value)} placeholder="One line under your name" maxLength={140} />
          </label>
          <label className="block sm:col-span-2">
            <span className="t-micro block mb-1.5">Bio</span>
            <textarea className={`${field} min-h-[90px]`} value={draft.bio ?? ''} onChange={(e) => set('bio', e.target.value)} maxLength={600} />
          </label>
          <label className="block">
            <span className="t-micro block mb-1.5">Location</span>
            <input className={field} value={draft.location ?? ''} onChange={(e) => set('location', e.target.value)} maxLength={80} />
          </label>
          <label className="block">
            <span className="t-micro block mb-1.5">Website</span>
            <input className={field} value={draft.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://" maxLength={200} />
          </label>
          <div className="sm:col-span-2">
            <span className="t-micro block mb-1.5">Image</span>
            <div className="flex items-center gap-4">
              {draft.avatar_url ? (
                <img src={draft.avatar_url} alt="" className="w-16 h-16 object-cover border border-border bg-background" />
              ) : (
                <div className="w-16 h-16 border border-border flex items-center justify-center t-micro text-muted-foreground">NONE</div>
              )}
              <div className="flex flex-col gap-1.5">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="t-micro text-foreground hover:text-accent transition-colors text-left disabled:opacity-50"
                >
                  {uploading ? 'UPLOADING…' : draft.avatar_url ? 'REPLACE IMAGE' : 'UPLOAD IMAGE'}
                </button>
                {draft.avatar_url && (
                  <button type="button" onClick={() => set('avatar_url', null)} className="t-micro text-muted-foreground hover:text-foreground transition-colors text-left">
                    REMOVE
                  </button>
                )}
                <span className="t-micro text-muted-foreground">A logo for a brand, a headshot for a person. Square works best.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 02 Platforms ─────────────────────────────────────────────── */}
      <section className="bg-card border border-border p-6 space-y-4">
        <div className="t-micro">02 · Platforms and numbers</div>
        <p className="t-micro text-muted-foreground">
          Follower and post counts sync for {Array.from(SYNCED_FOLLOWER_PLATFORMS).map(platformLabel).join(' and ')} on your default brand. For the others, type the numbers from the app itself; the page shows the date you entered them, and leaves a stat out rather than guess.
        </p>
        <div>
          {draft.platforms.map((c) => {
            const synced = SYNCED_FOLLOWER_PLATFORMS.has(c.platform) && activeBrand.is_default;
            return (
              <div key={c.platform} className="py-3 border-b border-border last:border-b-0">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                  <label className="flex items-center gap-2 min-w-[140px]">
                    <input type="checkbox" checked={c.visible} onChange={(e) => setPlatform(c.platform, { visible: e.target.checked })} />
                    <span className="t-micro text-foreground">{platformLabel(c.platform).toUpperCase()}</span>
                  </label>
                  {c.visible && (
                    <>
                      {([
                        ['show_followers', c.platform === 'youtube' ? 'Subscribers' : 'Followers'],
                        ['show_growth', '30-day growth'],
                        ['show_engagement', 'Engagement'],
                        ['show_avg_views', 'Median views'],
                      ] as const).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-1.5">
                          <input type="checkbox" checked={c[k]} onChange={(e) => setPlatform(c.platform, { [k]: e.target.checked })} />
                          <span className="t-micro text-muted-foreground">{label}</span>
                        </label>
                      ))}
                      {!synced && (
                        <>
                          {c.show_followers && (
                            <label className="flex items-center gap-2">
                              <span className="t-micro text-muted-foreground">{c.platform === 'youtube' ? 'Subscribers' : 'Followers'} =</span>
                              <input
                                type="number"
                                min={0}
                                className={`${small} w-28`}
                                value={c.followers_override ?? ''}
                                onChange={(e) =>
                                  setPlatform(c.platform, {
                                    followers_override: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))),
                                    followers_override_at: new Date().toISOString(),
                                  })
                                }
                                placeholder="type it"
                              />
                            </label>
                          )}
                          <label className="flex items-center gap-2">
                            <span className="t-micro text-muted-foreground">Posts =</span>
                            <input
                              type="number"
                              min={0}
                              className={`${small} w-24`}
                              value={c.posts_override ?? ''}
                              onChange={(e) =>
                                setPlatform(c.platform, {
                                  posts_override: e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))),
                                })
                              }
                              placeholder="type it"
                            />
                          </label>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-5 pt-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={draft.show_top_posts} onChange={(e) => set('show_top_posts', e.target.checked)} />
            <span className="t-micro text-foreground">SHOW TOP POSTS</span>
          </label>
          {draft.show_top_posts && (
            <label className="flex items-center gap-2">
              <span className="t-micro text-muted-foreground">How many</span>
              <input type="number" min={1} max={12} className={`${small} w-16`} value={draft.top_posts_limit} onChange={(e) => set('top_posts_limit', Number(e.target.value))} />
            </label>
          )}
        </div>
      </section>

      {/* ── 03 Rates ─────────────────────────────────────────────────── */}
      <section className="bg-card border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="t-micro">03 · Rate card</div>
          <button onClick={addRate} className="t-micro text-foreground hover:text-accent transition-colors flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> ADD RATE
          </button>
        </div>
        {rates.length === 0 ? (
          <p className="t-micro text-muted-foreground">NO RATES YET. WITHOUT ANY, THE PAGE SIMPLY SKIPS THE RATE CARD.</p>
        ) : (
          <div className="space-y-3">
            {rates.map((r, i) => (
              <div key={r.id ?? `new-${i}`} className="grid gap-2 items-center" style={{ gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1.4fr) 110px 120px 110px auto' }}>
                <input className={small} value={r.label} onChange={(e) => setRate(i, { label: e.target.value })} placeholder="IG Reel" maxLength={60} aria-label="Rate label" />
                <input className={small} value={r.description ?? ''} onChange={(e) => setRate(i, { description: e.target.value })} placeholder="3 stories, 24h" maxLength={120} aria-label="Rate description" />
                <select className={small} value={r.price_prefix ?? ''} onChange={(e) => setRate(i, { price_prefix: e.target.value || null })} aria-label="Price prefix">
                  {PREFIXES.map((p) => <option key={p} value={p}>{p || 'exact'}</option>)}
                </select>
                <input
                  className={small}
                  inputMode="decimal"
                  defaultValue={centsToDollars(r.price_cents)}
                  onBlur={(e) => setRate(i, { price_cents: dollarsToCents(e.target.value) })}
                  placeholder="$ (blank = Inquire)"
                  aria-label="Price"
                />
                <select className={small} value={r.platform ?? ''} onChange={(e) => setRate(i, { platform: e.target.value || null })} aria-label="Platform">
                  <option value="">any</option>
                  {draft.platforms.filter((c) => c.visible).map((c) => <option key={c.platform} value={c.platform}>{platformLabel(c.platform)}</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1" title="Show on the page">
                    <input type="checkbox" checked={r.is_visible} onChange={(e) => setRate(i, { is_visible: e.target.checked })} />
                  </label>
                  <button onClick={() => moveRate(i, -1)} className="text-muted-foreground hover:text-foreground" aria-label="Move up"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button onClick={() => moveRate(i, 1)} className="text-muted-foreground hover:text-foreground" aria-label="Move down"><ArrowDown className="w-3.5 h-3.5" /></button>
                  <button onClick={() => removeRate(i)} className="text-muted-foreground hover:text-foreground" aria-label="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── 04 Contact ───────────────────────────────────────────────── */}
      <section className="bg-card border border-border p-6 space-y-4">
        <div className="t-micro">04 · Contact</div>
        <div className="flex flex-wrap gap-5">
          {([['form', 'Form (lands in Patra)'], ['email', 'Email me'], ['link', 'A link']] as [ContactMode, string][]).map(([m, label]) => (
            <label key={m} className="flex items-center gap-2">
              <input type="radio" name="contact_mode" checked={draft.contact_mode === m} onChange={() => set('contact_mode', m)} />
              <span className="t-micro text-foreground">{label.toUpperCase()}</span>
            </label>
          ))}
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block">
            <span className="t-micro block mb-1.5">Button label</span>
            <input className={field} value={draft.contact_label} onChange={(e) => set('contact_label', e.target.value)} maxLength={60} />
          </label>
          {draft.contact_mode === 'email' && (
            <label className="block">
              <span className="t-micro block mb-1.5">Email</span>
              <input className={field} type="email" value={draft.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} maxLength={200} />
            </label>
          )}
          {draft.contact_mode === 'link' && (
            <label className="block">
              <span className="t-micro block mb-1.5">URL</span>
              <input className={field} value={draft.contact_url ?? ''} onChange={(e) => set('contact_url', e.target.value)} placeholder="https://" maxLength={300} />
            </label>
          )}
        </div>
      </section>

      <div className="flex items-center gap-4">
        <Button onClick={handleSave} disabled={busy || !dirty}>{busy ? 'SAVING…' : 'SAVE'}</Button>
        {dirty && !busy && <span className="t-micro text-muted-foreground">UNSAVED CHANGES</span>}
      </div>

      {/* ── 05 Leads ─────────────────────────────────────────────────── */}
      <section className="bg-card border border-border p-6 space-y-2">
        <div className="t-micro">05 · Enquiries</div>
        <MediaKitLeads />
      </section>
    </div>
  );
}
