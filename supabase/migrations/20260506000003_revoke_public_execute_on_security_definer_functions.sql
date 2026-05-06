-- The previous migration revoked EXECUTE from anon/authenticated, but Postgres
-- grants EXECUTE to PUBLIC by default at CREATE FUNCTION time, and both roles
-- inherit PUBLIC's privileges — so the advisor still flagged everything.
-- Explicitly REVOKE EXECUTE FROM PUBLIC to actually remove access.

REVOKE EXECUTE ON FUNCTION public._cowork_call_edge(text, uuid, integer)             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.assign_default_stage_to_deal()                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.calculate_due_completeness(public.deals)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_reset_ai_quota()                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_invoice_overdue()                            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_creator_default_stages()                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_creator_default_stages(uuid)                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_stages_for_user()                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_stages_for_user(uuid)               FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.identify_missing_due_fields(public.deals)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_ai_request()                             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_nightly_platform_sync()                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_deal_fields()                                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_daily_pulse_sessions_updated_at()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_deal_last_activity()                        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_due_completeness()                          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                         FROM PUBLIC;

-- For the two client-callable RPCs we revoke PUBLIC and re-grant only to
-- authenticated, so anon (which inherits PUBLIC) loses access while signed-in
-- users keep it.
REVOKE EXECUTE ON FUNCTION public.check_and_reset_ai_quota(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_ai_request(uuid)     FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_and_reset_ai_quota(uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_ai_request(uuid)     TO authenticated;
