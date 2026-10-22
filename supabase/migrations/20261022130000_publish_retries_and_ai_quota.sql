-- Native publishing retries end in a visible terminal state, the claim is an
-- allowlist of providers, and AI quota is refundable with tier limits in one
-- place.
--
-- 1. Publish retries. The dispatcher stamped published_at = now() on every
--    failure so claim_due_posts could space retries 30 minutes apart, which
--    gave published_at two meanings. Retries were capped at 5 attempts, but
--    the 5th failure left the row status='scheduled' with a past
--    scheduled_for: shown on the calendar as upcoming, never retried again.
--    Now: last_attempt_at holds the attempt time, and record_publish_failure
--    moves a post to status='failed' (already a terminal state the app
--    renders) on its last allowed attempt.
--
-- 2. Provider allowlist. The claim excluded provider <> 'postforme', so each
--    new provider would be double-published by the native cron until someone
--    remembered to add it here (that bug shipped once already). The claim now
--    takes only 'direct' rows (the column default). Any other provider is
--    excluded unless it is added to the allowlist on purpose.
--
-- 3. AI quota. ai_daily_limit is the only copy of the tier limits.
--    refund_ai_request hands a reservation back when the model call produced
--    nothing (service role only). get_my_ai_quota lets the app read its own
--    quota without mirroring the limits in TypeScript.

BEGIN;

-- ── 1. publish retries ─────────────────────────────────────────────────────
ALTER TABLE public.content_posts
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- Move the attempt timestamps out of published_at on posts that never
-- published.
UPDATE public.content_posts
   SET last_attempt_at = published_at,
       published_at    = NULL
 WHERE publish_status = 'failed'
   AND status <> 'published'
   AND published_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.publish_max_attempts()
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $$ select 5 $$;

-- Posts already stranded by the old behaviour become visible failures.
UPDATE public.content_posts
   SET status = 'failed'
 WHERE status = 'scheduled'
   AND publish_status = 'failed'
   AND publish_attempts >= public.publish_max_attempts();

CREATE OR REPLACE FUNCTION public.claim_due_posts(p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, user_id uuid, platform text, caption text, media_urls text[], content_type text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update content_posts cp
  set publish_status = 'publishing',
      publish_attempts = cp.publish_attempts + 1,
      last_attempt_at = now()
  where cp.id in (
    select c.id from content_posts c
    where c.status = 'scheduled'
      and c.scheduled_for <= now()
      and (c.publish_status is null
           or (c.publish_status = 'failed'
               and c.last_attempt_at <= now() - interval '30 minutes'
               and c.publish_attempts < public.publish_max_attempts()))
      -- Allowlist: only providers this cron publishes. Post for Me (and any
      -- future provider) publishes its own rows.
      and coalesce(c.provider, 'direct') = 'direct'
    order by c.scheduled_for
    limit p_limit
    for update skip locked
  )
  returning cp.id, cp.user_id, cp.platform, cp.caption, cp.media_urls, cp.content_type;
$function$;

-- Returns true when this failure was the last allowed attempt.
CREATE OR REPLACE FUNCTION public.record_publish_failure(p_post_id uuid, p_error text)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  update content_posts
     set publish_status = 'failed',
         publish_error = p_error,
         last_attempt_at = now(),
         status = case when publish_attempts >= public.publish_max_attempts()
                       then 'failed' else status end
   where id = p_post_id
  returning publish_attempts >= public.publish_max_attempts();
$function$;

REVOKE ALL ON FUNCTION public.claim_due_posts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_publish_failure(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_due_posts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_publish_failure(uuid, text) TO service_role;

-- ── 3. AI quota ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ai_daily_limit(p_tier text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $$
  select case lower(coalesce(p_tier, 'free'))
    when 'admin' then 100000
    when 'paid'  then 200
    else 15
  end
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_request(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_daily_limit integer;
  v_ok boolean;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  perform public.check_and_reset_ai_quota(p_user_id);

  select public.ai_daily_limit(p.subscription_tier) into v_daily_limit
  from public.profiles p where p.id = p_user_id;
  v_daily_limit := coalesce(v_daily_limit, public.ai_daily_limit(null));

  update public.ai_request_usage
     set daily_requests_used     = daily_requests_used + 1,
         last_request_at         = now(),
         total_requests_lifetime = total_requests_lifetime + 1,
         updated_at              = now()
   where user_id = p_user_id
     and daily_requests_used < v_daily_limit
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.check_and_reset_ai_quota(p_user_id uuid)
 RETURNS TABLE(requests_used integer, requests_remaining integer, reset_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_usage_record record;
  v_daily_limit integer;
begin
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  select public.ai_daily_limit(p.subscription_tier) into v_daily_limit
  from public.profiles p where p.id = p_user_id;
  v_daily_limit := coalesce(v_daily_limit, public.ai_daily_limit(null));

  select * into v_usage_record from public.ai_request_usage where user_id = p_user_id;
  if not found then
    insert into public.ai_request_usage (user_id, daily_requests_used, last_reset_at)
    values (p_user_id, 0, now())
    returning * into v_usage_record;
  end if;

  if now() - v_usage_record.last_reset_at >= interval '24 hours' then
    update public.ai_request_usage
    set daily_requests_used = 0, last_reset_at = now(), updated_at = now()
    where user_id = p_user_id
    returning * into v_usage_record;
  end if;

  return query
    select
      v_usage_record.daily_requests_used::integer,
      greatest(v_daily_limit - v_usage_record.daily_requests_used, 0)::integer,
      (v_usage_record.last_reset_at + interval '24 hours')::timestamptz;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refund_ai_request(p_user_id uuid)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  update public.ai_request_usage
     set daily_requests_used     = greatest(daily_requests_used - 1, 0),
         total_requests_lifetime = greatest(total_requests_lifetime - 1, 0),
         updated_at              = now()
   where user_id = p_user_id;
$function$;

-- Read-only: never creates or resets the row. A window that has run out
-- reads as already reset, which is what the next reservation will do.
CREATE OR REPLACE FUNCTION public.get_my_ai_quota()
 RETURNS TABLE(requests_used integer, daily_limit integer, reset_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select
    case when u.last_reset_at is null or now() - u.last_reset_at >= interval '24 hours'
         then 0 else u.daily_requests_used end,
    public.ai_daily_limit(p.subscription_tier),
    case when u.last_reset_at is null or now() - u.last_reset_at >= interval '24 hours'
         then now() + interval '24 hours' else u.last_reset_at + interval '24 hours' end
  from public.profiles p
  left join public.ai_request_usage u on u.user_id = p.id
  where p.id = auth.uid();
$function$;

REVOKE ALL ON FUNCTION public.increment_ai_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_and_reset_ai_quota(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_ai_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_ai_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_ai_request(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_and_reset_ai_quota(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_ai_request(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_ai_quota() TO authenticated;

COMMIT;
