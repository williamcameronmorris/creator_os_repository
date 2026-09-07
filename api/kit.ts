import { buildMeta, injectHead, SLUG_RE, type KitPayloadLite } from './_meta';

/**
 * /kit/:slug — the same app shell, with the kit's link-preview tags.
 *
 * The app is a single-page build, so a pasted link showed a bare "Cliopatra
 * Social" card with no image. vercel.json rewrites /kit/:slug here; this
 * returns index.html with the kit's title, description and image injected
 * into <head>. Humans get the app, which boots and renders the kit as
 * before. Crawlers (iMessage, Slack, WhatsApp, X, LinkedIn) read the tags.
 *
 * Unknown or unpublished slug: the untouched shell, so the app shows its own
 * "not published" page. Any failure: the untouched shell. The preview is a
 * nicety and must never be the reason the page does not load.
 */

interface Req {
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  url?: string;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  send(body: string): void;
}

function header(req: Req, name: string): string {
  const v = req.headers[name];
  return (Array.isArray(v) ? v[0] : v) ?? '';
}

export default async function handler(req: Req, res: Res): Promise<void> {
  const raw = req.query?.slug;
  const slug = (Array.isArray(raw) ? raw[0] : raw) ?? '';
  const proto = header(req, 'x-forwarded-proto') || 'https';
  const host = header(req, 'x-forwarded-host') || header(req, 'host');
  const origin = `${proto}://${host}`;
  const pageUrl = `${origin}/kit/${encodeURIComponent(slug)}`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  let shell = '';
  try {
    const r = await fetch(`${origin}/index.html`, { headers: { accept: 'text/html' } });
    shell = await r.text();
  } catch {
    res.status(500).send('<!doctype html><title>Cliopatra</title>');
    return;
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!SLUG_RE.test(slug) || !supabaseUrl) {
    res.status(200).send(shell);
    return;
  }

  try {
    const r = await fetch(`${supabaseUrl}/functions/v1/public-media-kit?slug=${encodeURIComponent(slug)}`, {
      headers: { accept: 'application/json' },
    });
    if (!r.ok) {
      res.status(200).send(shell);
      return;
    }
    const payload = (await r.json()) as KitPayloadLite;
    res.status(200).send(injectHead(shell, buildMeta(payload, pageUrl)));
  } catch {
    res.status(200).send(shell);
  }
}
