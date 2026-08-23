-- Archetype classification on the creator's own posts. Superseded for grouping
-- purposes by content_lanes (see 20260821195002) but kept: inspiration_archetypes
-- still serves competitor teardowns in Watch.
alter table public.content_posts
  add column if not exists archetype_id uuid references public.inspiration_archetypes(id),
  add column if not exists archetype_confidence numeric;

create index if not exists content_posts_archetype_idx
  on public.content_posts (user_id, platform, archetype_id);

comment on column public.content_posts.archetype_id is
  'Format archetype from inspiration_archetypes. Null when unclassified or below the confidence floor.';
