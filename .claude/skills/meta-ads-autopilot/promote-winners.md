# Promote Winners — Sweep Logic

Runs at the start of every autopilot loop (Step 0). Looks at last week's testing-campaign ads, promotes winners, kills losers.

---

## Inputs (from config.json `autopilot` block)

- `testing_campaign_id` — where new ads land each week
- `main_campaign_id` — where proven winners get duplicated
- `target_cac` — informational, used in logs
- `promote_threshold_cac` — promote any ad at or below this CAC
- `kill_threshold_spend` — pause any ad that spent ≥ this amount with zero conversions

If any are missing, log a warning and skip the sweep — don't error out the whole loop.

---

## Logic

For each active ad in `testing_campaign_id`, last 7 days:

```
spend = ad.spend_last_7d
conversions = ad.conversions_last_7d
cac = spend / conversions  (if conversions > 0)
```

**Promote** if `cac <= promote_threshold_cac` AND `conversions >= 3`:
- Duplicate the ad into `main_campaign_id`
- Keep the original running in testing (gives it more data, lets you compare cohorts)
- Tag the promoted ad name with `[promoted YYYY-MM-DD]` so it's findable later

**Kill** if `spend >= kill_threshold_spend` AND `conversions == 0`:
- Pause the ad in the testing campaign
- Don't delete — keep it for post-mortem reference

**Hold over** otherwise. Ads in the gray zone (some conversions but CAC above threshold, or under spend threshold) get another week.

---

## Implementation per backend

### MCP

```
mcp__meta-ads__list_ads(campaign_id=<testing_campaign_id>, date_preset=last_7d)
mcp__meta-ads__get_ad_insights(ad_id=..., fields=[spend, actions])
mcp__meta-ads__duplicate_ad(ad_id=..., target_campaign=<main_campaign_id>)
mcp__meta-ads__update_ad(ad_id=..., status=PAUSED)
```

(Exact tool names depend on the Meta Ads MCP version. Inspect available tools at runtime — names like `mcp__meta-ads__list_ads` or `mcp__plugin_meta-ads__list_ads` are both possible.)

### CLI

```bash
meta ads list --campaign <testing_campaign_id> --since 7d --json
meta ad insights <ad_id> --json
meta ad duplicate <ad_id> --to-campaign <main_campaign_id>
meta ad pause <ad_id>
```

---

## Output

Write `<output>/autopilot-log/<date>-sweep.md`:

```markdown
# Sweep — 2026-05-08

## Promoted (3)
- ad_123 — CAC $18.40, 12 conversions → main campaign
- ad_456 — CAC $22.10, 8 conversions → main campaign
- ad_789 — CAC $19.80, 5 conversions → main campaign

## Killed (4)
- ad_111 — spent $42, 0 conversions
- ad_222 — spent $38, 0 conversions
- ad_333 — spent $35, 0 conversions
- ad_444 — spent $31, 0 conversions

## Held over (3)
- ad_555 — CAC $31, above threshold but 4 conversions, give it another week
- ad_666 — spent $24, 1 conversion, under spend threshold
- ad_777 — spent $18, 0 conversions, under spend threshold
```

Keep these logs forever. They're the audit trail when the user wants to know "why did the autopilot kill that ad."

---

## Edge cases

- **Empty testing campaign** (first run, no ads yet): log "no ads to sweep" and exit cleanly. Move on to Step 1.
- **Ad has conversions but missing spend** (rare data delay): skip, mark as held over, will be reprocessed next week.
- **Promote target campaign is paused:** still duplicate, but log a warning. The user may have paused it intentionally.
- **Same ad already promoted in a prior week:** check the name tag `[promoted YYYY-MM-DD]`. If present, don't promote again — it's already in main.
