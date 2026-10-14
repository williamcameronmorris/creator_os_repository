# Routine Setup — Run the Autopilot Weekly

Claude Code can't create routines for you (routines live in the Claude routines UI). This file tells you exactly what to paste and where.

---

## What to paste

**Routine name:** `Meta Ads Autopilot — Weekly`

**Schedule (cron):** `0 9 * * 1` (every Monday at 9:00 AM your local time)

**Prompt to paste into the routine:**

```
Run the meta-ads-autopilot skill end-to-end in routine mode.

Steps:
1. Sweep last week's testing campaign — promote ads at or under target CAC, kill ads over kill-threshold spend with zero conversions
2. Pull last 30 days of ad account performance
3. Scrape competitors' longest-running ads from Meta Ad Library
4. Generate 10 new ad concepts (3 doubling down on winners, 3 inspired by competitor longest-runners, 2 new psychology pillars, 2 wildcards)
5. Generate images for all 10
6. Launch all 10 into the testing campaign in PAUSED state, then un-pause as a batch
7. Log the run and post a summary

Read all config from the skill's config.json. Don't ask any questions — run fully automated. If anything fails, log it and continue with whatever succeeded. This is routine mode: no approval gates.
```

---

## Setup walkthrough

1. Open Claude Code → routines panel (or visit https://claude.ai/code → **Routines** in sidebar)
2. Click **New routine**
3. Name: `Meta Ads Autopilot — Weekly`
4. Schedule: `0 9 * * 1` (adjust to your timezone)
5. Paste the prompt above
6. Make sure the routine has access to:
   - This skill folder (`meta-ads-autopilot`)
   - Your image backend (Higgsfield MCP, kie.ai key, etc.)
   - Meta Ads MCP **or** the `meta` CLI on PATH
   - Default tools: Bash, Read, Write, WebFetch
7. Save
8. Click **Run now** once to test the first run end-to-end before the next scheduled fire

---

## Cron quick reference

| Schedule | Cron |
|---|---|
| Every Monday 9am | `0 9 * * 1` |
| Every weekday 9am | `0 9 * * 1-5` |
| First of the month 9am | `0 9 1 * *` |
| Every other Monday | not native cron — run weekly + add a config flag to skip alternate weeks |

---

## Sanity check before going hands-off

Before letting the routine run unattended, do these once:

1. Run `/meta-ads-autopilot` interactively (manual mode)
2. Confirm Step 0 sweep reads your testing campaign correctly
3. Confirm Step 6 launch creates ads in **PAUSED** state and un-pauses cleanly
4. Spot check one launched ad in Meta Ads Manager — image quality, copy, targeting
5. Wait one week, check the sweep promotes/kills the right ads

Only after that, enable the routine. Robots running on a misconfigured campaign for 4 weeks before you notice is expensive.

---

## Stopping the routine

Anytime: open the routines UI, find `Meta Ads Autopilot — Weekly`, toggle off or delete.

You can also leave the routine on but pause autopilot launches by editing `config.json` and setting `daily_test_budget: 0` — the loop will still run (sweep, scrape, generate concepts) but skip the launch step. Useful if you want to keep the audit trail going during a quiet period.
