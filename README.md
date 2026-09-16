# Cliopatra Social

A publishing and analytics app for creators. You connect your social accounts,
write and schedule posts across them, and read back how they performed. An AI
layer trained on your own posts drafts captions, scripts and ideas in your
voice, and a Patra section handles the brand-deal side — quotes, deals,
invoices and a public media kit at `/kit/:slug`.

Accounts are scoped by brand: one login can hold several brands, and the
connected accounts, posts, analytics and voice profile all belong to a brand
rather than to the user directly.

## Stack

React 18 with TypeScript, built by Vite and styled with Tailwind. Routing is
react-router-dom, charts are recharts. Supabase provides Postgres, auth,
storage and the edge functions. The web app deploys to Vercel; Capacitor wraps
the same `dist/` output as the iOS and Android shells. Posting to the platforms
goes through Post For Me, with direct Meta, Threads and YouTube integrations
for auth and metrics.

## Running it locally

Node 20 or newer.

```
npm ci
cp .env.example .env
npm run dev
```

Fill in at least `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before the
app will start; the rest of the variables only gate the platform connect
buttons. `npm run typecheck`, `npm test` and `npm run build` are the three
checks CI runs. For the native shells, `npm run cap:ios` or `npm run cap:android`
builds the web bundle, syncs it and opens the platform project.

## Environment variables

These are the frontend variables, read through `import.meta.env`. Full
descriptions are in `.env.example`.

| Variable | Needed for |
| --- | --- |
| `VITE_SUPABASE_URL` | Everything — the client and every edge-function call |
| `VITE_SUPABASE_ANON_KEY` | Everything |
| `VITE_META_APP_ID` | Connecting Instagram and Facebook |
| `VITE_META_REDIRECT_URI` | Overriding the Meta callback origin (optional) |
| `VITE_THREADS_APP_ID` | Connecting Threads |
| `VITE_THREADS_REDIRECT_URI` | The Threads callback in the Capacitor webview (optional) |
| `VITE_YOUTUBE_CLIENT_ID` | Connecting YouTube |

Server-side secrets are not in this list. They are set on the Supabase project
(`supabase secrets set`, or the dashboard), and `.env.example` records which
ones each function needs.

## Deploying

Vercel builds `main` with `npm run build` and serves `dist/`. `vercel.json`
holds the SPA rewrite, the security headers and the `/kit/:slug` rewrite that
routes public media kits through `api/kit.ts` so link previews get real
metadata.

Edge functions live in `supabase/functions/`, one directory per function, with
shared helpers in `_shared/`. They deploy separately from the web app and do
not pick up changes on a Vercel deploy:

```
supabase functions deploy <name>
```

Deploy with the Supabase CLI rather than through an MCP tool — a function is
whatever was last deployed, so a merged change is inert until you run this.
Database migrations are in `supabase/migrations/`.
