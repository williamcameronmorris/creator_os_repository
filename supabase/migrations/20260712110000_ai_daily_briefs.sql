-- Daily Brief: one generated morning summary per user per day.
--
-- Written by the generate-daily-brief edge function (service role) each
-- morning (cron) or on demand ("Generate now" in Clio). Read by the Clio
-- home page: today's row lights up the Daily Brief panel.
--
-- content is the full brief as jsonb:
--   { headline, performance: { summary, highlight_post },
--     niche_trend: { summary, example_title },
--     ideas: [ { topic, hook, reasoning, platform, content_type } x3 ],
--     best_time: { hour_local, note } }

create table if not exists public.ai_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  brief_date date not null,
  content jsonb not null,
  model text,
  created_at timestamptz default now(),
  unique (user_id, brief_date)
);

create index if not exists idx_ai_daily_briefs_user_date
  on public.ai_daily_briefs (user_id, brief_date desc);

alter table public.ai_daily_briefs enable row level security;

-- Owner read only. All writes happen through the edge function with the
-- service role key (bypasses RLS), so no insert/update/delete policies.
create policy "own briefs read" on public.ai_daily_briefs
  for select to authenticated using (auth.uid() = user_id);

-- ─── Scheduling (MANUAL STEP — read this) ──────────────────────────────────
--
-- The morning run is an EDGE FUNCTION invocation, not a SQL function, so it
-- needs the Cron_Secret in the request body — and secrets can't live in a
-- committed migration. The repo's existing edge-fn cron (postforme-sync)
-- is scheduled the same way: via the Supabase Dashboard, not a migration.
-- (The only cron.schedule precedent in migrations, prune-stale-watch-
-- discovery, schedules a plain SQL function that needs no secret.)
--
-- ONE-TIME MANUAL STEP after deploying generate-daily-brief:
--   Supabase Dashboard → Edge Functions → generate-daily-brief → Schedule
--     Cron:  0 11 * * *        (daily, 11:00 UTC)
--     Body:  {"cronSecret":"<value of the Cron_Secret project secret>"}
--
-- Equivalent pg_cron + pg_net job, if you prefer SQL (fill in the project
-- ref and the real secret before running in the SQL editor — do NOT commit):
--
-- select cron.schedule(
--   'generate-daily-brief',
--   '0 11 * * *',
--   $$
--   select net.http_post(
--     url     := 'https://<project-ref>.supabase.co/functions/v1/generate-daily-brief',
--     headers := '{"Content-Type": "application/json"}'::jsonb,
--     body    := '{"cronSecret": "<Cron_Secret value>"}'::jsonb
--   );
--   $$
-- );
