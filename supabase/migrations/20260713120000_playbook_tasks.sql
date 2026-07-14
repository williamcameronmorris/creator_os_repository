-- Playbooks: the post-publish protocol, automated.
--
-- When a post transitions to published, a trigger on content_posts inserts
-- the platform's timed action checklist into `playbook_tasks`:
--
--   instagram / tiktok:
--     story_cta      due NOW   — post a story pointing to the main post
--     story_results  due +23h  — post the poll results right before expiry
--     engage_window  due NOW   — reply to every comment for the next hour
--   youtube:
--     first_check    due +24h  — 24h check-in (comments + retention curve)
--     pin_comment    due +24h  — pin a discussion-seeding comment
--   threads / x / facebook / bluesky:
--     engage_window  due NOW
--
-- `body` holds the ready-to-paste content for story_cta / story_results /
-- pin_comment. It starts NULL; the generate-playbook-content edge function
-- fills it on demand ("Draft it" in the Today's Plays panel) in the
-- creator's voice.
--
-- Publish-transition drift note (verified against the functions that write
-- these columns): content_posts has BOTH `status` and `publish_status`.
--   - postforme-webhook and postforme-sync flip `status` -> 'published'
--     (they never touch publish_status).
--   - publish-scheduled-posts (native path) sets BOTH status='published'
--     and publish_status='published' in one update.
-- So the trigger fires when EITHER column transitions to 'published', and a
-- per-post exists guard prevents duplicates when both flip at once or when
-- a later sync re-asserts 'published'.

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.playbook_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content_post_id uuid references public.content_posts(id) on delete cascade,
  platform text,
  social_account_id text,
  account_username text,
  task_type text not null check (task_type in ('story_cta','story_results','engage_window','first_check','pin_comment')),
  title text not null,
  body text,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','done','dismissed')),
  created_at timestamptz default now()
);

comment on table public.playbook_tasks is
  'Timed post-publish protocol tasks, created by the create_playbook_tasks trigger when a content_posts row publishes. body = pre-drafted content in the creator''s voice (filled by generate-playbook-content).';

-- The panel query: my pending tasks, soonest first.
create index if not exists idx_playbook_tasks_user_status_due
  on public.playbook_tasks (user_id, status, due_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Owner read + status-only updates. Inserts happen via the trigger (security
-- definer) and body fills via the edge function (service role) — no client
-- insert/delete policies. Column-level grants enforce "status changes only":
-- the update policy alone can't restrict columns.

alter table public.playbook_tasks enable row level security;

create policy "own playbook tasks read" on public.playbook_tasks
  for select to authenticated using (auth.uid() = user_id);

create policy "own playbook tasks update" on public.playbook_tasks
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke insert, update, delete on public.playbook_tasks from authenticated, anon;
grant update (status) on public.playbook_tasks to authenticated;

-- ── Trigger: build the playbook when a post publishes ────────────────────────
-- SECURITY DEFINER so the insert works no matter which role performed the
-- publishing update (service role from the edge functions, or the user's own
-- session): authenticated has no INSERT grant on playbook_tasks by design.
-- search_path is pinned; the function only writes rows owned by the post's
-- own user_id, so a definer context grants nothing cross-user.

create or replace function public.create_playbook_tasks()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only on a genuine transition into 'published' on either status column.
  if not (
       (new.status = 'published' and old.status is distinct from 'published')
    or (new.publish_status = 'published' and old.publish_status is distinct from 'published')
  ) then
    return new;
  end if;

  -- One playbook per post: the native path flips both columns in one update,
  -- the webhook + sync can each re-assert 'published' later, and retried
  -- publishes bounce through 'failed' and back. Never double-insert.
  if exists (
    select 1 from public.playbook_tasks t where t.content_post_id = new.id
  ) then
    return new;
  end if;

  if new.platform in ('instagram', 'tiktok') then
    insert into public.playbook_tasks
      (user_id, content_post_id, platform, social_account_id, account_username, task_type, title, due_at)
    values
      (new.user_id, new.id, new.platform, new.social_account_id, new.account_username,
       'story_cta', 'Post a story pointing to this post', now()),
      (new.user_id, new.id, new.platform, new.social_account_id, new.account_username,
       'story_results', 'Post the poll results story — it expires in 1h', now() + interval '23 hours'),
      (new.user_id, new.id, new.platform, new.social_account_id, new.account_username,
       'engage_window', 'Engagement window: reply to every comment for the next hour', now());

  elsif new.platform = 'youtube' then
    insert into public.playbook_tasks
      (user_id, content_post_id, platform, social_account_id, account_username, task_type, title, due_at)
    values
      (new.user_id, new.id, new.platform, new.social_account_id, new.account_username,
       'first_check', '24h check-in: read comments, note retention curve', now() + interval '24 hours'),
      (new.user_id, new.id, new.platform, new.social_account_id, new.account_username,
       'pin_comment', 'Pin a comment that seeds discussion', now() + interval '24 hours');

  elsif new.platform in ('threads', 'x', 'facebook', 'bluesky') then
    insert into public.playbook_tasks
      (user_id, content_post_id, platform, social_account_id, account_username, task_type, title, due_at)
    values
      (new.user_id, new.id, new.platform, new.social_account_id, new.account_username,
       'engage_window', 'Engagement window: reply to every comment for the next hour', now());
  end if;
  -- Unknown/legacy platforms (e.g. linkedin): no playbook, no error.

  return new;
end;
$$;

-- AFTER UPDATE OF the two status columns only — updates that don't touch
-- either column (metrics syncs, caption edits) never enter the function.
drop trigger if exists trg_create_playbook_tasks on public.content_posts;
create trigger trg_create_playbook_tasks
  after update of status, publish_status on public.content_posts
  for each row
  execute function public.create_playbook_tasks();
