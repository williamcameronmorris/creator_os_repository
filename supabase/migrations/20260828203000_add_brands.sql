-- Brand workspaces, Phase 1 of 2: ADDITIVE ONLY.
--
-- Decided 2026-08-28: a brand (Gibsunday, Hey Cam, ...) is a separate business,
-- so the model is full isolation — a brand never sees another brand's content,
-- ideas, deals, voice or Clio memory, and nothing aggregates across brands.
--
-- A brand sits ABOVE social accounts: brand → owns Post for Me accounts → owns
-- everything written about them. Post for Me itself stays partitioned by user
-- (its external_id is the user id), so the brand assignment is ours, in
-- brand_social_accounts.
--
-- Nothing here is NOT NULL and no RLS changes touch existing tables, so the app
-- keeps working unchanged between this migration and the isolation one that
-- follows. Every brand_id is backfilled to the user's default brand. Every
-- statement is idempotent so the migration can be re-run safely.

-- ── 1. The tenant ─────────────────────────────────────────────────────────
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  slug       text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);
create index if not exists brands_owner_idx on public.brands (owner_id);

alter table public.brands enable row level security;
drop policy if exists "owner all" on public.brands;
create policy "owner all" on public.brands
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- ── 2. Which Post for Me account belongs to which brand ───────────────────
-- An account belongs to exactly one brand, hence the primary key.
-- direct_platform marks the row that also carries the direct Meta/YouTube
-- grant (the follower-count syncs read tokens from profiles and need a brand).
create table if not exists public.brand_social_accounts (
  brand_id        uuid not null references public.brands(id) on delete cascade,
  pfm_account_id  text primary key,
  platform        text not null,
  username        text,
  direct_platform text,
  created_at      timestamptz not null default now()
);
create index if not exists brand_social_accounts_brand_idx on public.brand_social_accounts (brand_id);

alter table public.brand_social_accounts enable row level security;
drop policy if exists "owner via brand" on public.brand_social_accounts;
create policy "owner via brand" on public.brand_social_accounts
  for all to authenticated
  using  (brand_id in (select id from public.brands where owner_id = (select auth.uid())))
  with check (brand_id in (select id from public.brands where owner_id = (select auth.uid())));

-- ── 3. brand_id on every brand-scoped table (nullable for now) ────────────
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
    execute format('alter table public.%I add column if not exists brand_id uuid references public.brands(id)', t);
  end loop;
end $$;

-- ── 4. One default brand per existing user ────────────────────────────────
-- Name from the primary Instagram handle where there is one (that IS the
-- brand for a creator), else display name, else a placeholder. For Cam this
-- yields "Gibsunday".
insert into public.brands (owner_id, name, slug)
select p.id,
       initcap(coalesce(nullif(p.instagram_handle,''), nullif(p.display_name,''), 'My brand')),
       trim(both '-' from regexp_replace(lower(coalesce(nullif(p.instagram_handle,''), nullif(p.display_name,''), 'my-brand')), '[^a-z0-9]+', '-', 'g'))
from public.profiles p
where not exists (select 1 from public.brands b where b.owner_id = p.id)
on conflict (owner_id, slug) do nothing;

-- ── 5. Backfill brand_id from user_id ─────────────────────────────────────
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
    execute format(
      'update public.%I x set brand_id = b.id from public.brands b where x.brand_id is null and b.owner_id = x.user_id',
      t);
  end loop;
end $$;

-- The two challenge leaf tables have no user_id; they inherit via their parent.
update public.challenge_day_completions c set brand_id = p.brand_id
  from public.challenge_progress p where c.brand_id is null and p.id = c.progress_id;
update public.challenge_metrics c set brand_id = p.brand_id
  from public.challenge_progress p where c.brand_id is null and p.id = c.progress_id;

-- ── 6. Map every known Post for Me account to its user's default brand ────
-- postforme-sync writes a snapshot per account every 6 hours, so the last 30
-- days is the authoritative list of what is connected.
insert into public.brand_social_accounts (brand_id, pfm_account_id, platform, username)
select distinct on (s.pfm_account_id)
       b.id, s.pfm_account_id, s.platform, s.username
from public.pfm_account_snapshots s
join public.brands b on b.owner_id = s.user_id
where s.snapshot_at > now() - interval '30 days'
order by s.pfm_account_id, s.snapshot_at desc
on conflict (pfm_account_id) do nothing;

-- ── 7. Fix the roll-up collision ──────────────────────────────────────────
-- platform_metrics was unique on (user_id, platform, date, social_account_key).
-- Two brands on Instagram, same user, same day, both user-level roll-ups
-- (social_account_id null) would collide. Key on brand instead. Safe to build
-- now: brand_id is 1:1 with user_id after backfill, so no duplicates exist.
-- The old key is a CONSTRAINT (not a bare index), so it is dropped as one.
create unique index if not exists platform_metrics_brand_platform_date_account_key
  on public.platform_metrics (brand_id, platform, date, social_account_key);
alter table public.platform_metrics
  drop constraint if exists platform_metrics_user_platform_date_account_key;

-- ── 8. Lookup indexes on the big tables ───────────────────────────────────
create index if not exists content_posts_brand_idx              on public.content_posts (brand_id);
create index if not exists content_post_metrics_daily_brand_idx on public.content_post_metrics_daily (brand_id);
create index if not exists pfm_account_snapshots_brand_idx      on public.pfm_account_snapshots (brand_id);
create index if not exists ai_daily_briefs_brand_idx            on public.ai_daily_briefs (brand_id);

comment on table public.brands is
  'Brand workspaces. A brand is a separate business with full isolation: it owns social accounts and everything written about them. Single owner in v1; brand_members can be added later.';
comment on table public.brand_social_accounts is
  'Assigns each Post for Me account to exactly one brand. Post for Me stays partitioned by user; this split is ours.';
