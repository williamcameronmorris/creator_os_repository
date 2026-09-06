-- Media kit, phase 1.
--
-- A public, per-brand page a creator sends to brands: numbers, rate card,
-- top posts, a contact form. One kit per brand. Three tables, owner-only
-- RLS with the brand-isolation policy on top, and NO anon policy anywhere:
-- the public read happens only through the public-media-kit edge function
-- on the service role, which returns a hand-whitelisted payload.

-- The Post for Me feed hands us each post's public URL; store it so the kit
-- can link a top post to the real thing.
alter table public.content_posts add column if not exists platform_url text;

-- ── 1. The kit ────────────────────────────────────────────────────────────
create table if not exists public.media_kits (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  brand_id          uuid not null references public.brands(id) on delete cascade,
  slug              text not null,
  is_published      boolean not null default false,

  display_name      text,
  headline          text,
  bio               text,
  avatar_url        text,
  location          text,
  website           text,

  -- [{ platform, visible, show_followers, show_growth, show_engagement,
  --    show_avg_views, followers_override, followers_override_at }]
  -- followers_override is for platforms with no follower source (TikTok,
  -- Threads, Facebook, and any platform on a brand without a direct grant).
  platforms         jsonb not null default '[]'::jsonb,

  show_top_posts    boolean not null default true,
  top_posts_limit   int     not null default 6,

  contact_mode      text not null default 'form'
                    check (contact_mode in ('form','email','link')),
  contact_email     text,
  contact_url       text,
  contact_label     text not null default 'Contact for collabs',

  stale_after_days  int  not null default 14,
  frozen_stats      jsonb,
  theme             text not null default 'cream',
  view_count        int  not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint media_kits_slug_format check (slug ~ '^[a-zA-Z0-9][a-zA-Z0-9_-]{2,31}$'),
  constraint media_kits_one_per_brand unique (brand_id)
);
create unique index if not exists media_kits_slug_key on public.media_kits (lower(slug));
create index if not exists media_kits_user_idx on public.media_kits (user_id);

-- ── 2. Rate card ──────────────────────────────────────────────────────────
create table if not exists public.media_kit_rates (
  id            uuid primary key default gen_random_uuid(),
  media_kit_id  uuid not null references public.media_kits(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  brand_id      uuid not null references public.brands(id) on delete cascade,
  label         text not null,
  description   text,
  price_cents   integer,                 -- null renders as "Inquire"
  price_prefix  text,                    -- "from", "starting at"
  currency      text not null default 'USD',
  platform      text,
  sort_order    int  not null default 0,
  is_visible    boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists media_kit_rates_kit_idx on public.media_kit_rates (media_kit_id, sort_order);

-- ── 3. Inbound leads ──────────────────────────────────────────────────────
-- Separate from brand_prospects on purpose: that is core CRM and must never
-- be reachable from an anonymous code path. Converting is a deliberate click.
create table if not exists public.media_kit_leads (
  id                    uuid primary key default gen_random_uuid(),
  media_kit_id          uuid not null references public.media_kits(id) on delete cascade,
  user_id               uuid not null references public.profiles(id) on delete cascade,
  brand_id              uuid not null references public.brands(id) on delete cascade,
  brand_name            text,
  contact_name          text,
  contact_email         text not null,
  budget_tier           text,
  message               text,
  status                text not null default 'new'
                        check (status in ('new','read','converted','spam')),
  converted_prospect_id uuid references public.brand_prospects(id),
  ip_hash               text,
  user_agent            text,
  created_at            timestamptz not null default now()
);
create index if not exists media_kit_leads_user_idx on public.media_kit_leads (user_id, created_at desc);
create index if not exists media_kit_leads_rate_idx on public.media_kit_leads (media_kit_id, ip_hash, created_at desc);

-- ── 4. Triggers ───────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['media_kits','media_kit_rates','media_kit_leads'] loop
    execute format('drop trigger if exists set_brand_id_default on public.%I', t);
    execute format('create trigger set_brand_id_default before insert on public.%I for each row execute function public.brand_id_default()', t);
  end loop;
end $$;
drop trigger if exists media_kits_updated_at on public.media_kits;
create trigger media_kits_updated_at before update on public.media_kits
  for each row execute function public.update_updated_at_column();

-- ── 5. RLS: owner-only, brand-isolated, nothing for anon ──────────────────
alter table public.media_kits       enable row level security;
alter table public.media_kit_rates  enable row level security;
alter table public.media_kit_leads  enable row level security;

do $$
declare t text;
begin
  foreach t in array array['media_kits','media_kit_rates'] loop
    execute format('drop policy if exists "owner select" on public.%I', t);
    execute format('drop policy if exists "owner insert" on public.%I', t);
    execute format('drop policy if exists "owner update" on public.%I', t);
    execute format('drop policy if exists "owner delete" on public.%I', t);
    execute format('create policy "owner select" on public.%I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "owner insert" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner update" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "owner delete" on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
  -- Leads are written by the edge function only; owners read, triage, delete.
  drop policy if exists "owner select" on public.media_kit_leads;
  drop policy if exists "owner update" on public.media_kit_leads;
  drop policy if exists "owner delete" on public.media_kit_leads;
  create policy "owner select" on public.media_kit_leads for select to authenticated using (user_id = (select auth.uid()));
  create policy "owner update" on public.media_kit_leads for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
  create policy "owner delete" on public.media_kit_leads for delete to authenticated using (user_id = (select auth.uid()));

  foreach t in array array['media_kits','media_kit_rates','media_kit_leads'] loop
    execute format('drop policy if exists "brand isolation" on public.%I', t);
    execute format($p$
      create policy "brand isolation" on public.%I
        as restrictive for all to authenticated
        using      (brand_id in (select id from public.brands where owner_id = (select auth.uid())))
        with check (brand_id in (select id from public.brands where owner_id = (select auth.uid())))
    $p$, t);
  end loop;
end $$;

-- ── 6. View counter, callable only by the service role ────────────────────
create or replace function public.increment_media_kit_views(p_kit_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.media_kits set view_count = view_count + 1 where id = p_kit_id;
$$;
revoke all on function public.increment_media_kit_views(uuid) from public, anon, authenticated;
