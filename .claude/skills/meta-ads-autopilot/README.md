# Meta Ads Autopilot

Fire your media buyer. This skill is the new way to manage Meta ads with AI agents.

Every Monday morning (or whenever you trigger it), it:

1. **Sweeps last week's testing campaign** — promotes ads under your target CAC to your main campaign, kills ads that spent too much without converting
2. **Reads your last 30 days of ad performance** to find what's working
3. **Scrapes your competitors' longest-running ads** from Meta Ad Library (longest = winners — nobody runs a loser for 60+ days)
4. **Generates 10 new ad concepts** (3 doubling down on your winners, 3 inspired by competitor winners, 2 testing new psychology pillars, 2 wildcards)
5. **Generates images** for all 10 with your chosen backend
6. **Launches them all** into your testing campaign

Runs hands-off via a Claude routine, or manually whenever you want fresh creatives.

---

## Install

```bash
mkdir -p ~/.claude/skills
cd ~/.claude/skills
git clone https://github.com/tenfoldmarc/meta-ads-autopilot
```

Restart Claude Code (or `/reload`).

Then run setup:

```
/meta-ads-autopilot setup
```

Full install + walkthrough in [`INSTALL.md`](INSTALL.md).

---

## What you need before setup

- A Meta ad account with at least one **testing campaign** (where new ads land) and one **main campaign** (where winners get duplicated)
- An image generation backend — pick one:
  - **Higgsfield MCP** (best quality, no key needed if MCP is connected)
  - **kie.ai** ($0.04 per gpt-image-1 image, single key)
  - **OpenAI direct**
  - **Custom OpenAI-compatible endpoint** (Together, Fireworks, etc.)
- Meta Ads MCP **or** the Meta Ads CLI installed (the wizard tries MCP first and only walks you through CLI if MCP can't write)

---

## Two ways to run it

### Weekly routine (hands-off)
Set up a Claude routine that fires the autopilot every Monday 9am. The wizard prints copy-paste instructions for the Claude routines UI. Once it's running, you check Slack for the weekly summary and that's it.

### Manual (`/meta-ads-autopilot`)
Type the command whenever you want fresh creatives. Same pipeline runs, but it pauses to show you the 10 concepts + images and asks before launching to Meta. Use this until you've validated a few weeks of clean runs.

You can run both — set up the routine for the auto cadence, and trigger manually anytime you want extras.

---

## What this skill is NOT

- **Not a one-off ad generator.** If you want to drop in a product URL and get 4 finished ads with full approval gates, install [meta-ads-generator-skill](https://github.com/tenfoldmarc/meta-ads-generator-skill) (the companion). They coexist.
- **Not a replacement for thinking.** It scrapes competitors and reads your performance, but you still need to be the one who set up a sane testing campaign with proper conversion tracking.
- **Not a Meta API wrapper.** It calls into the Meta Ads MCP or the Meta Ads CLI — you bring the Meta auth.

---

## Files

```
meta-ads-autopilot/
├── README.md                # this
├── INSTALL.md               # community install walkthrough
├── SKILL.md                 # main entry — Claude reads this first
├── setup.md                 # interactive setup wizard
├── autopilot.md             # weekly loop logic
├── promote-winners.md       # sweep logic
├── routine-template.md      # routine UI walkthrough + cron + paste-ready prompt
├── config.example.json      # config schema example
├── backends/                # per-backend image gen instructions
│   ├── higgsfield.md
│   ├── kie.md
│   ├── openai.md
│   └── custom.md
└── .gitignore               # ignores config.json (your real creds)
```

---

Built by [@tenfoldmarc](https://instagram.com/tenfoldmarc). Bug reports + feature requests: GitHub issues.
