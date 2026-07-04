-- Make the AI-quota increment atomic. The previous body SELECTed the current
-- usage, checked it against the limit, then UPDATEd +1 as separate statements,
-- so two concurrent requests could both read 14, both pass the < 15 check, and
-- both increment -> 16 (over limit). Fold the check into the UPDATE's WHERE so
-- it runs under the row lock and concurrent calls serialize correctly.
create or replace function public.increment_ai_request(p_user_id uuid)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_daily_limit integer := 15;
  v_ok boolean;
begin
  perform check_and_reset_ai_quota(p_user_id);

  update ai_request_usage
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
