---
name: meta-ads-autopilot
description: Fully automated Meta ads loop. Every week (manually or via Claude routine), it sweeps last week's testing campaign — promotes winners, kills losers — then reads your ad performance, scrapes competitors' longest-running ads, generates 10 new ad concepts + images, and launches them into a creative testing campaign. Trigger via `/meta-ads-autopilot` or run from a routine.
---

# Meta Ads Autopilot

The fully automated version of the meta-ads pipeline. Designed to run hands-off on a weekly schedule via Claude routines, but works just as well when triggered manually.

**This skill is the launcher.** If you also want one-off ad generation (URL in, 4 ads out, with approval gates), install the companion [meta-ads-generator-skill](https://github.com/tenfoldmarc/meta-ads-generator-skill) — they coexist cleanly.

---

## First-run check

Before doing anything, look for `config.json` in this skill's directory.

- **If it exists with an `autopilot` block,** read it and proceed to the loop.
- **If it doesn't exist or is missing autopilot fields,** open `setup.md` and run the wizard. Don't try to run the loop until config is written.

---

## What the loop does (every run)

Same pipeline whether triggered manually or by a routine. The only difference is whether it pauses for confirmation before launching to Meta.

1. **Sweep** last week's testing campaign — promote ads under target CAC, kill ads over kill-threshold spend with zero conversions (`promote-winners.md`)
2. **Read** last 30 days of own ad performance from the configured ad account
3. **Scrape** competitors' longest-running ads from Meta Ad Library
4. **Generate** 10 new ad concepts (3 doubling down on winners, 3 inspired by competitor longest-runners, 2 new psychology pillars, 2 wildcards)
5. **Generate images** for all 10 (one image gen call at a time)
6. **Launch** all 10 into the testing campaign in paused state, then un-pause as a batch
7. **Log** the run, optionally notify via Slack

Full step-by-step in `autopilot.md`.

---

## Manual vs routine mode

**Manual** (`/meta-ads-autopilot` typed in chat):
- Runs the full pipeline
- Shows concepts + image previews
- **Asks for confirmation** before Step 7 launch
- Use when you want fresh creatives but want eyes on them first

**Routine** (scheduled via Claude routines UI):
- Runs the full pipeline
- **No confirmation** — launches automatically
- Use after you've validated the pipeline manually for a few weeks
- See `routine-template.md` for setup

---

## Hard rules

- **One image generation call at a time.** Parallel calls time out on most providers.
- **All Meta ads launch in PAUSED state first**, then un-pause as a final batch. Protects against half-launched campaigns if something fails midway.
- **Partial success > no success.** If image gen fails on 1 of 10, skip and continue. If a launch fails, log and continue. Don't let a single failure block the whole run.
- **No em dashes** in any ad copy.
- **Brand voice over operator voice.** Ads are written in the *product's* voice, not yours.
- **Logs are immutable.** Every run writes to `<output>/autopilot-log/<date>-*.md`. These are the audit trail when you want to know why an ad got promoted, killed, or never launched.
- **Reference ads matter.** If you have screenshots of ads you like in the configured `reference_ads_folder`, the image backend uses them as visual references on every generation.

---

Built by [@tenfoldmarc](https://instagram.com/tenfoldmarc). Bug reports + questions: GitHub issues.
