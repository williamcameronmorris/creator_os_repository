-- Atomic claim for the scheduled-post publisher. Replaces a non-atomic
-- SELECT-then-UPDATE (two concurrent cron runs could claim the same post and
-- double-publish) and excludes provider='postforme' rows (those are published
-- by Post for Me — the native cron claiming them caused a second publish).
-- FOR UPDATE SKIP LOCKED makes concurrent runs claim disjoint sets.
create or replace function public.claim_due_posts(p_limit int default 20)
returns table (
  id uuid,
  user_id uuid,
  platform text,
  caption text,
  media_urls text[],
  content_type text
)
language sql
security definer
set search_path = public
as $$
  update content_posts cp
  set publish_status = 'publishing'
  where cp.id in (
    select c.id from content_posts c
    where c.status = 'scheduled'
      and c.scheduled_for <= now()
      and (c.publish_status is null
           or (c.publish_status = 'failed' and c.published_at <= now() - interval '30 minutes'))
      and (c.provider is null or c.provider <> 'postforme')
    order by c.scheduled_for
    limit p_limit
    for update skip locked
  )
  returning cp.id, cp.user_id, cp.platform, cp.caption, cp.media_urls, cp.content_type;
$$;

revoke all on function public.claim_due_posts(int) from public, anon, authenticated;
grant execute on function public.claim_due_posts(int) to service_role;
