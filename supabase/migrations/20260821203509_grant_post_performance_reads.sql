-- post_performance is security_invoker, so RLS on content_posts still scopes
-- rows to the caller. These grants just make it reachable from the client.
grant select on public.post_performance to authenticated;
grant select on public.content_lanes    to authenticated;
