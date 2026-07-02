-- The client (useTokenHealth) only needs to know whether each platform is
-- connected and when its token expires, but it was SELECTing the raw token
-- values into the browser to compute booleans. Expose a security_invoker view
-- that derives the booleans server-side so tokens never leave the database.
-- security_invoker => the querying user's RLS on profiles applies, so each
-- user sees only their own row.

create or replace view public.token_health
with (security_invoker = on) as
select
  id as user_id,
  (instagram_access_token is not null) as instagram_connected,
  instagram_token_expires_at,
  (youtube_refresh_token is not null) as youtube_connected,
  youtube_token_expires_at,
  (tiktok_access_token is not null) as tiktok_connected,
  tiktok_token_expires_at,
  (threads_access_token is not null) as threads_connected,
  threads_token_expires_at
from public.profiles;

grant select on public.token_health to authenticated;
