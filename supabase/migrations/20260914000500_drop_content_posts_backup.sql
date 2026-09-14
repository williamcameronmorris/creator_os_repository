-- Drop the April backup table.
--
-- content_posts_backup_20260405 was a one-off copy taken before the April
-- schema change and never read since. It holds a stale copy of every user's
-- posts with RLS on and no policy, so nothing could read it anyway. Run by
-- hand in the SQL editor: it is the one statement in this set that destroys
-- data, and it should be a deliberate click.
drop table if exists public.content_posts_backup_20260405;
