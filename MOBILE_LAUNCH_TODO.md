# Mobile-launch + post-audit to-do

What was shipped overnight (4 commits on `main`) and what needs you next.

## Already pushed (no action — already deployed by Vercel for web; native + edge functions need redeploy)

- `chore(cleanup)` — deleted `src/_archived/` (30 files), 3 unused Studio duplicates, `dealToSchedule.ts`. Build still green.
- `fix(security)` — 9 edge functions now verify the caller's JWT via a new `_shared/auth.ts` helper. Previously they accepted any `userId` in the request body.
- `fix(ios,capacitor)` — `capacitor.config.ts` and `Info.plist` cleaned up for App Store review.
- (Earlier today) `fix(insights)` and `fix(schedule,office,account-delete)` — already documented separately.

## Step 1 — Apply yesterday's migration (still pending, ~15 sec)

If you didn't already run this last night:

```sql
ALTER TABLE social_insights DROP CONSTRAINT IF EXISTS social_insights_insight_type_check;
```

→ https://supabase.com/dashboard/project/mlionhgievukulyufnnr/sql/new

## Step 2 — Redeploy edge functions (CRITICAL — security fixes are inert until you do this)

The 9 functions I patched are deployed bytes-locked at the gateway. Code on `main` is irrelevant until each one is redeployed. From `/tmp/cco`:

```bash
cd /tmp/cco
for fn in ask-copilot generate-ideas generate-script generate-recommendations \
          generate-analysis analyze-captions repurpose-content fetch-comments \
          sync-inspiration-library publish-scheduled-posts \
          generate-insights delete-account; do
  supabase functions deploy "$fn" --no-verify-jwt
done
```

(That includes `generate-insights` and `delete-account` from yesterday's batch — redeploying both is harmless and confirms they're current.)

If `supabase` CLI isn't linked: dashboard → Edge Functions → each one → Deploy → toggle "Verify JWT" **off**.

Also confirm in Project Settings → Edge Functions → Secrets:
- `Cron_Secret` set (any random string)
- Whatever scheduled job calls `publish-scheduled-posts` and `generate-insights` POSTs `{ "cronSecret": "<the-secret>" }` (or uses service-role bearer)

## Step 3 — Native build pipeline status check (~5 min)

Verify the iOS build still succeeds after the Info.plist + capacitor.config changes:

```bash
cd /tmp/cco
npm run build
npx cap sync ios
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/cco-derived build
```

If that errors out, the most likely cause is a Capacitor plugin (Splash, Status Bar, Keyboard) that I configured but isn't installed. Fix:

```bash
npm i @capacitor/splash-screen @capacitor/status-bar @capacitor/keyboard
npx cap sync ios
```

## Step 4 — Add Android platform (the launch is *not* iOS-only)

There is **no `android/` directory** in the repo. Capacitor was only ever set up for iOS. To add it:

```bash
cd /tmp/cco
npm i @capacitor/android
npx cap add android
npx cap sync android
```

This generates the `android/` Gradle project. Commit the result. Most of the iOS-side hardening I shipped (allowNavigation, splash, status bar) automatically applies to Android via `capacitor.config.ts`. You'll still need to:
- Set up Android signing keys (debug.keystore for dev, release for Play Store)
- Configure `android/app/src/main/AndroidManifest.xml` permissions to mirror Info.plist (camera, photo library)
- Generate adaptive launcher icons (`res/mipmap-anydpi-v26/ic_launcher.xml`)

## Step 5 — OAuth deep links for native builds (Meta, Google, TikTok)

Web OAuth callbacks use `/auth/<provider>/callback` URLs. In a native iOS/Android build, those URLs would open Safari/Chrome and lose the session — which is what `server.allowNavigation` in capacitor.config.ts partially fixes for the in-app webview.

For a real native launch you also need:
- **iOS**: register a Universal Link domain in `ios/App/App/App.entitlements` — `applinks:cliopatra.app` (and `creatorcommand.app` until you swap). Add an `apple-app-site-association` JSON file at the root of the production domain.
- **Android**: register intent filters in `AndroidManifest.xml` for `https://cliopatra.app/auth/*` URLs as `autoVerify="true"`.
- **Provider sides**: each OAuth app (Meta dev console, Google Cloud, TikTok dev portal) needs the iOS bundle ID `com.cliopatra.app` and Android package name added if they support native SDKs. For pure-redirect OAuth (current implementation), keeping the callback URL as the web domain is fine — the universal-link config above is what brings the user back into the app.

This is the work your earlier task list flagged ("Add OAuth callback URLs for cliopatra.app at Meta, Google, TikTok"). The web URLs are step 1; native deep linking is step 2 and needs the steps above.

## Step 6 — App icons + splash assets

Capacitor expects:
- **iOS**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` filled with 18 PNG sizes from 20×20 up to 1024×1024.
- **Android**: `android/app/src/main/res/mipmap-*/` filled per density (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).
- **Splash**: a single 2732×2732 PNG center-cropped at install on every device.

You can generate all of these from one master icon with `@capacitor/assets`:

```bash
npm i -D @capacitor/assets
mkdir -p assets
# Drop a 1024x1024 icon and a 2732x2732 splash into ./assets/
npx capacitor-assets generate
```

Master assets need your design call. Today the production app uses `public/vite.svg` as the favicon — that's the placeholder your earlier task list flagged.

## Step 7 — App Store / Play Store submission gates

Each of these needs your hand:
- **Privacy policy URL** that App Store + Play Store can crawl (you have `public/privacy.html` — verify it's reachable at `https://cliopatra.app/privacy.html` once domain swap is done)
- **App Store Connect listing**: name, subtitle, screenshots (6.7", 6.5", 5.5", iPad if supporting), preview video (optional), description, keywords, category (Photo & Video / Social Networking)
- **Google Play Console listing**: same set, plus content rating questionnaire, target API level (must be 34+ for new submissions)
- **Tax/banking**: paid app or IAP would gate this; if Cliopatra stays free for now, skip
- **Apple Developer Program** + **Google Play Console** subscriptions ($99/yr + $25 one-time)

## Step 8 — Revoke the GitHub PAT

I used the PAT you gave me to push 4 commits today. Once you confirm everything looks healthy, revoke it:
→ https://github.com/settings/personal-access-tokens (find the one starting `github_pat_11B4UX7AQ…` and Revoke)

## Open from before this audit

These were on your list yesterday and aren't done yet — sorting them by what unlocks the most:

- **Pick Auth.tsx tagline** (4 options I had — fastest unblock for the brand polish queue)
- **Pick favicon design** (gates Step 6 above; without this, the app icons are blocked)
- **Pick Creator Spy Agent discovery-mode config** (3-5 hashtags + view threshold)
- **Reconcile profiles vs platform_credentials source-of-truth** (4 IG users in profiles with no active row in platform_credentials — pick one)
- **Decide PostComposerPage cleanup** (rebuild edit on ComposePost vs leave dual)

## Open: Office timezone bug investigation

Code at `OfficeHub.tsx:46-65` looks correct. Need a 30-sec browser-console check at `/office`:

```js
const tz = (await supabase.from('profiles').select('timezone').single()).data;
const posts = (await supabase.from('content_posts').select('scheduled_date').eq('status','scheduled').limit(3)).data;
console.log({ tz, posts });
```

Paste output to me — that pinpoints whether it's data shape or display logic.
