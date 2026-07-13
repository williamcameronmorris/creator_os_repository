-- Account separation: per-account voice, niche, and analytics.
--
-- Multi-account v1 (20260712100000) gave content_posts per-account attribution.
-- This migration extends the separation to the tables that power Voice, Watch
-- niche, and Analytics, so each connected social account can carry its OWN
-- voice profile, its own niche, and its own metrics — selected app-wide via
-- the new Account Switcher.
--
-- Design decisions:
--
--   * "User-level" rows keep social_account_id NULL. They are the legacy /
--     fallback layer: a user's original voice profile and their pre-separation
--     metrics rows stay exactly where they are and keep working. Account-
--     scoped rows are ADDITIVE.
--
--   * Uniqueness with a nullable account column: Postgres UNIQUE treats NULLs
--     as distinct, so a plain UNIQUE(user_id, social_account_id) would allow
--     unlimited duplicate user-level rows. We use a STORED generated column
--     social_account_key = coalesce(social_account_id, '') and put the unique
--     constraint on that. This is the "coalesce-style" key, materialized as a
--     real column so PostgREST upserts (supabase-js `onConflict`) can target
--     it — an expression index (unique on coalesce(...)) can NOT be targeted
--     by ON CONFLICT column inference, which would silently break every
--     existing upsert in the edge functions.
--
--   * profiles.niche_preference is NOT dropped. It stays as the user-level
--     fallback: niche resolution order everywhere is
--     account profile.niche → profiles.niche_preference.
--
-- Deploy order (see PR body): apply this migration FIRST, then immediately
-- deploy analyze-captions + postforme-sync (their upsert conflict targets
-- change from user_id / user_id,platform,date to the new keys), then the
-- remaining functions, then the client.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1a. user_content_profiles → one voice/niche profile per (user, account)
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.user_content_profiles
  add column if not exists social_account_id text;
alter table public.user_content_profiles
  add column if not exists account_username text;
-- Niche becomes account-scoped: @gibsunday = "guitar", @heycam = "creator
-- coaching". NULL means "no account-specific niche — fall back to
-- profiles.niche_preference".
alter table public.user_content_profiles
  add column if not exists niche text;

comment on column public.user_content_profiles.social_account_id is
  'Post for Me social account id this profile belongs to. NULL = the user-level/legacy profile (fallback voice).';
comment on column public.user_content_profiles.account_username is
  'Denormalized @username of the social account at analysis time, for UI labels.';
comment on column public.user_content_profiles.niche is
  'Account-scoped niche. Resolution order: this column → profiles.niche_preference.';

-- Materialized coalesce key ('' = user-level row) so supabase-js can upsert
-- with onConflict: "user_id,social_account_key".
alter table public.user_content_profiles
  add column if not exists social_account_key text
  generated always as (coalesce(social_account_id, '')) stored;

-- Replace the one-row-per-user constraint with one-row-per-(user, account).
-- The inline `user_id ... UNIQUE` from 20260323000001 auto-named itself
-- user_content_profiles_user_id_key. Existing rows all have
-- social_account_id NULL → key '' → still exactly one legacy row per user.
alter table public.user_content_profiles
  drop constraint if exists user_content_profiles_user_id_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_content_profiles_user_account_key'
      and conrelid = 'public.user_content_profiles'::regclass
  ) then
    alter table public.user_content_profiles
      add constraint user_content_profiles_user_account_key
      unique (user_id, social_account_key);
  end if;
end $$;

-- Fast "all profiles for this user" lookups (Voice card selector).
create index if not exists idx_user_content_profiles_user_account
  on public.user_content_profiles (user_id, social_account_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. platform_metrics → per-account daily metric rows can coexist with legacy
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.platform_metrics
  add column if not exists social_account_id text;

comment on column public.platform_metrics.social_account_id is
  'Post for Me social account id this daily row belongs to. NULL = legacy/user-level roll-up (pre-separation, or written by a sync that has not been made account-aware yet).';

alter table public.platform_metrics
  add column if not exists social_account_key text
  generated always as (coalesce(social_account_id, '')) stored;

-- Replace UNIQUE(user_id, platform, date) — auto-named
-- platform_metrics_user_id_platform_date_key by the inline table constraint in
-- 20251229035337 — with (user_id, platform, date, account-key) so a legacy
-- roll-up row and future per-account rows for the same day coexist.
-- postforme-sync's upsert conflict target changes in lockstep (same PR).
alter table public.platform_metrics
  drop constraint if exists platform_metrics_user_id_platform_date_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'platform_metrics_user_platform_date_account_key'
      and conrelid = 'public.platform_metrics'::regclass
  ) then
    alter table public.platform_metrics
      add constraint platform_metrics_user_platform_date_account_key
      unique (user_id, platform, date, social_account_key);
  end if;
end $$;

-- NOTE on content_post_metrics_daily: its key is PRIMARY KEY (post_id,
-- snapshot_date) — already account-safe, because each content_posts row is a
-- per-account mirror since multi-account v1. Account attribution joins through
-- content_posts.social_account_id. No change needed here.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1c. Backfill (safe + idempotent)
-- ─────────────────────────────────────────────────────────────────────────────
-- Every user today has at most ONE connected account per platform, so legacy
-- NULL rows can be attributed unambiguously: stamp them with the latest
-- pfm_account_snapshots row per (user_id, platform).
--
-- pfm_account_snapshots has NO migration file — it exists only in prod
-- (created ad hoc; written by postforme-sync, cleared by delete-account), so
-- shadow/branch databases won't have it. Guard with to_regclass and run the
-- backfill via dynamic SQL so this migration is a no-op there instead of an
-- error. Column set is also defensive: order by created_at only if that
-- column exists (single-account-per-platform means any row is correct even
-- unordered).

do $$
declare
  has_created_at boolean;
  order_clause text := '';
begin
  if to_regclass('public.pfm_account_snapshots') is null then
    raise notice 'pfm_account_snapshots not present (shadow/empty DB) — skipping account backfill';
    return;
  end if;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pfm_account_snapshots'
      and column_name = 'created_at'
  ) into has_created_at;

  if has_created_at then
    order_clause := ', created_at desc';
  end if;

  -- content_posts: only rows still missing attribution (idempotent — re-running
  -- finds nothing left to update).
  execute format($sql$
    with latest as (
      select distinct on (user_id, platform)
        user_id, platform, pfm_account_id, username
      from public.pfm_account_snapshots
      order by user_id, platform%s
    )
    update public.content_posts cp
    set social_account_id = l.pfm_account_id,
        account_username  = coalesce(cp.account_username, l.username)
    from latest l
    where cp.social_account_id is null
      and cp.user_id  = l.user_id
      and cp.platform = l.platform
  $sql$, order_clause);

  -- platform_metrics: same attribution. These become the selected-account's
  -- history in Analytics; rows written by the (still user-level) sync after
  -- this migration stay NULL until the per-account sync follow-up ships and
  -- appear under "All accounts".
  execute format($sql$
    with latest as (
      select distinct on (user_id, platform)
        user_id, platform, pfm_account_id
      from public.pfm_account_snapshots
      order by user_id, platform%s
    )
    update public.platform_metrics pm
    set social_account_id = l.pfm_account_id
    from latest l
    where pm.social_account_id is null
      and pm.user_id  = l.user_id
      and pm.platform = l.platform
  $sql$, order_clause);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1d. profiles.niche_preference — intentionally KEPT (user-level fallback).
-- ─────────────────────────────────────────────────────────────────────────────
