-- Brands, phase 5: the three read views carry brand_id.
--
-- content_posts_unified and post_performance gain a trailing brand_id column
-- (CREATE OR REPLACE VIEW can only append). post_performance's baseline is
-- now computed within the brand: two brands must never share a median.
-- data_health becomes one row per BRAND, keyed by brand_id, so the panel
-- reports the active brand's pipeline. The direct-grant token fields on the
-- profile belong to the default brand only; a second brand shows them empty
-- rather than inheriting a YouTube expiry that is not its own.

create or replace view public.content_posts_unified with (security_invoker = true) as
with base as (
  select cp.id, cp.user_id, cp.platform, cp.caption, cp.media_url, cp.media_type,
         cp.scheduled_date, cp.published_date, cp.status, cp.instagram_post_id,
         cp.views, cp.likes, cp.comments, cp.shares, cp.engagement_rate,
         cp.created_at, cp.updated_at, cp.saves, cp.reach, cp.impressions,
         cp.tiktok_post_id, cp.youtube_video_id, cp.deal_id, cp.is_sponsored,
         cp.title, cp.scheduled_for, cp.published_at, cp.content_type,
         cp.thumbnail_url, cp.media_urls, cp.publish_status, cp.publish_error,
         cp.platform_post_id, cp.ab_test_group, cp.ab_pair_id, cp.archived_at,
         cp.brand_id,
         coalesce(nullif(cp.platform_post_id, ''), nullif(cp.instagram_post_id, '')) as unified_post_id,
         coalesce(cp.published_at, cp.published_date) as unified_published_at,
         coalesce(nullif(cp.scheduled_for, null::timestamptz), cp.scheduled_date) as unified_scheduled_at
  from public.content_posts cp
  where cp.archived_at is null
), ranked as (
  select base.*,
         row_number() over (
           partition by base.user_id, base.platform, coalesce(base.unified_post_id, base.id::text)
           order by (case when base.media_url like '%supabase.co/storage%' then 0 else 1 end),
                    base.updated_at desc nulls last, base.created_at desc nulls last
         ) as dedup_rank
  from base
)
select id, user_id, platform, title, caption, media_url, thumbnail_url, media_type, media_urls,
       unified_post_id as post_id, instagram_post_id, platform_post_id, tiktok_post_id, youtube_video_id,
       unified_published_at as published_at, published_date, scheduled_date, scheduled_for,
       unified_scheduled_at as scheduled_at, status, publish_status, publish_error,
       views, likes, comments, shares, saves, reach, impressions, engagement_rate,
       deal_id, is_sponsored, content_type, ab_test_group, ab_pair_id, created_at, updated_at,
       brand_id
from ranked
where dedup_rank = 1;

create or replace view public.post_performance with (security_invoker = on) as
with fresh as (
  select distinct post_id
  from public.content_post_metrics_daily
  where snapshot_date >= (current_date - interval '7 days')
), scored as (
  select cp.id, cp.user_id, cp.brand_id, cp.platform, cp.media_type, cp.content_type,
         cp.lane_id, cp.lane_confidence, cp.archetype_id, cp.published_at,
         cp.thumbnail_url, cp.title, cp.caption, cp.platform_post_id,
         cp.social_account_id, cp.account_username,
         coalesce(cp.views, 0) as views,
         coalesce(cp.likes, 0) as likes,
         coalesce(cp.comments, 0) as comments,
         coalesce(cp.saves, 0) as saves,
         coalesce(cp.shares, 0) as shares,
         coalesce(cp.reach, 0) as reach,
         coalesce(cp.engagement_rate, 0::numeric) as engagement_rate,
         coalesce(cp.media_type, 'unknown') as baseline_group
  from public.content_posts cp
  join fresh f on f.post_id = cp.id
  where cp.status = 'published' and cp.published_at is not null and coalesce(cp.views, 0) > 0
)
select s.id, s.user_id, s.platform, s.media_type, s.content_type, s.lane_id,
       l.slug as lane_slug, l.name as lane_name, l.winning_looks_like,
       s.lane_confidence, s.archetype_id, s.baseline_group, s.published_at,
       s.thumbnail_url, s.title, s.caption, s.platform_post_id,
       s.social_account_id, s.account_username,
       s.views, s.likes, s.comments, s.saves, s.shares, s.reach, s.engagement_rate,
       b.baseline_n, b.med_views, b.med_saves, b.med_reach, b.med_er,
       case when b.baseline_n >= 8 and b.med_views > 0 then round((s.views::double precision / b.med_views)::numeric, 2) end as views_multiple,
       case when b.baseline_n >= 8 and b.med_saves > 0 then round((s.saves::double precision / b.med_saves)::numeric, 2) end as saves_multiple,
       case when b.baseline_n >= 8 and b.med_reach > 0 then round((s.reach::double precision / b.med_reach)::numeric, 2) end as reach_multiple,
       case when b.baseline_n >= 8 and b.med_er > 0 then round((s.engagement_rate::double precision / b.med_er)::numeric, 2) end as er_multiple,
       case when b.baseline_n >= 8 then (
         select m.name
         from (values
           ('views',           case when b.med_views > 0 then s.views::double precision / b.med_views end),
           ('saves',           case when b.med_saves > 0 then s.saves::double precision / b.med_saves end),
           ('reach',           case when b.med_reach > 0 then s.reach::double precision / b.med_reach end),
           ('engagement rate', case when b.med_er > 0 then s.engagement_rate::double precision / b.med_er end)
         ) m(name, mult)
         where m.mult is not null
         order by m.mult desc
         limit 1)
       end as outlier_metric,
       s.brand_id
from scored s
left join public.content_lanes l on l.id = s.lane_id
cross join lateral (
  select count(*) as baseline_n,
         percentile_cont(0.5) within group (order by p.views::double precision) as med_views,
         percentile_cont(0.5) within group (order by p.saves::double precision) as med_saves,
         percentile_cont(0.5) within group (order by p.reach::double precision) as med_reach,
         percentile_cont(0.5) within group (order by p.engagement_rate::double precision) as med_er
  from (
    select p2.views, p2.saves, p2.reach, p2.engagement_rate
    from scored p2
    where p2.brand_id = s.brand_id
      and p2.platform = s.platform
      and p2.baseline_group = s.baseline_group
      and p2.published_at < s.published_at
    order by p2.published_at desc
    limit 20
  ) p
) b;

create or replace view public.data_health with (security_invoker = on) as
select p.id as user_id,
       case when b.is_default then p.last_instagram_sync end as last_instagram_sync,
       case when b.is_default then p.last_youtube_sync end as last_youtube_sync,
       case when b.is_default then p.last_facebook_sync end as last_facebook_sync,
       case when b.is_default then p.last_threads_sync end as last_threads_sync,
       case when b.is_default then p.meta_token_expires_at end as meta_token_expires_at,
       case when b.is_default then p.youtube_token_expires_at end as youtube_token_expires_at,
       case when b.is_default then p.threads_token_expires_at end as threads_token_expires_at,
       (b.is_default and coalesce(p.meta_access_token, '') <> '') as has_meta_token,
       (b.is_default and coalesce(p.youtube_refresh_token, '') <> '') as has_youtube_refresh,
       (b.is_default and coalesce(p.threads_access_token, '') <> '') as has_threads_token,
       pfm.accounts_connected,
       pfm.newest_snapshot_at,
       coalesce(cp.total_posts, 0::bigint) as total_posts,
       cp.newest_post_at,
       coalesce(cp.platforms_with_posts, 0::bigint) as platforms_with_posts,
       pm.newest_metric_date,
       coalesce(pm.platforms_with_metrics, 0::bigint) as platforms_with_metrics,
       coalesce(pp.scored_posts, 0::bigint) as scored_posts,
       coalesce(pp.posts_with_verdict, 0::bigint) as posts_with_verdict,
       b.id as brand_id
from public.brands b
join public.profiles p on p.id = b.owner_id
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
  select max(m.date) as newest_metric_date,
         count(distinct m.platform) as platforms_with_metrics
  from public.platform_metrics m
  where m.brand_id = b.id and m.date > (current_date - 7)
) pm on true
left join lateral (
  select count(*) as scored_posts,
         count(*) filter (where v.views_multiple is not null) as posts_with_verdict
  from public.post_performance v
  where v.brand_id = b.id
) pp on true;
