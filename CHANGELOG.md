# Changelog

## 1.0.0 — September 2026

First tagged release. The work through September was a launch pass across the
whole app rather than one feature.

**Posting.** The per-platform publish paths were reworked: YouTube posts carry
a real title, uploads are capped at each platform's size limit, scheduling
enforces a lead time, and every publish path checks that the account it is
posting to belongs to the active brand. Server-side batch scheduling runs
behind a cron secret.

**Voice and AI.** The voice profile is built from the first connected account
and every generator — captions, scripts, ideas, the daily brief — is scoped to
a brand instead of to the user, so a second brand no longer writes in the
first one's voice.

**Analytics.** Follower counts come from the platforms rather than being
inferred, engagement rate is calculated against reach, and day ranges are
resolved in UTC so a post does not move between days. Syncs carry followers
forward when a feed returns empty and flag the platform that went quiet.

**Ideas.** Suggestions are grounded in actual post performance, keep a link to
the source post they came from, and land on the platform that post ran on.

**Hardening.** AI quota RPCs are locked to the service role and fail closed,
account deletion cascades brands and purges storage, media is served through
signed URLs, passwords need ten characters, every `brand_id` foreign key is
indexed, and the app has real privacy, terms, 404 and error-boundary pages.

**Type scale.** The base type scale was raised to a readable floor, arbitrary
sizes floored at 12px, and button labels set in sentence case.
