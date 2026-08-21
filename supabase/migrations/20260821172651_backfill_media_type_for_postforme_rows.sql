-- content_posts.media_type DEFAULTS to 'image'. postforme-sync never set it, so
-- every Post for Me row claimed to be an image, YouTube videos included. That
-- collapsed post_performance's baseline group to one bucket per platform and
-- made Instagram video compete against Instagram stills (7,867 vs 3,779 median).
--
-- The media URL identifies the type unambiguously:
--   youtube.com/embed/...   YouTube player
--   tiktok.com/player/...   TikTok player
--   .../o1/v/t2/...         Meta video CDN path (Instagram + Threads)
--
-- Only provider='postforme' rows are touched; provider='direct' rows carry a
-- real media_type from the Graph API and must not be overwritten.
update public.content_posts
set media_type = case
  when media_urls[1] like '%youtube.com/embed%' then 'video'
  when media_urls[1] like '%tiktok.com/player%' then 'video'
  when media_urls[1] like '%/o1/v/%'            then 'video'
  else 'image'
end
where provider = 'postforme'
  and media_urls is not null
  and array_length(media_urls, 1) > 0;
