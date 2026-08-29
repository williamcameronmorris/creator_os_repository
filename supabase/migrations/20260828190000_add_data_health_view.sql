-- data_health
--
-- One row per user answering "is data actually flowing, and if not, where did
-- it stop". Every field was something that had to be worked out by hand during
-- an incident on 2026-08-22, when Instagram had been silently dead for seven
-- weeks and Analytics told the creator to connect accounts that were already
-- connected.
--
-- Deliberately parameter-free. It reports newest_post_at and total_posts rather
-- than "posts in the last N days", because the window belongs to whatever the
-- caller has selected in the UI and a view cannot know it. The client compares.
--
-- Exposes token EXPIRY and PRESENCE, never token values. profiles holds
-- plaintext credentials, so the column list here is a whitelist and must stay one.
create or replace view public.data_health as
select
  p.id as user_id,
  p.last_instagram_sync,
  p.last_youtube_sync,
  p.last_facebook_sync,
  p.last_threads_sync,
  p.meta_token_expires_at,
  p.youtube_token_expires_at,
  p.threads_token_expires_at,
  (coalesce(p.meta_access_token, '') <> '')      as has_meta_token,
  (coalesce(p.youtube_refresh_token, '') <> '')  as has_youtube_refresh,
  (coalesce(p.threads_access_token, '') <> '')   as has_threads_token,
  pfm.accounts_connected,
  pfm.newest_snapshot_at,
  coalesce(cp.total_posts, 0)          as total_posts,
  cp.newest_post_at,
  coalesce(cp.platforms_with_posts, 0) as platforms_with_posts,
  pm.newest_metric_date,
  coalesce(pm.platforms_with_metrics, 0) as platforms_with_metrics,
  coalesce(pp.scored_posts, 0)         as scored_posts,
  coalesce(pp.posts_with_verdict, 0)   as posts_with_verdict
from public.profiles p
left join lateral (
  -- postforme-sync writes a snapshot per connected account every 6 hours, so
  -- this is the freshest signal that publishing-side connections are alive.
  select count(distinct pfm_account_id) as accounts_connected,
         max(snapshot_at)               as newest_snapshot_at
  from public.pfm_account_snapshots s
  where s.user_id = p.id and s.snapshot_at > now() - interval '7 days'
) pfm on true
left join lateral (
  select count(*)                                        as total_posts,
         max(coalesce(c.published_at, c.published_date)) as newest_post_at,
         count(distinct c.platform)                      as platforms_with_posts
  from public.content_posts c
  where c.user_id = p.id and c.status = 'published'
) cp on true
left join lateral (
  select max(m.date)                as newest_metric_date,
         count(distinct m.platform) as platforms_with_metrics
  from public.platform_metrics m
  where m.user_id = p.id and m.date > current_date - 7
) pm on true
left join lateral (
  select count(*)                                             as scored_posts,
         count(*) filter (where v.views_multiple is not null) as posts_with_verdict
  from public.post_performance v
  where v.user_id = p.id
) pp on true;

-- Without this the view runs as its owner and every user sees every other
-- user's sync state.
alter view public.data_health set (security_invoker = on);

grant select on public.data_health to authenticated;

comment on view public.data_health is
  'Per-user data-pipeline health: connections, token expiry, sync recency, post counts and benchmark coverage. Powers the "why is this empty" explanations. Never exposes token values.';
