-- One-off backfill, run 2026-09-09 against project mlionhgievukulyufnnr.
--
-- Merges the duplicate content_posts pairs the old postforme-sync left for the
-- Hey Cam brand (17d366ba-e58a-4c99-b965-a3f8df4b8c4a) from 2026-09-08 on:
--
--   booked row  provider 'postforme', postforme_post_id 'sp_…', no platform_post_id
--               (written by Compose / schedule-batch at schedule time)
--   synced row  provider 'postforme', no postforme_post_id, platform_post_id set,
--               status 'published' (imported from the PFM feed once the post went live)
--
-- Pairing is id-exact: the feed payloads kept in pfm_account_snapshots carry
-- both social_post_id ('sp_…') and platform_post_id for every post PFM
-- published, so a booked row is paired with the synced row that holds the
-- platform id PFM reported for its own post id and account. No caption or
-- timestamp matching.
--
-- Keeps the booked row (its brand, scheduled_for, media_type, deal fields),
-- copies platform_post_id / platform_url / published_at / status / metrics /
-- thumbnail / media_urls from the synced row, moves the synced row's daily
-- metric snapshots across, deletes the synced row.
--
-- Everything runs in one transaction. The unique index on
-- (user_id, platform, platform_post_id) means the delete has to land before
-- the booked row takes the id, hence the temp table.
--
-- To preview without writing, run only the CTE + SELECT that fills `pairs`.

begin;

create temp table pairs on commit drop as
with feed as (
  select distinct
    e->>'social_post_id'                 as social_post_id,
    e->>'platform_post_id'               as platform_post_id,
    e->>'social_account_id'              as social_account_id,
    e->>'platform_url'                   as platform_url,
    (e->>'posted_at')::timestamptz       as posted_at
  from public.pfm_account_snapshots s
  cross join lateral jsonb_array_elements(s.raw->'data') e
  where s.brand_id = '17d366ba-e58a-4c99-b965-a3f8df4b8c4a'
    and e->>'social_post_id' is not null
)
select
  b.id                 as keep_id,
  d.id                 as dup_id,
  b.platform,
  f.social_post_id,
  f.platform_post_id,
  coalesce(d.platform_url, f.platform_url) as platform_url,
  coalesce(d.published_at, f.posted_at)    as published_at,
  d.thumbnail_url,
  d.media_urls,
  d.views, d.likes, d.comments, d.saves, d.shares, d.reach, d.engagement_rate
from public.content_posts b
join feed f
  on f.social_post_id = b.postforme_post_id
 and f.social_account_id = b.social_account_id
join public.content_posts d
  on d.user_id = b.user_id
 and d.platform = b.platform
 and d.platform_post_id = f.platform_post_id
 and d.id <> b.id
where b.brand_id = '17d366ba-e58a-4c99-b965-a3f8df4b8c4a'
  and b.provider = 'postforme'
  and b.platform_post_id is null
  and b.scheduled_for >= '2026-09-08'
  and d.provider = 'postforme'
  and d.postforme_post_id is null
  and d.status = 'published';

-- 1. Daily metric snapshots follow the post. The booked rows have none today;
--    the NOT EXISTS guards the (post_id, snapshot_date) primary key anyway.
update public.content_post_metrics_daily m
   set post_id = p.keep_id
  from pairs p
 where m.post_id = p.dup_id
   and not exists (
     select 1 from public.content_post_metrics_daily k
      where k.post_id = p.keep_id and k.snapshot_date = m.snapshot_date
   );

-- 2. Drop the synced duplicates (FKs on post_analytics / playbook_tasks /
--    content_post_metrics_daily cascade; nothing else references them).
delete from public.content_posts d
 using pairs p
 where d.id = p.dup_id;

-- 3. Stamp the booked rows.
update public.content_posts b
   set status          = 'published',
       publish_status  = 'published',
       publish_error   = null,
       published_at    = p.published_at,
       platform_post_id = p.platform_post_id,
       platform_url    = coalesce(p.platform_url, b.platform_url),
       thumbnail_url   = coalesce(p.thumbnail_url, b.thumbnail_url),
       media_urls      = case when coalesce(array_length(p.media_urls, 1), 0) > 0
                              then p.media_urls else b.media_urls end,
       views = p.views, likes = p.likes, comments = p.comments, saves = p.saves,
       shares = p.shares, reach = p.reach, engagement_rate = p.engagement_rate
  from pairs p
 where b.id = p.keep_id;

-- 4. The status flip fires create_playbook_tasks ("post a story now",
--    "engagement window: next hour"). Those are stale for day-old posts, so
--    drop the ones this transaction just created (now() is fixed per
--    transaction, so created_at = now() is exactly that set).
delete from public.playbook_tasks t
 using pairs p
 where t.content_post_id = p.keep_id
   and t.created_at = now();

select platform, keep_id, dup_id, social_post_id, platform_post_id, published_at, views
  from pairs
 order by published_at, platform;

commit;
