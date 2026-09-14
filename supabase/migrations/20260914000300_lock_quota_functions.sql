-- Quota functions run only from edge functions.
--
-- increment_ai_request and check_and_reset_ai_quota are SECURITY DEFINER and
-- were executable by any signed-in user through /rest/v1/rpc. The edge
-- functions reach them with the service role, and the app now reads its
-- quota straight from ai_request_usage (own row, RLS) instead of calling the
-- reset function, so the authenticated grant has no remaining caller.
--
-- move_account_history stays callable by authenticated: it is invoked from
-- the Connections page, and its body checks auth.uid() against both the
-- target brand's owner and the account's current brand before moving
-- anything (see 20260906200000_move_account_history.sql).
revoke execute on function public.check_and_reset_ai_quota(uuid) from authenticated;
revoke execute on function public.increment_ai_request(uuid) from authenticated;
