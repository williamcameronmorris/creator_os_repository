-- The 6 inspiration_archetypes were derived from creator-coaching competitors
-- (Authority Drop, Contrarian Reframe, ...). Gibsunday posts guitar content, so
-- a first classification run returned "no fit" at 0.95 confidence for all 25
-- posts in the test batch. The classifier was right; the taxonomy was for the
-- wrong niche.
--
-- These five lanes come from Cam's own Starter Kit to Content Creation, and are
-- niche-agnostic by design. `winning_looks_like` is lifted verbatim from its
-- "What winning content looks like" page so the app hands the creator back his
-- own guidance rather than a generated paraphrase.
create table if not exists public.content_lanes (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  think_of           text,
  definition         text not null,
  winning_looks_like text not null,
  sort_order         int  not null default 0,
  created_at         timestamptz not null default now()
);

alter table public.content_lanes enable row level security;

-- Shared reference data, not user data. Readable by any signed-in user; writes
-- stay service-role only (no policy grants insert/update/delete).
drop policy if exists "content_lanes readable" on public.content_lanes;
create policy "content_lanes readable" on public.content_lanes
  for select to authenticated using (true);

insert into public.content_lanes (slug, name, think_of, definition, winning_looks_like, sort_order)
values
  ('education','Education / How-To','Ali Abdaal',
   'You teach one specific thing well. Tutorials, breakdowns, frameworks. Evergreen and endlessly searchable, this is where most follower growth comes from.',
   'The best how-to content earns the save. It is so clear and useful that people bookmark it to come back to. Teach like the viewer has zero context, and put the payoff up front.',1),
  ('reviews','Reviews / Recommendations','Marques Brownlee',
   'You demo and compare the tools, products, and gear in your niche. People are always researching before they buy, and they trust a creator over an ad.',
   'The best review content has a point of view. Not just specs and features, but here is who this is for and when you would actually use it. Put the product in context.',2),
  ('bts','Behind-the-Scenes / Process','Casey Neistat',
   'You show how you actually make things. The setup, the messy middle, the real work. People connect with the process as much as the result.',
   'The best BTS content makes the invisible visible. Show the setup, the failures, the reps. People follow the human behind the output, not just the polished result.',3),
  ('opinion','Opinion / Commentary','Hank Green',
   'You take a clear stance on your space. Hot takes, reactions, perspective. Personality scales, and opinions create conversation.',
   'The best opinion content has a real stance and backs it up. Lukewarm takes get scrolled. Say what people are thinking but not saying, with enough knowledge that nobody can dismiss you.',4),
  ('entertainment','Entertainment / Relatable','Zach King',
   'Skits, trends, and relatable moments your audience sees themselves in. Lower craft demand, the widest top of funnel you have got.',
   'The best relatable content makes someone think that is literally me and send it to a friend. Make them feel seen in the first 2 seconds, before they even know why.',5)
on conflict (slug) do nothing;

alter table public.content_posts
  add column if not exists lane_id uuid references public.content_lanes(id),
  add column if not exists lane_confidence numeric;

create index if not exists content_posts_lane_idx
  on public.content_posts (user_id, platform, lane_id);

comment on column public.content_posts.lane_id is
  'Content lane from content_lanes (Starter Kit taxonomy). Null when the post fits none confidently; post_performance then falls back to media_type grouping.';
