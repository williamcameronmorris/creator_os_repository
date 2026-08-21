-- Views default to running as their OWNER, which would silently bypass RLS on
-- content_posts and let any authenticated user read every creator's posts.
-- security_invoker makes the caller's policies apply. Superseded by the
-- recreate in 20260821195143, which re-applies this setting.
do $$
begin
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relname = 'post_performance') then
    execute 'alter view public.post_performance set (security_invoker = on)';
  end if;
end $$;
