-- Keep the derivation next to the data rather than in postforme-sync, so it
-- cannot drift from the backfill and applies no matter which code path inserts.
-- Only fires when the caller left media_type at its 'image' default and a media
-- URL is present, so an explicit media_type from the Graph API always wins.
create or replace function public.derive_postforme_media_type()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.provider = 'postforme'
     and coalesce(new.media_type, 'image') = 'image'
     and new.media_urls is not null
     and array_length(new.media_urls, 1) > 0
  then
    new.media_type := case
      when new.media_urls[1] like '%youtube.com/embed%' then 'video'
      when new.media_urls[1] like '%tiktok.com/player%' then 'video'
      when new.media_urls[1] like '%/o1/v/%'            then 'video'
      else 'image'
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_derive_postforme_media_type on public.content_posts;
create trigger trg_derive_postforme_media_type
  before insert or update of media_urls on public.content_posts
  for each row execute function public.derive_postforme_media_type();
