-- Hardening pass before the beta.
--
-- 1. The three brand trigger functions were executable by anon and
--    authenticated through /rest/v1/rpc. Trigger functions fire regardless
--    of EXECUTE (create_playbook_tasks has run with EXECUTE revoked since
--    July), so revoking closes the API surface and changes nothing else.
-- 2. Two zero-argument quota overloads referenced columns that no longer
--    exist (request_count, quota_reset_at). Dead, but exposed. Dropped.
-- 3. increment_ai_request(uuid) capped everyone at 15 while
--    check_and_reset_ai_quota(uuid) honoured the tier (admin 100000, paid
--    200, free 15). Callers ignored its boolean, so the mismatch was silent.
--    The edge functions now RESERVE before generating (call increment first,
--    stop on false), which closes the check-then-generate race; for that the
--    reserve must honour the same limit as the check.

-- ── 1. Trigger functions off the API ──────────────────────────────────────
revoke execute on function public.brand_id_default() from public, anon, authenticated;
revoke execute on function public.brand_id_from_progress() from public, anon, authenticated;
revoke execute on function public.create_default_brand() from public, anon, authenticated;

-- ── 2. Dead overloads ─────────────────────────────────────────────────────
drop function if exists public.check_and_reset_ai_quota();
drop function if exists public.increment_ai_request();

-- ── 3. Reserve honours the tier ───────────────────────────────────────────
create or replace function public.increment_ai_request(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tier text;
  v_daily_limit integer;
  v_ok boolean;
begin
  -- Signed-in callers may only spend their own quota. Service-role callers
  -- (auth.uid() is null) are the edge functions and are trusted.
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'forbidden: p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  -- Creates the row / resets the 24h window; same function the UI reads.
  perform public.check_and_reset_ai_quota(p_user_id);

  select coalesce(p.subscription_tier, 'free') into v_tier
  from public.profiles p where p.id = p_user_id;
  v_daily_limit := case lower(coalesce(v_tier, 'free'))
    when 'admin' then 100000
    when 'paid'  then 200
    else 15
  end;

  -- Atomic reserve: the WHERE is the gate, so two concurrent calls cannot
  -- both pass when one request remains.
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
$$;

revoke execute on function public.check_and_reset_ai_quota(uuid) from public, anon;
revoke execute on function public.increment_ai_request(uuid) from public, anon;
grant execute on function public.check_and_reset_ai_quota(uuid) to authenticated, service_role;
grant execute on function public.increment_ai_request(uuid) to authenticated, service_role;
