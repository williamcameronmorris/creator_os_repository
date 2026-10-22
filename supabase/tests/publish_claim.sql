-- Self-checking test for claim_due_posts and record_publish_failure.
-- Runs in a transaction and rolls back; any failed check raises.
--
--   supabase db query --linked -f supabase/tests/publish_claim.sql
--
-- Synthetic posts are scheduled in the year 2000, so they sort ahead of real
-- due posts and claim_due_posts(10) picks them up first.

begin;

do $$
declare
  v_user uuid;
  v_brand uuid;
  v_direct uuid;
  v_pfm uuid;
  v_other uuid;
  v_claimed uuid[];
  v_terminal boolean;
  v_status text;
  i int;
begin
  select owner_id, id into v_user, v_brand from brands where is_default limit 1;
  if v_user is null then raise exception 'no brand to test with'; end if;

  insert into content_posts (user_id, brand_id, platform, status, scheduled_for, provider, caption)
  values (v_user, v_brand, 'instagram', 'scheduled', '2000-01-01', 'direct', 'test direct')
  returning id into v_direct;
  insert into content_posts (user_id, brand_id, platform, status, scheduled_for, provider, caption)
  values (v_user, v_brand, 'instagram', 'scheduled', '2000-01-01', 'postforme', 'test pfm')
  returning id into v_pfm;
  insert into content_posts (user_id, brand_id, platform, status, scheduled_for, provider, caption)
  values (v_user, v_brand, 'instagram', 'scheduled', '2000-01-01', 'some_future_provider', 'test other')
  returning id into v_other;

  -- Allowlist: only the direct post is claimable.
  select array_agg(id) into v_claimed from claim_due_posts(10);
  if not (v_direct = any(v_claimed)) then raise exception 'direct post was not claimed'; end if;
  if v_pfm = any(v_claimed) then raise exception 'postforme post was claimed'; end if;
  if v_other = any(v_claimed) then raise exception 'unknown-provider post was claimed'; end if;

  -- A claimed post is not claimable again while publishing.
  select array_agg(id) into v_claimed from claim_due_posts(10);
  if v_direct = any(coalesce(v_claimed, '{}')) then raise exception 'publishing post was re-claimed'; end if;

  -- Failure 1: retryable, but not inside the 30 minute window.
  v_terminal := record_publish_failure(v_direct, 'boom');
  if v_terminal then raise exception 'first failure was terminal'; end if;
  select array_agg(id) into v_claimed from claim_due_posts(10);
  if v_direct = any(coalesce(v_claimed, '{}')) then raise exception 'retried inside the window'; end if;

  -- Past the window it is retried.
  update content_posts set last_attempt_at = now() - interval '31 minutes' where id = v_direct;
  select array_agg(id) into v_claimed from claim_due_posts(10);
  if not (v_direct = any(coalesce(v_claimed, '{}'))) then raise exception 'not retried after the window'; end if;

  -- Attempts 2..4 fail and stay retryable; attempt 5 is terminal.
  for i in 2..publish_max_attempts() loop
    v_terminal := record_publish_failure(v_direct, 'boom');
    exit when v_terminal;
    update content_posts set last_attempt_at = now() - interval '31 minutes' where id = v_direct;
    perform claim_due_posts(10);
  end loop;
  select status into v_status from content_posts where id = v_direct;
  if not v_terminal or v_status <> 'failed' then
    raise exception 'last attempt did not end in status failed (terminal=%, status=%)', v_terminal, v_status;
  end if;
  if exists (select 1 from content_posts where id = v_direct and published_at is not null) then
    raise exception 'a failed post has published_at set';
  end if;

  raise notice 'publish_claim: all checks passed';
end $$;

select 'publish_claim: all checks passed' as result;
rollback;
