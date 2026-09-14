-- data_health: one row per BRAND and PLATFORM.
--
-- The brand-level view took max(date) and count(distinct platform) across
-- every platform, so one live platform hid a dead one: Gibsunday's Instagram
-- feed stopped returning posts on 2026-09-05 and the health panel reported
-- "Everything is syncing" for ten days. Every brand-level column keeps its
-- name and meaning; the per-platform columns are appended so the client can
-- flag the worst platform and say since when.
--
-- newest_metric_date now reads content_post_metrics_daily (post-level metrics
-- from the Post for Me feed) rather than platform_metrics, which the direct
-- follower syncs write every day whether or not the feed delivered anything.
--
-- engagement_daily: engagements per brand/platform/day as the SUM of each
-- post's day-over-day delta. The old Engagements figure was last-minus-first
-- of a lifetime total over a rolling 150-post window, so a post ageing out
-- read as zero growth and a new post injected its whole lifetime count in
-- one day. A post's first snapshot has no prior day and contributes nothing.

drop view if exists public.data_health;

create view public.data_health with (security_invoker = on) as
with plat as (
  select distinct b.id as brand_id, x.platform
  from public.brands b
  cross join lateral (
    select a.platform from public.brand_social_accounts a where a.brand_id = b.id
    union
    select c.platform from public.content_posts c where c.brand_id = b.id and c.status = 'published'
  ) x
  where x.platform is not null
),
brand_rows as (
  select b.id as brand_id, b.owner_id, b.is_default,
         pfm.accounts_connected,
         pfm.newest_snapshot_at,
         coalesce(cp.total_posts, 0::bigint) as total_posts,
         cp.newest_post_at,
         coalesce(cp.platforms_with_posts, 0::bigint) as platforms_with_posts,
         pm.newest_metric_date,
         coalesce(pm.platforms_with_metrics, 0::bigint) as platforms_with_metrics,
         coalesce(pp.scored_posts, 0::bigint) as scored_posts,
         coalesce(pp.posts_with_verdict, 0::bigint) as posts_with_verdict
  from public.brands b
  left join lateral (
    select count(distinct s.pfm_account_id) as accounts_connected,
           max(s.snapshot_at) as newest_snapshot_at
    from public.pfm_account_snapshots s
    where s.brand_id = b.id and s.snapshot_at > (now() - interval '7 days')
  ) pfm on true
  left join lateral (
    select count(*) as total_posts,
           max(coalesce(c.published_at, c.published_date)) as newest_post_at,
           count(distinct c.platform) as platforms_with_posts
    from public.content_posts c
    where c.brand_id = b.id and c.status = 'published'
  ) cp on true
  left join lateral (
    select max(d.snapshot_date) as newest_metric_date,
           count(distinct d.platform) filter (where d.snapshot_date > (current_date - 7)) as platforms_with_metrics
    from public.content_post_metrics_daily d
    where d.brand_id = b.id
  ) pm on true
  left join lateral (
    select count(*) as scored_posts,
           count(*) filter (where v.views_multiple is not null) as posts_with_verdict
    from public.post_performance v
    where v.brand_id = b.id
  ) pp on true
)
select p.id as user_id,
       case when br.is_default then p.last_instagram_sync end as last_instagram_sync,
       case when br.is_default then p.last_youtube_sync end as last_youtube_sync,
       case when br.is_default then p.last_facebook_sync end as last_facebook_sync,
       case when br.is_default then p.last_threads_sync end as last_threads_sync,
       case when br.is_default then p.meta_token_expires_at end as meta_token_expires_at,
       case when br.is_default then p.youtube_token_expires_at end as youtube_token_expires_at,
       case when br.is_default then p.threads_token_expires_at end as threads_token_expires_at,
       (br.is_default and coalesce(p.meta_access_token, '') <> '') as has_meta_token,
       (br.is_default and coalesce(p.youtube_refresh_token, '') <> '') as has_youtube_refresh,
       (br.is_default and coalesce(p.threads_access_token, '') <> '') as has_threads_token,
       br.accounts_connected,
       br.newest_snapshot_at,
       br.total_posts,
       br.newest_post_at,
       br.platforms_with_posts,
       br.newest_metric_date,
       br.platforms_with_metrics,
       br.scored_posts,
       br.posts_with_verdict,
       br.brand_id,
       pl.platform,
       ppf.accounts_connected as platform_accounts_connected,
       ppf.newest_snapshot_at as platform_newest_snapshot_at,
       coalesce(pcp.total_posts, 0::bigint) as platform_total_posts,
       pcp.newest_post_at as platform_newest_post_at,
       pmd.newest_metric_date as platform_newest_metric_date,
       coalesce(pmd.posts_with_metrics_7d, 0::bigint) as platform_posts_with_metrics_7d
from brand_rows br
join public.profiles p on p.id = br.owner_id
left join plat pl on pl.brand_id = br.brand_id
left join lateral (
  select count(distinct s.pfm_account_id) as accounts_connected,
         max(s.snapshot_at) as newest_snapshot_at
  from public.pfm_account_snapshots s
  where s.brand_id = br.brand_id and s.platform = pl.platform
    and s.snapshot_at > (now() - interval '7 days')
) ppf on true
left join lateral (
  select count(*) as total_posts,
         max(coalesce(c.published_at, c.published_date)) as newest_post_at
  from public.content_posts c
  where c.brand_id = br.brand_id and c.platform = pl.platform and c.status = 'published'
) pcp on true
left join lateral (
  select max(d.snapshot_date) as newest_metric_date,
         count(distinct d.post_id) filter (where d.snapshot_date > (current_date - 7)) as posts_with_metrics_7d
  from public.content_post_metrics_daily d
  where d.brand_id = br.brand_id and d.platform = pl.platform
) pmd on true;

grant select on public.data_health to authenticated;

comment on view public.data_health is
  'Per-brand, per-platform data-pipeline health: connections, token expiry, sync recency, post counts and benchmark coverage. Brand-level columns repeat on every platform row. Never exposes token values.';

create or replace view public.engagement_daily with (security_invoker = on) as
with snaps as (
  select d.brand_id, d.platform, d.post_id, d.snapshot_date,
         coalesce((d.metrics->>'likes')::numeric, 0) + coalesce((d.metrics->>'comments')::numeric, 0) as engagements,
         coalesce((d.metrics->>'views')::numeric, 0) as views
  from public.content_post_metrics_daily d
), deltas as (
  select brand_id, platform, post_id, snapshot_date,
         engagements - lag(engagements) over w as engagements_delta,
         views - lag(views) over w as views_delta
  from snaps
  window w as (partition by brand_id, platform, post_id order by snapshot_date)
)
select brand_id,
       platform,
       snapshot_date as date,
       sum(greatest(engagements_delta, 0))::bigint as engagements,
       sum(greatest(views_delta, 0))::bigint as views,
       count(*)::bigint as posts
from deltas
where engagements_delta is not null
group by brand_id, platform, snapshot_date;

grant select on public.engagement_daily to authenticated;

comment on view public.engagement_daily is
  'Engagements (likes + comments) and views earned per brand, platform and day, as the sum of each post''s day-over-day delta from content_post_metrics_daily. A post''s first snapshot contributes nothing.';
