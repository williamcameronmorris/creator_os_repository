-- RLS performance pass.
--
-- 38 policies called auth.uid() directly in USING / WITH CHECK. Postgres
-- then evaluates the function once per candidate row. Wrapping it as
-- (select auth.uid()) makes it an init-plan: evaluated once per statement.
-- Fine at 15 users; a real cost past a few thousand rows per user. This is
-- the pattern the rest of the schema already uses.
--
-- The rewrite is generated from pg_policies at apply time so nothing is
-- typed by hand and it stays correct if a policy changes first. The regex
-- leaves already-wrapped policies alone. Behaviour is identical; only the
-- plan changes.
do $$
declare
  r record;
  q text;
  c text;
begin
  for r in
    select tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~* 'auth\.(uid|role|jwt)\(\)'
           or coalesce(with_check, '') ~* 'auth\.(uid|role|jwt)\(\)')
      and not (coalesce(qual, '') ~* '\(\s*select\s+auth\.'
               or coalesce(with_check, '') ~* '\(\s*select\s+auth\.')
  loop
    q := regexp_replace(r.qual, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi');
    c := regexp_replace(r.with_check, 'auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi');
    execute format(
      'alter policy %I on public.%I%s%s',
      r.policyname,
      r.tablename,
      case when q is not null then ' using (' || q || ')' else '' end,
      case when c is not null then ' with check (' || c || ')' else '' end
    );
  end loop;
end $$;

-- suggested_times_cache had a FOR ALL policy and a separate SELECT policy on
-- the same predicate. Two permissive policies per command means both are
-- evaluated for every row; the SELECT one adds nothing.
drop policy if exists select_own_times on public.suggested_times_cache;
