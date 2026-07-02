-- The app publishes to 7 platforms via PostForMe (adds x, linkedin) and uses a
-- transient 'publishing' status for publish-now posts, but the CHECK constraints
-- only allowed the original 5 platforms and 4 statuses. Inserts for x/linkedin or
-- status='publishing' silently failed (the client swallowed the error), so those
-- posts published to the platform but were never mirrored locally. Widen both
-- constraints. Additive only -- no existing row can violate a widened IN list.

alter table public.content_posts drop constraint if exists content_posts_platform_check;
alter table public.content_posts add constraint content_posts_platform_check
  check (platform = any (array['instagram','tiktok','youtube','facebook','threads','x','linkedin']));

alter table public.content_posts drop constraint if exists content_posts_status_check;
alter table public.content_posts add constraint content_posts_status_check
  check (status = any (array['draft','scheduled','published','failed','publishing']));
