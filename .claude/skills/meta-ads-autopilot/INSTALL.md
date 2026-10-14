# Install — Meta Ads Autopilot

Full walkthrough for getting the autopilot running end-to-end. Plan for ~15 minutes the first time, including Meta auth.

---

## 1. Install the skill

```bash
mkdir -p ~/.claude/skills
cd ~/.claude/skills
git clone https://github.com/tenfoldmarc/meta-ads-autopilot
```

Restart Claude Code (or run `/reload`) so it picks up the new skill.

---

## 2. Decide what backends you'll use

You need two things before starting setup:

### Image backend — pick one
- **Higgsfield MCP** — no API key, but you need the [Higgsfield MCP](https://higgsfield.ai) installed in Claude Code first
- **kie.ai** — easiest path, one key gives you gpt-image-1, nano-banana, flux, seedream. Get a key at https://kie.ai
- **OpenAI direct** — if you already have an OpenAI API key
- **Custom OpenAI-compatible endpoint** — Together, Fireworks, Replicate, self-hosted ComfyUI

### Meta backend — wizard auto-detects
- **Meta Ads MCP** (preferred) — install the Meta Ads MCP in Claude Code, OAuth in your browser, done
- **Meta Ads CLI** (fallback) — only needed if the MCP can't write ads. The wizard will walk you through System User token setup if it has to.

---

## 3. Make sure you have a testing campaign + main campaign

Open Meta Ads Manager. The autopilot needs:

1. **Testing campaign** — where 10 new ads land each week. Name it something like "Autopilot Testing." Set up:
   - Objective: same as your main (Sales / Leads / Traffic, whatever)
   - Daily budget: roughly the `daily_test_budget` you'll set later (e.g. $50/day)
   - Audience + placements: same as main, or broader for discovery
2. **Main campaign** — your existing scaled campaign (where promoted winners get duplicated)

Copy both campaign IDs. They look like `120210000000000`. You'll paste them during setup.

---

## 4. Run the wizard

```
/meta-ads-autopilot setup
```

The wizard asks (in order):

1. **Image backend** + credentials
2. **Reference ads folder** — where you'll drop screenshots of ads you like (5-15 is the sweet spot)
3. **Output folder** — where generated ads + logs save
4. **Meta backend** — auto-detects MCP, runs a write test, falls back to CLI if needed
5. **Autopilot config** — ad account ID, campaign IDs, budget, CAC thresholds, competitors
6. **How to run** — weekly routine, manual only, or both

If the Meta MCP write test fails, the wizard pivots to the CLI flow:
1. Install: `uv tool install meta-ads`
2. Create a System User token in Meta Business Manager (the only token type that skips Meta's app review for first-party use)
3. Save the token + your App ID + ad account ID to `~/.env`
4. Test: `meta whoami --json`

This is the gnarliest part of setup. Budget 5-10 minutes if you've never created a Meta system user before. The wizard prints exact step-by-step instructions inline.

---

## 5. Set up the routine (optional)

If you chose "weekly routine" or "both" in step 6 of the wizard, the wizard prints a copy-paste prompt + cron string + UI walkthrough. Follow it.

Quick version:
1. Open routines UI (Claude Code → routines panel, or claude.ai/code → Routines)
2. New routine → paste the prompt from the wizard
3. Cron: `0 9 * * 1` (Monday 9am — adjust to your timezone)
4. Save → click **Run now** to test

Full walkthrough in [`routine-template.md`](routine-template.md).

---

## 6. First test run

**Always run manually once before trusting the routine:**

```
/meta-ads-autopilot
```

This triggers the full pipeline in manual mode (with approval gate before launch). Verify:
- Sweep reads your testing campaign without errors
- Performance pull from your ad account works
- Competitor scrape returns real ads
- 10 concepts feel on-brand
- 10 images render in the style of your reference ads
- Approval gate fires before launch

If anything's off, re-run setup or edit `config.json` directly. **Don't enable the routine until you've had at least one clean manual run.**

---

## 7. Where things live

```
~/.claude/skills/meta-ads-autopilot/
├── config.json              # your settings + creds (gitignored — never commit)
├── SKILL.md
├── setup.md
├── autopilot.md
├── promote-winners.md
├── routine-template.md
└── backends/

~/meta-ads-autopilot-references/   # your reference ad screenshots (drop new ones anytime)
~/meta-ads-autopilot-output/       # all generated creatives + per-run logs
```

Logs are kept forever in `~/meta-ads-autopilot-output/autopilot-log/`. Useful when you want to know why an ad got promoted, killed, or never launched.

---

## Troubleshooting

**"Higgsfield MCP not found"**
Install [Higgsfield MCP](https://higgsfield.ai) in Claude Code and re-run setup.

**"Meta MCP write test failed: app in development mode"**
Your Meta token doesn't have ad write scopes — usually because the app is in dev mode and hasn't been through App Review. The wizard pivots to the CLI flow which uses a System User token (no App Review needed).

**"Sweep skipped: testing_campaign_id missing"**
Re-run setup and fill in the campaign IDs.

**Autopilot generated 10 great concepts but 0 images**
Image backend key is invalid or out of credits. Check `config.json` and your backend dashboard.

**Routine ran but didn't launch ads**
Routines need explicit permission to use Bash, MCP tools, and the skill folder. Check the routine's tool permissions in the routines UI.

**Promoted ad shows up duplicated multiple times in main campaign**
The sweep checks for the `[promoted YYYY-MM-DD]` tag in the ad name — if you renamed the ad after promotion, the sweep can't tell it was already promoted. Either keep the tag or manually deduplicate.

**Same ads keep getting killed without converting**
Usually means your testing audience is too narrow, your conversion tracking is broken, or your `kill_threshold_spend` is set too low. Check tracking in Events Manager first.

---

Built by [@tenfoldmarc](https://instagram.com/tenfoldmarc). Open issues for bugs or feature requests.
