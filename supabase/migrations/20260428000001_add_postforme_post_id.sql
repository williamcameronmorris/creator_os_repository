-- Add Post for Me post id to content_posts so we can correlate the local
-- mirror row(s) back to the upstream PFM post.
alter table public.content_posts
  add column if not exists postforme_post_id text;

create index if not exists content_posts_postforme_post_id_idx
  on public.content_posts (postforme_post_id);
