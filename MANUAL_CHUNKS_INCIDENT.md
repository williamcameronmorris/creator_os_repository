# Incident: iOS/Android launch prep session broke web production

**Session goal:** App Store readiness pass on 2026-04-30 → 2026-05-01. Four commits landed on `main` overnight as part of mobile-launch prep + backend hardening.

**Outcome:** Three of the four commits were fine. The fourth shipped a real bug straight to production. Cam loaded creatorcommand.app the next morning and got a blank screen.

## The four commits

| SHA | What it did | Status |
|---|---|---|
| `2e66416` | Deleted `src/_archived/` + pre-Studio component duplicates | ✅ clean |
| `0ca556b` | Added JWT verification to 9 user-data + AI edge functions | ✅ code clean — but inert until each function is redeployed (see "Pending follow-up" below) |
| `23833e3` | Tightened `capacitor.config.ts` and `Info.plist` for App Store review | ✅ clean |
| `04a461b` | Rewrote `vite.config.ts` `manualChunks` from object form to function form | ❌ **broke production** |

## What broke

After Vercel auto-deployed `04a461b`, the live app showed a blank screen with this in the console:

```
Uncaught TypeError: Cannot read properties of undefined (reading 'forwardRef')
    at vendor-charts-D3jdEaao.js:1:9209
```

`vendor-charts` is the chunk recharts ended up in. Recharts internally calls `React.forwardRef`, but in the new chunking layout, `React` was undefined when that chunk evaluated.

## Why it happened

The commit was triggered by a real local-build failure during the Capacitor work:

```
TypeError: manualChunks is not a function
  at .../rolldown/dist/shared/rolldown-build-DSxL8qiP.mjs:3109:10
```

That error is genuine — the lockfile resolves Vite to **8.0.10** (despite `package.json` saying `^5.4.2`), and Vite 8 / Rolldown dropped support for the object form of `build.rollupOptions.output.manualChunks`. So the build problem you were trying to solve was real.

The **fix** was wrong.

The session rewrote `manualChunks` as a function that grouped by `node_modules/<package>/` path substrings:

```ts
manualChunks(id: string) {
  if (id.includes('node_modules/react/') || ...) return 'vendor-react';
  if (id.includes('node_modules/recharts/') || id.includes('node_modules/d3-')) return 'vendor-charts';
  // ...
}
```

That builds clean. But the path-substring approach silently misses recharts' transitive React dependencies — `react-is`, `react-smooth`, `react-transition-group` — none of which match the `node_modules/react/` rule (different package names). Under Rolldown's stricter ESM resolution, those scattered into chunks that didn't share a graph with `vendor-react`, leaving `React` undefined when `vendor-charts` evaluated `React.forwardRef`.

The **object form** had implicitly pulled the dep graph along with the entry. The function form, applied per-module-id, doesn't — you have to enumerate every transitive package yourself.

## How it was fixed

Reverting the commit re-broke the build (object form fails on Vite 8). The clean fix was to drop `manualChunks` entirely and let Rolldown auto-chunk. The resulting single bundle is 288KB / 88KB gzipped — well under the 600KB warning, so manual splitting wasn't earning anything yet.

Final `vite.config.ts` build block:

```ts
build: {
  target: 'safari14',
  chunkSizeWarningLimit: 600,
},
```

Shipped as `04ae8bf` on `main`. Live site now mounts cleanly.

## Pending follow-up from this session

The JWT security fix in `0ca556b` is **inert until each of the 9 edge functions is redeployed** — code on `main` doesn't matter; the gateway runs whatever was last `supabase functions deploy`d. From `MOBILE_LAUNCH_TODO.md`:

```bash
for fn in ask-copilot generate-ideas generate-script generate-recommendations \
          generate-analysis analyze-captions repurpose-content fetch-comments \
          sync-inspiration-library publish-scheduled-posts \
          generate-insights delete-account; do
  supabase functions deploy "$fn" --no-verify-jwt
done
```

This is a Cam action, not a code action. Until it's done, the security fix is paper.

## Lessons for next time

1. **`npm run build` succeeding is not the same as the bundle working.** When you split chunks across an ESM boundary, also run `npx vite preview` (or actually load `dist/index.html`) before pushing. This recharts/forwardRef class of error only surfaces at module-evaluation time, not at build time.

2. **Cite verifications in commit messages, not just conclusions.** The commit body asserted "the lockfile resolves vite to ^8.0.10" without saying how that was checked. The next session reading the message has no way to tell "I ran `npx vite --version` and got 8.0.10" from "I inferred this from the error text." Cite the command. (The lockfile entry a quick `grep '"vite"' package-lock.json` returns is a transitive resolution pointing at 5.4.x — easy to misread without `npx vite --version` or `grep -A1 '"node_modules/vite":'`.)

3. **`manualChunks` with recharts is a known sharp edge.** If chunking is ever re-added: either co-locate `recharts` + `react-is` + `react-smooth` + `react-transition-group` + `react` + `react-dom` all in one chunk, or use Rolldown's package-name helpers instead of path substring checks. Substring rules miss transitive deps.

4. **The Capacitor pipeline doesn't require manual chunks.** The commit body claimed this "unblocks the iOS/Android Capacitor build pipeline." It doesn't — Capacitor wraps whatever `dist/` Vite emits, regardless of chunking strategy. The web-bundle work and the native-build work were unrelated.

5. **Confirm the user-visible site after pushing build-config changes.** A green CI run only proves the build completed. It doesn't prove the deployed page renders. After pushing anything that touches `vite.config.ts` / `rollupOptions` / chunk splitting / module resolution, hit the live URL and watch the console.
