-- Watch discovery upserts suggested_creators/suggested_creator_videos and never
-- removed rows, so niches that stop being refreshed accumulate forever. Prune
-- creators not refreshed in 30 days, their videos, and any orphaned videos.
-- refreshed_at is stamped on every discovery upsert, so it reliably marks stale.
create or replace function public.prune_stale_watch_discovery()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  delete from suggested_creator_videos v
   where v.suggested_creator_id in (
     select id from suggested_creators where refreshed_at < now() - interval '30 days'
   );
  delete from suggested_creators where refreshed_at < now() - interval '30 days';
  -- Sweep orphaned videos whose parent creator is already gone.
  delete from suggested_creator_videos v
   where not exists (select 1 from suggested_creators c where c.id = v.suggested_creator_id);
end;
$$;

-- Schedule a daily prune at 03:45 UTC (idempotent — unschedule any prior copy).
do $$
begin
  perform cron.unschedule('prune-stale-watch-discovery');
exception when others then
  null; -- no existing job to remove
end $$;

select cron.schedule('prune-stale-watch-discovery', '45 3 * * *', $$select public.prune_stale_watch_discovery();$$);
