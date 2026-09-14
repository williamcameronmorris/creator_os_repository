-- Brand foreign keys cascade on delete.
--
-- Every brand-scoped table references brands(id) with the default NO ACTION,
-- so deleting a brand (or the auth user that owns it, which cascades into
-- brands) is blocked by the first row that still points at it. Account
-- deletion could never complete. Recreate each of those constraints with
-- ON DELETE CASCADE: a brand's rows have no meaning without the brand.
--
-- Dynamic on purpose, so it covers every referencing table that exists in
-- the database at apply time, not just the ones a hand-typed list remembers.
do $$
declare r record;
begin
  for r in
    select con.conname, rel.relname as tbl, a.attname as col
    from pg_constraint con
    join pg_class rel  on rel.oid  = con.conrelid
    join pg_class frel on frel.oid = con.confrelid
    join pg_attribute a on a.attrelid = rel.oid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and frel.relname = 'brands'
      and rel.relnamespace = 'public'::regnamespace
      and con.confdeltype <> 'c'
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.conname);
    execute format(
      'alter table public.%I add constraint %I foreign key (%I) references public.brands(id) on delete cascade',
      r.tbl, r.conname, r.col);
  end loop;
end $$;
