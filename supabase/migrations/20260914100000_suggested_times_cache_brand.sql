-- suggested_times_cache is read per brand.
--
-- The cache was keyed (user_id, platform), so two brands on the same platform
-- would have shared one row and the Write-a-post chips read across brands.
-- Same shape as the other brand-scoped tables (20260904170000_brand_isolation):
-- brand_id backfilled to the owner's default brand, filled by trigger when an
-- insert omits it, NOT NULL, and a restrictive policy on top of the existing
-- user_id one. The key becomes (brand_id, platform).

alter table public.suggested_times_cache
  add column if not exists brand_id uuid references public.brands(id) on delete cascade;

update public.suggested_times_cache c
set brand_id = b.id
from public.brands b
where c.brand_id is null and b.owner_id = c.user_id and b.is_default;

drop trigger if exists set_brand_id_default on public.suggested_times_cache;
create trigger set_brand_id_default
  before insert on public.suggested_times_cache
  for each row execute function public.brand_id_default();

do $$
declare n bigint;
begin
  select count(*) into n from public.suggested_times_cache where brand_id is null;
  if n > 0 then
    raise exception 'suggested_times_cache: % rows without a default brand', n;
  end if;
end $$;

alter table public.suggested_times_cache alter column brand_id set not null;

alter table public.suggested_times_cache drop constraint if exists suggested_times_cache_pkey;
alter table public.suggested_times_cache add primary key (brand_id, platform);
create index if not exists suggested_times_cache_user_idx on public.suggested_times_cache (user_id);

alter table public.suggested_times_cache enable row level security;
drop policy if exists "brand isolation" on public.suggested_times_cache;
create policy "brand isolation" on public.suggested_times_cache
  as restrictive for all to authenticated
  using      (brand_id in (select id from public.brands where owner_id = (select auth.uid())))
  with check (brand_id in (select id from public.brands where owner_id = (select auth.uid())));
