-- Address remaining Supabase security advisor WARNs:
--   * function_search_path_mutable
--   * anon_security_definer_function_executable
--   * authenticated_security_definer_function_executable
--   * public_bucket_allows_listing
--
-- Strategy:
--   1. Pin search_path on the two flagged functions.
--   2. Revoke EXECUTE from anon for every SECURITY DEFINER function in public.
--   3. Revoke EXECUTE from authenticated for everything except the two quota
--      RPCs that the app actually calls (check_and_reset_ai_quota(uuid) and
--      increment_ai_request(uuid)). Triggers, cron-driven jobs, and helper
--      functions don't need to be reachable via PostgREST.
--   4. Drop the broad SELECT policies on storage.objects for the public
--      `avatars` and `media` buckets — public buckets serve files via direct
--      URL without needing storage.objects SELECT, and the broad policies let
--      any client list every file in the bucket.
--
-- Note: leaked-password protection is an Auth dashboard setting and must be
-- enabled manually via Supabase Studio (Auth -> Providers -> Email).

-- 1. Pin search_path -----------------------------------------------------------

ALTER FUNCTION public.update_challenge_progress_updated_at()
  SET search_path = public, pg_temp;

ALTER FUNCTION public._cowork_call_edge(text, uuid, integer)
  SET search_path = public, pg_temp;

-- 2 + 3. Lock down EXECUTE on SECURITY DEFINER functions ----------------------

-- Trigger / cron / internal helpers: revoke from both anon and authenticated.
REVOKE EXECUTE ON FUNCTION public._cowork_call_edge(text, uuid, integer)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_default_stage_to_deal()                     FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_due_completeness(public.deals)           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_reset_ai_quota()                         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_invoice_overdue()                            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_creator_default_stages()                    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_creator_default_stages(uuid)                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_stages_for_user()                   FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_default_stages_for_user(uuid)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()                                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.identify_missing_due_fields(public.deals)          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_ai_request()                             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_nightly_platform_sync()                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_deal_fields()                                 FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_daily_pulse_sessions_updated_at()           FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_deal_last_activity()                        FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_due_completeness()                          FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column()                         FROM anon, authenticated;

-- Client-called RPCs: revoke from anon only. authenticated keeps EXECUTE
-- because src/lib/aiQuota.ts and the edge functions call these as the
-- signed-in user. The functions remain SECURITY DEFINER so they can write to
-- ai_request_usage despite RLS.
REVOKE EXECUTE ON FUNCTION public.check_and_reset_ai_quota(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_ai_request(uuid)     FROM anon;

-- 4. Tighten public storage buckets -------------------------------------------

DROP POLICY IF EXISTS "Anyone can view avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can view all media" ON storage.objects;
