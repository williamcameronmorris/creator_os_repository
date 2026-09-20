-- 'cancelled' = unscheduled before it published. The Post for Me post was
-- deleted, so it will never fire; the row stays for the record.
alter table public.content_posts drop constraint if exists content_posts_status_check;
alter table public.content_posts add constraint content_posts_status_check
  check (status = any (array['draft'::text, 'scheduled'::text, 'published'::text, 'failed'::text, 'publishing'::text, 'cancelled'::text]));
comment on constraint content_posts_status_check on public.content_posts is
  'cancelled = unscheduled before it published; the Post for Me post was deleted so it will never fire.';
