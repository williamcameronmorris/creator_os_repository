-- Brands, phase 2: isolation.
--
-- Phase 1 (20260828203000_add_brands.sql) added brand_id everywhere, nullable,
-- and backfilled it. Phase 3 (PR #34) made every sync writer stamp it. This
-- migration makes the column mandatory and enforces isolation at the row.
--
--   1. brands.is_default: one flagged brand per owner. Every existing brand
--      shares the same backfill created_at, so "first created" was never a
--      safe way to pick one.
--   2. A BEFORE INSERT trigger on every brand-scoped table fills a missing
--      brand_id with the owner's default brand. The frontend does not know
--      about brands until Phase 4 ships the switcher; this keeps every Studio
--      and Patra insert working meanwhile, and stays as a safety net after.
--   3. brand_id NOT NULL on all 30 tables, after asserting nothing is null.
--   4. Two keys that were per user become per brand: one brief per brand per
--      day, one voice profile per brand per account.
--   5. A RESTRICTIVE policy per table: the row's brand must be owned by the
--      caller. Restrictive policies are AND-ed with the existing permissive
--      user_id policies, so both must pass. A second PERMISSIVE policy would
--      have been OR-ed and added nothing.
--   6. New profiles get a default brand automatically.

-- ── 1. Default brand per owner ────────────────────────────────────────────
alter table public.brands add column if not exists is_default boolean not null default false;

update public.brands b set is_default = true
from (select distinct on (owner_id) id from public.brands order by owner_id, created_at, id) f
where b.id = f.id
  and not exists (select 1 from public.brands o where o.owner_id = b.owner_id and o.is_default);

create unique index if not exists brands_one_default_per_owner
  on public.brands (owner_id) where is_default;

-- ── 2. Fill triggers ──────────────────────────────────────────────────────
create or replace function public.brand_id_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id is null then
    select id into new.brand_id
    from public.brands
    where owner_id = new.user_id and is_default
    limit 1;
    if new.brand_id is null then
      raise exception 'no default brand for user %', new.user_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

-- challenge_day_completions / challenge_metrics have no user_id; they inherit
-- from the parent challenge_progress row.
create or replace function public.brand_id_from_progress()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.brand_id is null then
    select brand_id into new.brand_id
    from public.challenge_progress
    where id = new.progress_id;
    if new.brand_id is null then
      raise exception 'no brand on challenge_progress %', new.progress_id
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'content_posts','content_post_metrics_daily','platform_metrics','pfm_account_snapshots',
    'ai_content_suggestions','ai_daily_briefs','playbook_tasks','comments','post_analytics',
    'content_workflow_stages','media_library','user_content_profiles','saved_content_ideas',
    'challenge_progress',
    'deals','deal_activities','deal_contracts','deal_fit_checks','deal_invoices',
    'deal_performance_reports','deal_production_checklist','deal_renewals','deal_reports',
    'deal_stages','deal_templates','brand_prospects','brand_prospect_activities','revenue_records'
  ] loop
    execute format('drop trigger if exists set_brand_id_default on public.%I', t);
    execute format(
      'create trigger set_brand_id_default before insert on public.%I for each row execute function public.brand_id_default()', t);
  end loop;
  foreach t in array array['challenge_day_completions','challenge_metrics'] loop
    execute format('drop trigger if exists set_brand_id_default on public.%I', t);
    execute format(
      'create trigger set_brand_id_default before insert on public.%I for each row execute function public.brand_id_from_progress()', t);
  end loop;
end $$;

-- ── 3. Backfill stragglers, then NOT NULL ─────────────────────────────────
-- Rows written between the Phase 1 backfill and the Phase 3 writers (the
-- daily brief cron, mostly). Same rule as Phase 1: the owner's brand.
do $$
declare t text; n bigint;
begin
  foreach t in array array[
    'content_posts','content_post_metrics_daily','platform_metrics','pfm_account_snapshots',
    'ai_content_suggestions','ai_daily_briefs','playbook_tasks','comments','post_analytics',
    'content_workflow_stages','media_library','user_content_profiles','saved_content_ideas',
    'challenge_progress',
    'deals','deal_activities','deal_contracts','deal_fit_checks','deal_invoices',
    'deal_performance_reports','deal_production_checklist','deal_renewals','deal_reports',
    'deal_stages','deal_templates','brand_prospects','brand_prospect_activities','revenue_records'
  ] loop
    execute format(
      'update public.%I x set brand_id = b.id from public.brands b where x.brand_id is null and b.owner_id = x.user_id and b.is_default', t);
  end loop;

  update public.challenge_day_completions c set brand_id = p.brand_id
    from public.challenge_progress p where c.brand_id is null and p.id = c.progress_id;
  update public.challenge_metrics c set brand_id = p.brand_id
    from public.challenge_progress p where c.brand_id is null and p.id = c.progress_id;

  foreach t in array array[
    'content_posts','content_post_metrics_daily','platform_metrics','pfm_account_snapshots',
    'ai_content_suggestions','ai_daily_briefs','playbook_tasks','comments','post_analytics',
    'content_workflow_stages','media_library','user_content_profiles','saved_content_ideas',
    'challenge_progress','challenge_day_completions','challenge_metrics',
    'deals','deal_activities','deal_contracts','deal_fit_checks','deal_invoices',
    'deal_performance_reports','deal_production_checklist','deal_renewals','deal_reports',
    'deal_stages','deal_templates','brand_prospects','brand_prospect_activities','revenue_records'
  ] loop
    execute format('select count(*) from public.%I where brand_id is null', t) into n;
    if n > 0 then
      raise exception 'brand_isolation: % rows in % still have no brand_id; refusing to set NOT NULL', n, t;
    end if;
    execute format('alter table public.%I alter column brand_id set not null', t);
  end loop;
end $$;

-- ── 4. Keys that were per user become per brand ───────────────────────────
-- One brief per BRAND per day. Under the old key a second brand's brief would
-- have overwritten the first's. Safe to swap now: brand is 1:1 with user.
alter table public.ai_daily_briefs drop constraint if exists ai_daily_briefs_user_id_brief_date_key;
create unique index if not exists ai_daily_briefs_brand_date_key
  on public.ai_daily_briefs (brand_id, brief_date);

-- One voice profile per BRAND per account ('' = the brand-level row).
alter table public.user_content_profiles drop constraint if exists user_content_profiles_user_account_key;
create unique index if not exists user_content_profiles_brand_account_key
  on public.user_content_profiles (brand_id, social_account_key);

-- ── 5. Isolation policies ─────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'content_posts','content_post_metrics_daily','platform_metrics','pfm_account_snapshots',
    'ai_content_suggestions','ai_daily_briefs','playbook_tasks','comments','post_analytics',
    'content_workflow_stages','media_library','user_content_profiles','saved_content_ideas',
    'challenge_progress','challenge_day_completions','challenge_metrics',
    'deals','deal_activities','deal_contracts','deal_fit_checks','deal_invoices',
    'deal_performance_reports','deal_production_checklist','deal_renewals','deal_reports',
    'deal_stages','deal_templates','brand_prospects','brand_prospect_activities','revenue_records'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "brand isolation" on public.%I', t);
    execute format($p$
      create policy "brand isolation" on public.%I
        as restrictive for all to authenticated
        using      (brand_id in (select id from public.brands where owner_id = (select auth.uid())))
        with check (brand_id in (select id from public.brands where owner_id = (select auth.uid())))
    $p$, t);
  end loop;
end $$;

-- ── 6. New users get a default brand ──────────────────────────────────────
-- Same naming rule as the Phase 1 backfill: Instagram handle, else display
-- name, else a placeholder.
create or replace function public.create_default_brand()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.brands (owner_id, name, slug, is_default)
  values (
    new.id,
    initcap(coalesce(nullif(new.instagram_handle,''), nullif(new.display_name,''), 'My brand')),
    trim(both '-' from regexp_replace(lower(coalesce(nullif(new.instagram_handle,''), nullif(new.display_name,''), 'my-brand')), '[^a-z0-9]+', '-', 'g')),
    true)
  on conflict (owner_id, slug) do nothing;
  return new;
end
$$;

drop trigger if exists on_profile_created_create_brand on public.profiles;
create trigger on_profile_created_create_brand
  after insert on public.profiles
  for each row execute function public.create_default_brand();
