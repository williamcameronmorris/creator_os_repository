-- run_nightly_platform_sync authenticated its calls with the vault copy of the
-- service-role key as a bearer. instagram-sync and youtube-sync compare that
-- bearer against SUPABASE_SERVICE_ROLE_KEY, and once the project moved to the
-- new API key system the two stopped matching. Every dispatch 401'd from
-- 2026-07-04 (Instagram) and 2026-05-06 (YouTube) while cron.job_run_details
-- kept reporting "succeeded", because pg_cron only records that the HTTP call
-- was made, not what came back.
--
-- Now sends BOTH: cronSecret in the body (what the sync functions check) and
-- the service-role bearer (what generate-insights still checks, since it
-- predates the hardening). Belt and braces, no regression on either path.
--
-- PREREQUISITE, applied out-of-band because it carries a secret value:
--   select vault.create_secret('<the Cron_Secret env value>', 'cron_secret',
--     'Shared cron secret. Must equal the Cron_Secret edge function env var.');
create or replace function public.run_nightly_platform_sync()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
DECLARE
  rec RECORD;
  service_key TEXT;
  cron_secret TEXT;
  base_url TEXT := 'https://mlionhgievukulyufnnr.supabase.co/functions/v1';
  auth_headers jsonb;
  user_ids TEXT[] := ARRAY[]::TEXT[];
  sync_count INT := 0;
  insight_count INT := 0;
  current_user_id TEXT := '';
  request_id BIGINT;
BEGIN
  -- TRIM both: whitespace pasted through the Vault UI has bitten this before.
  SELECT TRIM(decrypted_secret) INTO service_key
  FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1;

  SELECT TRIM(decrypted_secret) INTO cron_secret
  FROM vault.decrypted_secrets WHERE name = 'cron_secret' LIMIT 1;

  IF cron_secret IS NULL OR cron_secret = '' THEN
    RAISE EXCEPTION 'cron_secret not found or empty in vault.secrets';
  END IF;

  auth_headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || COALESCE(service_key, '')
  );

  FOR rec IN
    SELECT DISTINCT user_id, platform
    FROM platform_credentials
    WHERE is_active = true
    ORDER BY user_id, platform
  LOOP
    IF rec.platform IN ('instagram', 'youtube', 'threads') THEN
      SELECT net.http_post(
        url     := base_url || '/' || rec.platform || '-sync',
        headers := auth_headers,
        body    := jsonb_build_object('cronSecret', cron_secret, 'userId', rec.user_id),
        timeout_milliseconds := 120000
      ) INTO request_id;
      sync_count := sync_count + 1;
    END IF;

    IF rec.user_id::TEXT != current_user_id THEN
      current_user_id := rec.user_id::TEXT;
      user_ids := array_append(user_ids, current_user_id);
    END IF;
  END LOOP;

  IF array_length(user_ids, 1) > 0 THEN
    FOR i IN 1..array_length(user_ids, 1) LOOP
      SELECT net.http_post(
        url     := base_url || '/generate-insights',
        headers := auth_headers,
        body    := jsonb_build_object('cronSecret', cron_secret, 'userId', user_ids[i]),
        timeout_milliseconds := 120000
      ) INTO request_id;
      insight_count := insight_count + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'syncs_dispatched', sync_count,
    'insights_dispatched', insight_count,
    'users', COALESCE(array_length(user_ids, 1), 0),
    'ran_at', NOW()
  );
END;
$$;

-- refresh-tokens accepts a service-role bearer OR Cron_Secret in the body, but
-- job 6 only ever sent the bearer, so it 401'd for the same reason and the Meta
-- long-lived token was never renewed. Rewritten to send the secret in the body,
-- with a real timeout so failures stop being invisible (pg_net defaults to 5s
-- and records a DNS timeout with no body even when the function succeeded).
do $$
declare secret text; jid bigint;
begin
  select TRIM(decrypted_secret) into secret
  from vault.decrypted_secrets where name = 'cron_secret' limit 1;
  select jobid into jid from cron.job where jobname = 'refresh-tokens-daily';
  if jid is null then raise notice 'refresh-tokens-daily not scheduled; skipping'; return; end if;

  perform cron.alter_job(job_id := jid, command := format($f$select net.http_post(
    url := 'https://mlionhgievukulyufnnr.supabase.co/functions/v1/refresh-tokens',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object('cronSecret', %L),
    timeout_milliseconds := 120000
  );$f$, secret));
end $$;
