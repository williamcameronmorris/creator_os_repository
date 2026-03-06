# Creator Command — Full Build Roadmap

**Generated:** March 5, 2026
**Last Updated:** March 6, 2026
**Status:** Tiers 1–4 complete + Command Center AI copilot live. Remaining Tier 5 items are optional enhancements.

---

## Completion Snapshot

### ✅ Done (Tiers 1–3 complete)

| Item | Status | Notes |
|---|---|---|
| Supabase connected, 30 tables, all migrations applied | ✅ | RLS on all tables |
| Auth (sign up, sign in, onboarding, sessions) | ✅ | Fully functional |
| Daily Pulse | ✅ | Reads from DB, graceful fallback to demo data |
| Schedule page | ✅ | Reads/writes `content_posts`, compose/delete works |
| Media Library | ✅ | Supabase Storage upload/delete/filter |
| Analytics page | ✅ | Reads `platform_metrics`, `post_analytics`, growth charts |
| Settings → Platform OAuth redirects | ✅ | Meta/Threads/TikTok/YouTube redirect URLs wired |
| Deploy `meta-auth` edge function | ✅ | ACTIVE |
| Deploy `threads-auth` edge function | ✅ | ACTIVE |
| Deploy `instagram-sync` edge function | ✅ | ACTIVE |
| Deploy `tiktok-sync` edge function | ✅ | ACTIVE |
| Deploy `youtube-sync` edge function | ✅ | ACTIVE |
| Deploy `instagram-publish` edge function | ✅ | ACTIVE |
| Deploy `generate-ideas` edge function | ✅ | ACTIVE — calls Claude, writes to `ai_content_suggestions` |
| Deploy `generate-script` edge function | ✅ | ACTIVE — calls Claude, writes to `content_workflow_stages` |
| Wire real AI quota display in Studio | ✅ | Calls `check_and_reset_ai_quota` RPC, live value shown |
| Wire real AI to Studio Ideation Stage | ✅ | `generate-ideas` wired, fake timeout removed |
| Wire real AI to Studio Scripting Stage | ✅ | `generate-script` wired, fake timeout removed |
| Restore Pipeline / Deal Tracker | ✅ | Route: `/pipeline`, nav item added |
| Restore Revenue page | ✅ | Route: `/revenue`, nav item added |
| Restore DUE system (DueCompletenessWidget + DueDetailsForm) | ✅ | In DealIntake flow |
| Restore ScopeRecapGenerator | ✅ | Wired to DealIntake |
| Restore CopyBank | ✅ | Route: `/copy-bank`, nav item added |
| Restore BrandLibrary | ✅ | Route: `/brand-library`, nav item added |
| Restore DealContract + DealInvoice | ✅ | In deal detail flow |
| Restore DealPerformanceReport + DealProductionChecklist | ✅ | In deal detail flow |
| Restore QuickQuoteCalculator | ✅ | Route: `/quick-quote`, nav item added |
| Root route `/` | ✅ | Correctly renders DailyPulse inside Layout |

---

## What Still Needs Building

### ✅ TIER 3: Studio AI — COMPLETE

| Item | Status | Notes |
|---|---|---|
| Wire SchedulingStage with real `post_analytics` data | ✅ | Optimal time slots pulled from DB, clickable suggestions |
| Fix EngagementStage — real post URL + live metrics | ✅ | Platform-specific URL built from `instagram_post_id` etc. |
| Fix AnalysisStage — real metrics + historical avg | ✅ | Real views/likes + 90-day avg, no more Math.random() |
| `generate-analysis` edge function | ✅ | ACTIVE — Claude retro: key_learning, what_worked, next_idea |
| `generate-insights` edge function | ✅ | ACTIVE — writes `social_insights` with 5 insight types + AI pattern |
| Daily Pulse auto-triggers `generate-insights` | ✅ | Async on load when no insights exist; re-fetches and updates SmartTipsCard |

---

### ✅ TIER 4: Polish and Close Gaps — COMPLETE

| Item | Status | Notes |
|---|---|---|
| Brand Prospects UI | ✅ | `BrandLibrary.tsx` IS the Brand Prospects UI — full CRUD, activities, fit check, convert-to-deal |
| AI Quota audit | ✅ | All AI entry points checked: `generate-ideas`, `generate-script`, `generate-analysis` all gate + decrement quota. `analyticsInsights.ts` is algorithmic (no Claude), no quota needed. ActionDashboard AI assistant is disabled placeholder |
| TikTok + YouTube OAuth Callbacks | ⏭️ | Explicitly deferred by user — skipped |
| Onboarding → Platform Connect Banner | ✅ | Banner added to DailyPulse when `hasConnectedAccounts === false`. Links to `/settings`. Shows IG/TikTok/YT icons. Hidden once any platform is connected |
| Subscription / Paywall Integration | ✅ | PaywallModal upgrade button wired. Uses `VITE_STRIPE_PAYMENT_LINK` env var — opens Stripe Payment Link with prefilled email. Falls back to mailto if env not set. Documented in `.env` |

---

### 🔵 TIER 5: Future Intelligence Features

**AI Writing to `ai_workflow_suggestions` Table**
Currently unused. Add stage-level AI suggestions stored here so users can revisit past recommendations.

**Competitor / Trend Detection**
Low priority. Blocked on external data source (Apify, RapidAPI).

**Deal Renewal Tracking**
`deal_renewals` table is migrated. DealTracker should surface renewal opportunities when deal end dates approach.

**Post A/B Testing**
`post_analytics` has the data model but no UI concept yet.

---

## Edge Functions — Current Deployment Status

| Function | Status | Purpose |
|---|---|---|
| `meta-auth` | ✅ ACTIVE | Meta/Facebook OAuth code exchange |
| `threads-auth` | ✅ ACTIVE | Threads OAuth token exchange |
| `instagram-sync` | ✅ ACTIVE | Pull IG metrics → `platform_metrics` + `post_analytics` |
| `tiktok-sync` | ✅ ACTIVE | Pull TikTok metrics |
| `youtube-sync` | ✅ ACTIVE | Pull YouTube metrics |
| `instagram-publish` | ✅ ACTIVE | Publish posts to IG via Graph API |
| `generate-ideas` | ✅ ACTIVE | Generate content ideas using Claude Haiku |
| `generate-script` | ✅ ACTIVE | Generate content scripts using Claude Haiku |
| `generate-analysis` | ✅ ACTIVE | Post-performance retro using Claude Haiku; writes to `content_workflow_stages.analysis_notes` |
| `generate-insights` | ✅ ACTIVE | Analyzes metrics + posts, writes 5 insight types to `social_insights`; auto-triggered by Daily Pulse |
| `ask-copilot` | ✅ ACTIVE | Command Center AI copilot — answers creator questions using real metrics/posts/deals as context |

**Required secrets to set in Supabase → Project Settings → Secrets:**
- `ANTHROPIC_API_KEY` — needed for all AI edge functions
- `META_APP_SECRET` — Meta/Facebook OAuth
- `TIKTOK_CLIENT_SECRET` — TikTok OAuth
- `YOUTUBE_CLIENT_SECRET` — YouTube OAuth
- `THREADS_APP_SECRET` — Threads OAuth

**Required env vars to set in `.env` (frontend):**
- `VITE_STRIPE_PAYMENT_LINK` — Stripe Payment Link URL for PaywallModal upgrade button

---

## File Reference — Current State

| Component | File | Status |
|---|---|---|
| Daily Pulse | `src/components/DailyPulse/index.tsx` | ✅ Functional |
| Command Center | `src/components/ActionDashboard.tsx` | ✅ AI copilot live — wired to `ask-copilot` edge fn with real creator data context; sync buttons need OAuth secrets |
| Studio | `src/pages/Studio.tsx` + `src/components/Studio/` | ✅ All 5 stages fully wired: Ideation (AI ideas), Scripting (AI script), Scheduling (optimal time slots), Engagement (live metrics), Analysis (AI retro) |
| Schedule | `src/pages/Schedule.tsx` | ✅ Functional |
| Media | `src/pages/Media.tsx` | ✅ Functional |
| Analytics | `src/pages/Analytics.tsx` | ✅ Functional (paywall icons on advanced metrics) |
| Settings | `src/pages/SettingsPage.tsx` | ⚠️ OAuth needs API secrets set in Supabase |
| Pipeline | `src/pages/Pipeline.tsx` | ✅ Restored, route `/pipeline` active |
| Revenue | `src/pages/Revenue.tsx` | ✅ Restored, route `/revenue` active |
| CopyBank | `src/pages/CopyBankPage.tsx` | ✅ Restored, route `/copy-bank` active |
| Brand Library | `src/pages/BrandLibrary.tsx` | ✅ Restored, route `/brand-library` active |
| Quick Quote | `src/pages/QuickQuotePage.tsx` | ✅ Restored, route `/quick-quote` active |
| Deal Tracker | `src/components/DealTracker.tsx` | ✅ Restored |
| Deal Intake | `src/components/DealIntake.tsx` | ✅ Restored with DUE system |
| DUE Widget | `src/components/DueCompletenessWidget.tsx` | ✅ Restored |
| Scope Recap | `src/components/ScopeRecapGenerator.tsx` | ✅ Restored |
| Kanban Board | `src/components/KanbanBoard.tsx` | ✅ Restored |
| PaywallModal | `src/components/PaywallModal.tsx` | ✅ Wired — upgrade button opens Stripe Payment Link |
| Daily Pulse | `src/components/DailyPulse/index.tsx` | ✅ Platform connect banner added for new users |
| useDailyPulse | `src/hooks/useDailyPulse.ts` | ✅ Returns `hasConnectedAccounts` boolean |

---

## Recommended Next Execution Order

```
Now: Set VITE_STRIPE_PAYMENT_LINK in .env and Supabase secrets for live payments
Now: Set ANTHROPIC_API_KEY, META_APP_SECRET, TIKTOK_CLIENT_SECRET, YOUTUBE_CLIENT_SECRET in Supabase secrets
Later: Stripe webhook → update profiles.subscription_tier on successful payment
Later: Tier 5 features (deal renewals, A/B testing, competitor detection)
```
