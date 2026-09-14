-- Owner-only read policies on the two sync log tables.
--
-- _cowork_sync_run and _nightly_sync_runs are written by cron with the
-- service role and had RLS enabled with no policy at all, which the security
-- advisor flags. Let a signed-in user read their own rows so support can
-- point someone at their own sync history. Writes stay service-role only.
drop policy if exists "owner reads own sync runs" on public._cowork_sync_run;
create policy "owner reads own sync runs" on public._cowork_sync_run
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "owner reads own nightly runs" on public._nightly_sync_runs;
create policy "owner reads own nightly runs" on public._nightly_sync_runs
  for select to authenticated
  using (user_id = (select auth.uid()));
