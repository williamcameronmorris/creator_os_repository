-- Multi-account compose + platform widening.
--
-- 1. content_posts gains per-account attribution columns so a single PFM post
--    fanned out to N accounts mirrors as N rows, each tied to the exact
--    social account it went to (not just the platform).
--
-- 2. Platform CHECK constraints across the metrics tables are widened to the
--    full PFM-supported set. Today platform_metrics / content_post_metrics_daily /
--    post_analytics only allow ('instagram','tiktok','youtube'), which means
--    postforme-sync's platform_metrics upserts SILENTLY FAIL for facebook,
--    threads, x, and bluesky posts — the insert errors are collected into the
--    sync summary but the rows never land, so Analytics shows nothing for
--    those platforms. Widening fixes that.
--
-- 3. content_posts_platform_check gains 'bluesky'. linkedin stays in the
--    allowed set — removing a value from a CHECK is pointless churn and would
--    break any legacy linkedin rows.

-- 1. Per-account attribution on content_posts -------------------------------
-- social_account_id  = PFM social account id the mirror row belongs to
-- account_username   = display handle at publish time (denormalized so the UI
--                      can render @handle without a PFM round-trip)
alter table public.content_posts
  add column if not exists social_account_id text;
alter table public.content_posts
  add column if not exists account_username text;

comment on column public.content_posts.social_account_id is
  'Post for Me social account id this mirror row was published to. Null for legacy rows created before multi-account support.';
comment on column public.content_posts.account_username is
  'Denormalized @username of the social account at publish time.';

-- Sync + webhook match on (postforme_post_id, social_account_id).
create index if not exists idx_content_posts_pfm_account
  on public.content_posts (postforme_post_id, social_account_id)
  where postforme_post_id is not null;

-- 2a. platform_metrics: widen platform CHECK --------------------------------
-- Original constraint from 20251229035337_add_real_time_social_analytics.sql:
--   platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube'))
-- Postgres auto-names inline column CHECKs <table>_<column>_check.
alter table public.platform_metrics
  drop constraint if exists platform_metrics_platform_check;
alter table public.platform_metrics
  add constraint platform_metrics_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','x','bluesky']));

-- 2b. content_post_metrics_daily: widen platform CHECK -----------------------
-- Original from 20260507000002_add_content_post_metrics_daily.sql (ig/tt/yt only).
alter table public.content_post_metrics_daily
  drop constraint if exists content_post_metrics_daily_platform_check;
alter table public.content_post_metrics_daily
  add constraint content_post_metrics_daily_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','x','bluesky']));

-- 2c. post_analytics: widen platform CHECK -----------------------------------
-- Original from 20251229022735_add_socialflow_features.sql (ig/tt/yt only).
alter table public.post_analytics
  drop constraint if exists post_analytics_platform_check;
alter table public.post_analytics
  add constraint post_analytics_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','x','bluesky']));

-- 3. content_posts: add bluesky to the platform CHECK ------------------------
-- Previous set (20260701000000_widen_content_posts_checks.sql):
--   instagram, tiktok, youtube, facebook, threads, x, linkedin
-- linkedin is intentionally KEPT even though the PFM connect button for it is
-- being removed (PFM doesn't support linkedin) — legacy rows may exist.
alter table public.content_posts
  drop constraint if exists content_posts_platform_check;
alter table public.content_posts
  add constraint content_posts_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','x','linkedin','bluesky']));
