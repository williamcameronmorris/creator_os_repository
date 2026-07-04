-- Cap publish retries so a permanently-failing post (e.g. missing media -> 400)
-- stops re-looping every 30 min forever. Adds an attempt counter and bounds the
-- failed-retry branch of claim_due_posts to < 5 attempts.

alter table public.content_posts
  add column if not exists publish_attempts integer not null default 0;

create or replace function public.claim_due_posts(p_limit integer default 20)
 returns table(id uuid, user_id uuid, platform text, caption text, media_urls text[], content_type text)
 language sql
 security definer
 set search_path to 'public'
as $function$
  update content_posts cp
  set publish_status = 'publishing',
      publish_attempts = cp.publish_attempts + 1
  where cp.id in (
    select c.id from content_posts c
    where c.status = 'scheduled'
      and c.scheduled_for <= now()
      and (c.publish_status is null
           or (c.publish_status = 'failed'
               and c.published_at <= now() - interval '30 minutes'
               and c.publish_attempts < 5))
      and (c.provider is null or c.provider <> 'postforme')
    order by c.scheduled_for
    limit p_limit
    for update skip locked
  )
  returning cp.id, cp.user_id, cp.platform, cp.caption, cp.media_urls, cp.content_type;
$function$;
