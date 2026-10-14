# Autopilot — Weekly Loop

End-to-end pipeline. Same logic whether triggered manually or by a Claude routine. Only difference: manual mode pauses for confirmation before launching to Meta.

---

## Pre-flight

1. Read `config.json`. If `autopilot` block is missing, stop and route the user to `setup.md`.
2. Verify the Meta backend works:
   - `meta_backend: "mcp"` → confirm `mcp__meta-ads__*` tools are available in this session
   - `meta_backend: "cli"` → run `meta whoami --json` via Bash, expect a successful response
3. If neither works, stop and tell the user to re-run setup so the wizard can fix Meta auth.
4. Detect mode:
   - **Manual** — user typed `/meta-ads-autopilot` in chat → enable approval gate before Step 6
   - **Routine** — fired by a routine prompt → run hands-off, no gates

---

## Step 0 — Sweep last week's testing campaign

Run `promote-winners.md`. This:
- Pulls last 7 days of stats from `testing_campaign_id`
- Promotes any ad with CAC ≤ `promote_threshold_cac` to `main_campaign_id`
- Pauses anything that spent ≥ `kill_threshold_spend` without converting
- Logs the sweep to `<output>/autopilot-log/<date>-sweep.md`

If the sweep fails, log the error and **continue** with the rest of the loop. Don't let a sweep failure block fresh creatives.

---

## Step 1 — Pull own performance

Last 30 days from `meta_ad_account_id`:
- Top 5 ads by ROAS / lowest CAC
- Bottom 5 ads (high spend, low conversion)
- Format diversity: which formats are working (static / carousel / video)

**MCP:** `mcp__meta-ads__get_insights(ad_account_id=..., date_preset=last_30d, level=ad)` (exact tool names may vary; inspect available tools at runtime).

**CLI:** `meta insights --account $META_AD_ACCOUNT_ID --since 30d --level ad --json`

Save to `<output>/autopilot-log/<date>-own-perf.md`.

---

## Step 2 — Scrape competitors (longest-running ads)

For each handle in `config.autopilot.competitors`:

1. Resolve handle to Page ID if needed (Meta Ad Library accepts either).
2. Hit Ad Library:
   ```
   https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=ALL&search_type=page&view_all_page_id=<page_id>
   ```
3. Pull active ads sorted by start date **ascending** — longest-running ads at the top. These are competitor winners (nobody runs a loser for 60+ days).
4. For each, capture: hook text, headline, primary image URL, days running, format.

If the user has the [`competitive-ads-extractor`](https://github.com/anthropics/skills) skill installed, prefer it. Otherwise use `WebFetch` + parsing.

Save raw to `<output>/autopilot-log/<date>-competitors.md`. Aim for 5-10 winners total across all competitors.

---

## Step 3 — Generate 10 ad concepts

Synthesize own performance + competitor patterns into **10 new concepts**:

- **3 concepts** that double down on the brand's current top angle (different hook, same psychology)
- **3 concepts** inspired by competitor longest-runners (steal the *angle*, not the copy — translate to the user's brand voice)
- **2 concepts** testing a new psychology pillar the brand hasn't tried
- **2 wildcards** (format swap, big claim, contrarian hook)

Each concept needs:
- **Hook** (3-7 words, on-screen text)
- **Headline** (typeset focal line)
- **Subhead/proof** (one short line)
- **CTA**
- **Visual direction** (composition, mood, palette)

Save to `<output>/autopilot-log/<date>-concepts.md`.

**In manual mode:** show the 10 concepts in chat. Don't ask for approval — just keep going. (Approval gate is at launch, not at concepts. Image gen is cheap; pausing here wastes time.)

---

## Step 4 — Generate images

Read `config.backend` and follow `backends/<backend>.md`. **One image generation call at a time.** Pass any reference ads from `reference_ads_folder` as visual references on every call.

Save to `<output>/autopilot-log/<date>-creatives/<concept-N>.png`.

**Failure handling:** if one image fails, retry once. If it still fails, skip that concept and continue. Log the skip. A 7/10 ad week is better than 0/10.

---

## Step 5 — Manual approval gate (manual mode only)

**Skip this step entirely if running from a routine.**

In manual mode:
1. List all 10 concepts + image paths in chat
2. On macOS, run `open -a Preview <output>/autopilot-log/<date>-creatives/*.png` so the user can scan them
3. Ask:
   > Launch all 10 to your testing campaign? (`yes` / `no` / `pick subset`)
4. If `yes` → continue to Step 6
5. If `no` → save creatives, exit cleanly
6. If `pick subset` → ask which concept numbers to launch, only launch those

---

## Step 6 — Launch testing campaign

For each creative (10 in routine mode, or the approved subset in manual mode), create one ad in `testing_campaign_id`:

**Per-ad daily budget:** `daily_test_budget / count` (split evenly across launched ads).

**MCP:**
```
mcp__meta-ads__upload_image(ad_account_id=..., file=<path>)
mcp__meta-ads__create_ad(
  campaign_id=<testing_campaign_id>,
  creative={image_hash, headline, primary_text, cta},
  status=PAUSED,
  daily_budget=<per-ad>
)
```

**CLI:**
```bash
meta ad create \
  --campaign $TESTING_CAMPAIGN_ID \
  --image <path> \
  --headline "..." \
  --primary-text "..." \
  --cta SHOP_NOW \
  --daily-budget <per-ad> \
  --status PAUSED \
  --json
```

Use the testing campaign's existing audience + placements — don't recreate from scratch.

**All ads launch PAUSED first.** Once all 10 (or N) have been created successfully, un-pause them as a final batch:

**MCP:** `mcp__meta-ads__update_ad(ad_id=..., status=ACTIVE)` for each
**CLI:** `meta ad activate <ad_id>` for each

This protects against half-launched campaigns. If launch fails on ad 7 of 10, the first 6 stay paused — easy to clean up.

---

## Step 7 — Log + notify

Write `<output>/autopilot-log/<date>-launch.md`:

```markdown
# Autopilot Run — 2026-05-08

## Sweep
- Promoted: 3 ads
- Killed: 4 ads
- Held over: 3 ads
(See sweep log: <date>-sweep.md)

## New ads launched
- ad_aaa — concept 1 (winning angle, hook variant)
- ad_bbb — concept 2 ...
...

## Skipped
- concept 7 — image gen failed twice

## Budget
- Daily testing budget: $50 across 10 ads = $5/day each

## Links
- Ads Manager: https://business.facebook.com/adsmanager/manage/campaigns?act=<account>&selected_campaign_ids=<testing_campaign_id>
```

If the user has Slack MCP configured, post a one-line summary to their default channel. Otherwise just print the summary in chat.

---

## Failure handling summary

| What fails | What to do |
|---|---|
| Image gen on 1 of N | Retry once, skip on second failure, log |
| Meta launch on 1 of N | Retry once, skip on second failure, log |
| Meta auth dies mid-run | Stop, log everything completed, alert user |
| Sweep | Log error, continue with new ad gen anyway |
| Competitor scrape (one handle) | Log, continue with the rest |
| Whole pipeline | Log full state to `<output>/autopilot-log/<date>-CRASH.md` for post-mortem |

The autopilot favors **partial success over no success.** A messy run that ships 7 ads beats a clean abort that ships 0.
