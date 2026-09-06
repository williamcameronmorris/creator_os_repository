-- Move a Post for Me account's history to another brand, atomically.
--
-- Re-pointing brand_social_accounts alone changes where the syncs file NEW
-- rows; everything the account already produced keeps its brand (and, since
-- this change, postforme-sync no longer rewrites a post's brand on a metrics
-- refresh). This function is the explicit "move history too" path: it moves
-- the mapping and every row tied to the account in one transaction and
-- returns the counts.
--
-- SECURITY DEFINER because several of these tables grant authenticated users
-- no UPDATE policy at all (snapshots, comments, tasks are written by the
-- service role), so an invoker-rights update would silently touch nothing.
-- Both ends are checked against auth.uid() before anything moves: the target
-- brand must be the caller's, and the account must currently be mapped to a
-- brand the caller owns.
create or replace function public.move_account_history(p_pfm_account_id text, p_to_brand uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := (select auth.uid());
  n_posts bigint; n_daily bigint; n_analytics bigint; n_comments bigint;
  n_snapshots bigint; n_metrics bigint; n_tasks bigint; n_profiles bigint;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from public.brands where id = p_to_brand and owner_id = v_uid) then
    raise exception 'That brand is not yours' using errcode = 'insufficient_privilege';
  end if;
  if not exists (
    select 1 from public.brand_social_accounts m
    join public.brands b on b.id = m.brand_id
    where m.pfm_account_id = p_pfm_account_id and b.owner_id = v_uid
  ) then
    raise exception 'Account % is not mapped to one of your brands', p_pfm_account_id
      using errcode = 'no_data_found';
  end if;

  update public.brand_social_accounts set brand_id = p_to_brand
   where pfm_account_id = p_pfm_account_id and brand_id <> p_to_brand;

  update public.content_posts set brand_id = p_to_brand
   where social_account_id = p_pfm_account_id and brand_id <> p_to_brand;
  get diagnostics n_posts = row_count;

  update public.content_post_metrics_daily d set brand_id = p_to_brand
   from public.content_posts c
   where c.id = d.post_id and c.social_account_id = p_pfm_account_id and d.brand_id <> p_to_brand;
  get diagnostics n_daily = row_count;

  update public.post_analytics a set brand_id = p_to_brand
   from public.content_posts c
   where c.id::text = a.post_id::text and c.social_account_id = p_pfm_account_id and a.brand_id <> p_to_brand;
  get diagnostics n_analytics = row_count;

  update public.comments k set brand_id = p_to_brand
   from public.content_posts c
   where c.id::text = k.post_id::text and c.social_account_id = p_pfm_account_id and k.brand_id <> p_to_brand;
  get diagnostics n_comments = row_count;

  update public.pfm_account_snapshots set brand_id = p_to_brand
   where pfm_account_id = p_pfm_account_id and brand_id <> p_to_brand;
  get diagnostics n_snapshots = row_count;

  update public.platform_metrics set brand_id = p_to_brand
   where social_account_id = p_pfm_account_id and brand_id <> p_to_brand;
  get diagnostics n_metrics = row_count;

  update public.playbook_tasks set brand_id = p_to_brand
   where social_account_id = p_pfm_account_id and brand_id <> p_to_brand;
  get diagnostics n_tasks = row_count;

  -- The per-account voice profile. If the target brand already holds one for
  -- this account, that older row gives way to the one being moved.
  delete from public.user_content_profiles t
   using public.user_content_profiles s
   where t.brand_id = p_to_brand and t.social_account_id = p_pfm_account_id
     and s.social_account_id = p_pfm_account_id and s.brand_id <> p_to_brand;
  update public.user_content_profiles set brand_id = p_to_brand
   where social_account_id = p_pfm_account_id and brand_id <> p_to_brand;
  get diagnostics n_profiles = row_count;

  return jsonb_build_object(
    'content_posts', n_posts,
    'content_post_metrics_daily', n_daily,
    'post_analytics', n_analytics,
    'comments', n_comments,
    'pfm_account_snapshots', n_snapshots,
    'platform_metrics', n_metrics,
    'playbook_tasks', n_tasks,
    'user_content_profiles', n_profiles);
end
$$;

revoke all on function public.move_account_history(text, uuid) from public, anon;
grant execute on function public.move_account_history(text, uuid) to authenticated;
