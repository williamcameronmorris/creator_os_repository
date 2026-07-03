-- Watch feature (creator inspiration/competition).
-- suggested_creators + suggested_creator_videos are SHARED niche-level data
-- (populated by a discovery job); tracked_creators is per-user pins.

create table if not exists public.suggested_creators (
  id uuid primary key default gen_random_uuid(),
  platform text not null,
  niche text not null,
  channel_id text not null,
  handle text,
  title text not null,
  subscriber_count bigint,
  avg_views bigint,
  thumbnail_url text,
  rank int default 0,
  refreshed_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (platform, niche, channel_id)
);
create index if not exists idx_suggested_creators_niche on public.suggested_creators (platform, niche, rank);

create table if not exists public.suggested_creator_videos (
  id uuid primary key default gen_random_uuid(),
  suggested_creator_id uuid references public.suggested_creators(id) on delete cascade,
  platform text not null,
  video_id text not null,
  title text not null,
  thumbnail_url text,
  view_count bigint,
  published_at timestamptz,
  is_top boolean default false,
  created_at timestamptz default now(),
  unique (suggested_creator_id, video_id)
);
create index if not exists idx_suggested_videos_creator on public.suggested_creator_videos (suggested_creator_id);

create table if not exists public.tracked_creators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  channel_id text not null,
  handle text,
  title text not null,
  thumbnail_url text,
  created_at timestamptz default now(),
  unique (user_id, platform, channel_id)
);
create index if not exists idx_tracked_creators_user on public.tracked_creators (user_id);

alter table public.suggested_creators enable row level security;
alter table public.suggested_creator_videos enable row level security;
alter table public.tracked_creators enable row level security;

create policy "read suggested creators" on public.suggested_creators for select to authenticated using (true);
create policy "read suggested videos" on public.suggested_creator_videos for select to authenticated using (true);

create policy "own tracked read" on public.tracked_creators for select to authenticated using (auth.uid() = user_id);
create policy "own tracked insert" on public.tracked_creators for insert to authenticated with check (auth.uid() = user_id);
create policy "own tracked delete" on public.tracked_creators for delete to authenticated using (auth.uid() = user_id);
