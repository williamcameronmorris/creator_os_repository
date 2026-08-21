-- Per-post verdict against the creator's OWN trailing median.
--
-- Trustworthiness is derived, not stamped: a post counts only if
-- content_post_metrics_daily refreshed it in the last 7 days. That excludes the
-- 177 legacy YouTube rows whose `views` came from the YouTube Analytics API as
-- a 90-day window (median 278) rather than lifetime views (median 1457).
-- Mixing the two definitions poisons every median.
--
-- Baselines are (platform, media_type), NOT (platform, lane). At ~300 scoreable
-- posts across 5 platforms, lane as a third dimension leaves ~7 posts per cell,
-- below the n>=8 floor, so almost every verdict would be suppressed.
-- media_type is also the fairer comparison: a reel should be judged against
-- reels, not against stills. The lane drives the leaderboard instead, which
-- aggregates across a whole platform and has the sample size for it.
--
--   * MEDIAN, not mean. Facebook's median is 966 against a max of 2,363,435.
--   * Trailing 20 posts in the group, PRIOR to this one. Rolling count rather
--     than a date window, because posting cadence is irregular. Comparing only
--     against what came before keeps the verdict honest.
--   * baseline_n is exposed so the UI can suppress a verdict below 8 rather
--     than print a confident-looking multiple off three posts.
drop view if exists public.post_performance;

create view public.post_performance as
with fresh as (
  select distinct post_id
  from public.content_post_metrics_daily
  where snapshot_date >= current_date - interval '7 days'
),
scored as (
  select
    cp.id, cp.user_id, cp.platform, cp.media_type, cp.content_type,
    cp.lane_id, cp.lane_confidence, cp.archetype_id,
    cp.published_at, cp.thumbnail_url, cp.title, cp.caption,
    cp.platform_post_id, cp.social_account_id, cp.account_username,
    coalesce(cp.views, 0)           as views,
    coalesce(cp.likes, 0)           as likes,
    coalesce(cp.comments, 0)        as comments,
    coalesce(cp.saves, 0)           as saves,
    coalesce(cp.shares, 0)          as shares,
    coalesce(cp.reach, 0)           as reach,
    coalesce(cp.engagement_rate, 0) as engagement_rate,
    coalesce(cp.media_type, 'unknown') as baseline_group
  from public.content_posts cp
  join fresh f on f.post_id = cp.id
  where cp.status = 'published'
    and cp.published_at is not null
    and coalesce(cp.views, 0) > 0
)
select
  s.id, s.user_id, s.platform, s.media_type, s.content_type,
  s.lane_id, l.slug as lane_slug, l.name as lane_name,
  l.winning_looks_like, s.lane_confidence, s.archetype_id,
  s.baseline_group, s.published_at,
  s.thumbnail_url, s.title, s.caption,
  s.platform_post_id, s.social_account_id, s.account_username,
  s.views, s.likes, s.comments, s.saves, s.shares, s.reach, s.engagement_rate,

  b.baseline_n, b.med_views, b.med_saves, b.med_reach, b.med_er,

  -- Null (not 1, not 0) when there is no basis to compare, so the UI can tell
  -- "average" apart from "we do not know yet".
  case when b.baseline_n >= 8 and b.med_views > 0
       then round((s.views / b.med_views)::numeric, 2) end as views_multiple,
  case when b.baseline_n >= 8 and b.med_saves > 0
       then round((s.saves / b.med_saves)::numeric, 2) end as saves_multiple,
  case when b.baseline_n >= 8 and b.med_reach > 0
       then round((s.reach / b.med_reach)::numeric, 2) end as reach_multiple,
  case when b.baseline_n >= 8 and b.med_er > 0
       then round((s.engagement_rate / b.med_er)::numeric, 2) end as er_multiple,

  -- Which metric over-performed hardest. "Saves 4.1x while views 1.2x" is a
  -- different post from the reverse, and that difference is the actual insight.
  case when b.baseline_n >= 8 then (
    select m.name
    from (values
      ('views', case when b.med_views > 0 then s.views / b.med_views end),
      ('saves', case when b.med_saves > 0 then s.saves / b.med_saves end),
      ('reach', case when b.med_reach > 0 then s.reach / b.med_reach end),
      ('engagement rate', case when b.med_er > 0 then s.engagement_rate / b.med_er end)
    ) as m(name, mult)
    where m.mult is not null
    order by m.mult desc
    limit 1
  ) end as outlier_metric

from scored s
left join public.content_lanes l on l.id = s.lane_id
cross join lateral (
  select
    count(*)                                                       as baseline_n,
    percentile_cont(0.5) within group (order by p.views)           as med_views,
    percentile_cont(0.5) within group (order by p.saves)           as med_saves,
    percentile_cont(0.5) within group (order by p.reach)           as med_reach,
    percentile_cont(0.5) within group (order by p.engagement_rate) as med_er
  from (
    select p2.views, p2.saves, p2.reach, p2.engagement_rate
    from scored p2
    where p2.user_id = s.user_id
      and p2.platform = s.platform
      and p2.baseline_group = s.baseline_group
      and p2.published_at < s.published_at
    order by p2.published_at desc
    limit 20
  ) p
) b;

-- Without this the view runs as its owner and bypasses RLS on content_posts.
alter view public.post_performance set (security_invoker = on);

comment on view public.post_performance is
  'Per-post verdict against the creator''s own trailing median for the same platform+media_type. Only includes posts refreshed by postforme-sync in the last 7 days. Multiples are null when baseline_n < 8. lane_* columns support the lane leaderboard.';
