# Meta Ads Autopilot — Setup Wizard

Run this on first install or whenever you want to change config. Writes `config.json` in this skill's directory.

The wizard has two halves:

1. **Image backend** — how new ad creatives get generated
2. **Meta backend + autopilot config** — how ads launch to Meta and what thresholds drive promotion/kills

---

## Step 1 — Pick an image backend

Ask the user:

> Which image generation backend do you want to use?
>
> 1. **Higgsfield MCP** — best quality, photorealistic + typeset ads. Requires the Higgsfield MCP server installed in Claude Code. No API key needed if MCP is connected.
> 2. **kie.ai** — single API key gives you access to gpt-image-1, nano-banana, flux, seedream, and more. Best for picking models per ad. Get a key at https://kie.ai
> 3. **OpenAI direct** — uses `gpt-image-1` via your OpenAI API key. Get a key at https://platform.openai.com/api-keys
> 4. **Custom (any OpenAI-compatible API)** — bring your own endpoint + key + model.

Default to `1` if they don't say.

### Higgsfield MCP

Verify any tool name starting with `mcp__` contains `generate_image`. If not, tell them to install the Higgsfield MCP and re-run setup. If present, save:
```json
{ "backend": "higgsfield" }
```

### kie.ai

Ask: "Paste your kie.ai API key." Save:
```json
{ "backend": "kie", "kie_api_key": "...", "kie_model": "gpt-image-1" }
```

### OpenAI direct

Ask for the `sk-...` key. Save:
```json
{ "backend": "openai", "openai_api_key": "...", "openai_model": "gpt-image-1" }
```

### Custom

Ask: base URL, API key, model name. Save:
```json
{ "backend": "custom", "custom_base_url": "...", "custom_api_key": "...", "custom_model": "..." }
```

---

## Step 2 — Reference ads folder

> The autopilot's image quality jumps dramatically when it can see ads you actually like. Pick a folder where you'll drop reference ads (PNG/JPG screenshots — yours, competitors', anything you find inspiring). 5-15 is the sweet spot.
>
> Default: `~/meta-ads-autopilot-references/`

Create the folder if missing. Save:
```json
{ "reference_ads_folder": "/absolute/path" }
```

---

## Step 3 — Output folder

> Where should generated ads + logs save? Default: `~/meta-ads-autopilot-output/`

Save:
```json
{ "output_folder": "/absolute/path" }
```

---

## Step 4 — Detect Meta backend (MCP-first)

The autopilot needs **write access** to your Meta ad account to launch new ads. Two options: Meta Ads MCP (easy) or Meta Ads CLI (fallback).

### Try MCP first

Check whether any tool name starts with `mcp__meta-ads__` or `mcp__plugin_meta-ads__`.

- **If found:** run a write test. Tell the user:

  > Testing Meta Ads MCP write access — I'll create + immediately delete a paused draft campaign to confirm your token has ad write scopes...

  Use the MCP's create-campaign tool with `status=PAUSED` and name `_autopilot-write-test-<timestamp>`. If it returns a campaign ID, delete it immediately. If creation succeeds → save `meta_backend: "mcp"`. **Done with this step.**

  If creation fails with "app in development mode," "permissions error," or similar → MCP can't write, pivot to CLI.

- **If MCP not found:** pivot to CLI directly.

### CLI fallback

Tell the user:

> Your Meta token can't write ads via the MCP. We need to set up the Meta Ads CLI with a Business System User token — that's the only token type that skips Meta's app review for first-party use. This is a 5-minute setup.

Walk them through:

1. **Install the CLI:**
   ```bash
   uv tool install meta-ads
   ```
   Verify: `which meta` should print a path (typically `~/.local/bin/meta`).

2. **Create a System User token:**
   - Go to https://business.facebook.com → **Business settings** → **Users** → **System users**
   - Click **Add**, name it (e.g. "Autopilot"), give it **Admin** role
   - Click the new user → **Generate new token**
   - Pick your app, then select these scopes: `ads_management`, `ads_read`, `business_management`, `pages_read_engagement`, `pages_manage_ads`
   - **Copy the token now** — Meta only shows it once
   - Click **Add assets** and assign your ad account + your Page to the system user

3. **Find your App ID:**
   https://developers.facebook.com/apps → click your app → **Settings** → **Basic** → copy App ID. (If you don't have an app, create one — type "Business," everything else default.)

4. **Save credentials.** Ask the user where their `.env` lives (default `~/.env`):
   ```
   META_ACCESS_TOKEN=<your-system-user-token>
   META_APP_ID=<your-app-id>
   META_AD_ACCOUNT_ID=act_XXXXXXXXX
   ```

5. **Test:**
   ```bash
   meta whoami --json
   ```
   Expect a JSON response with the business name. If it errors, walk through the token scopes again — most failures are missing scopes.

Save: `meta_backend: "cli"`.

---

## Step 5 — Autopilot config

Collect these one at a time:

1. **Meta ad account ID** — `act_XXXXXXXXX` (visible in Ads Manager URL or Business settings → Accounts → Ad accounts)
2. **Testing campaign ID** — where new ads land each week. Numeric ID like `120210000000000`. (If they don't have one, tell them to create a campaign in Ads Manager named "Autopilot Testing" with their preferred objective + audience, then come back with the ID.)
3. **Main campaign ID** — where promoted winners get duplicated. Same format. (Usually their existing scaled campaign.)
4. **Daily test budget** — total $ split across 10 test ads (e.g. `50` = $5/day per ad). Default = `50`.
5. **Target CAC** — your "this is profitable" number in dollars. Used in logs.
6. **Promote threshold CAC** — promote ads at or below this CAC (default = same as target CAC).
7. **Kill threshold spend** — pause ads after $X spent with zero conversions. Default = `30`.
8. **Competitors** — list of Facebook page handles or Page IDs to scrape. 3-10 recommended. Ask:
   > List 3-10 competitors as Facebook page handles (e.g. `@notion`, `@linear`) or Page IDs. The autopilot scrapes their longest-running ads each week to find what's working.

Save as:
```json
"autopilot": {
  "meta_backend": "mcp",
  "meta_ad_account_id": "act_XXXXXXXXX",
  "testing_campaign_id": "...",
  "main_campaign_id": "...",
  "daily_test_budget": 50,
  "target_cac": 25,
  "promote_threshold_cac": 25,
  "kill_threshold_spend": 30,
  "competitors": ["@brand1", "@brand2", "@brand3"]
}
```

---

## Step 6 — How does it run?

Ask:

> How do you want autopilot to run?
>
> (a) **Weekly routine** — runs every Monday 9am automatically (no human needed). I'll print copy-paste instructions for setting up the routine in the Claude routines UI.
> (b) **Manual only** — type `/meta-ads-autopilot` whenever you want fresh creatives. Pipeline still runs end-to-end, but you approve before launch.
> (c) **Both** — set up the routine AND keep manual access (recommended).

**If (a) or (c):** open `routine-template.md` and walk the user through routine setup. Print the exact prompt to paste, the cron string, and the UI steps.

**If (b):** confirm and tell them they can switch to a routine anytime by re-reading `routine-template.md`.

---

## Step 7 — First test run

Strongly recommend a manual test before enabling any routine:

> Before letting this run on a schedule, let's run it once manually so you can see what it does and catch any config issues. Want me to run `/meta-ads-autopilot` now?

If yes, run the manual flow. If anything looks off (wrong competitors, weird campaign IDs, image style miss), re-run setup before enabling the routine.

---

## Step 8 — Write config.json

Combine all answers into one `config.json` in this skill's directory. Example:

```json
{
  "backend": "kie",
  "kie_api_key": "...",
  "kie_model": "gpt-image-1",
  "reference_ads_folder": "/Users/yourname/meta-ads-autopilot-references",
  "output_folder": "/Users/yourname/meta-ads-autopilot-output",
  "autopilot": {
    "meta_backend": "mcp",
    "meta_ad_account_id": "act_XXXXXXXXX",
    "testing_campaign_id": "120210000000000",
    "main_campaign_id": "120210000000001",
    "daily_test_budget": 50,
    "target_cac": 25,
    "promote_threshold_cac": 25,
    "kill_threshold_spend": 30,
    "competitors": ["@brand1", "@brand2", "@brand3"]
  }
}
```

Confirm with the user, list what was saved, and remind them:

> Setup complete. You can change anything by re-running setup or editing `config.json` directly. API keys are stored locally in this skill folder — make sure it's gitignored if you version-control your skills.

---

## Notes

- API keys + tokens live in `config.json` (image backend) and `.env` (Meta token if using CLI). Both should be gitignored.
- Switching from MCP to CLI (or vice versa) later: just re-run setup and let the wizard re-detect.
- The autopilot config block can be edited freely — change competitors, thresholds, budgets without touching anything else.
