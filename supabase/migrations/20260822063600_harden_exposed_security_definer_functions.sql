-- 1. prune_stale_watch_discovery() was executable by `anon`.
--
-- It is SECURITY DEFINER and it DELETEs rows, and PostgREST exposes every
-- public function at /rest/v1/rpc/, so any unauthenticated visitor could fire
-- it. Nothing in the app calls it; only the pg_cron job does, and that runs as
-- postgres, which is unaffected by these grants.
revoke execute on function public.prune_stale_watch_discovery() from anon, authenticated, public;

-- 2. The AI quota functions were exposed backwards.
--
-- Each has two overloads. The no-arg pair derives the caller from auth.uid()
-- and is safe, but had EXECUTE revoked. The (uuid) pair takes whatever user id
-- it is handed and had EXECUTE granted to `authenticated`, so any signed-in
-- user who knew another user's UUID could burn or reset that user's AI quota.
--
-- Revoking is not an option: src/lib/aiQuota.ts calls the (uuid) overloads
-- from the browser with the user's own session, and eight edge functions call
-- them server-side. Guarding inside the function fixes the hole without
-- touching any caller.
--
-- auth.uid() is NULL when the caller is the service role, which is how every
-- edge function reaches these, so that path stays open. It is non-null for the
-- `authenticated` role, so a signed-in user is pinned to their own id.
--
-- Verified after apply: service role passes, own-id passes, cross-user raises
-- 42501.
create or replace function public.check_and_reset_ai_quota(p_user_id uuid)
 returns table(requests_used integer, requests_remaining integer, reset_at timestamp with time zone)
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_usage_record record;
  v_tier text;
  v_daily_limit integer;
  v_hours_since_reset numeric;
begin
  -- Signed-in callers may only ask about themselves. Service-role callers
  -- (auth.uid() is null) are trusted and may pass any id.
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  select coalesce(p.subscription_tier, 'free') into v_tier
  from public.profiles p
  where p.id = p_user_id;

  v_daily_limit := case lower(coalesce(v_tier, 'free'))
    when 'admin' then 100000
    when 'paid' then 200
    else 15
  end;

  select * into v_usage_record from public.ai_request_usage where user_id = p_user_id;
  if not found then
    insert into public.ai_request_usage (user_id, daily_requests_used, last_reset_at)
    values (p_user_id, 0, now())
    returning * into v_usage_record;
  end if;

  v_hours_since_reset := extract(epoch from (now() - v_usage_record.last_reset_at)) / 3600;
  if v_hours_since_reset >= 24 then
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

create or replace function public.increment_ai_request(p_user_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_daily_limit integer := 15;
  v_ok boolean;
BEGIN
  -- Same guard as check_and_reset_ai_quota(uuid); see there for why.
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  PERFORM check_and_reset_ai_quota(p_user_id);

  UPDATE ai_request_usage
     SET daily_requests_used     = daily_requests_used + 1,
         last_request_at         = now(),
         total_requests_lifetime = total_requests_lifetime + 1,
         updated_at              = now()
   WHERE user_id = p_user_id
     AND daily_requests_used < v_daily_limit
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$function$;
