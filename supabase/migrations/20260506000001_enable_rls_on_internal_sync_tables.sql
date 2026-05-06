-- Lock down internal sync-tracking tables exposed via PostgREST.
-- These tables are written by SECURITY DEFINER functions (_cowork_call_edge,
-- run_nightly_platform_sync) and the postgres/service_role; no end user should
-- read or write them through the API.

ALTER TABLE public._cowork_sync_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._nightly_sync_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._cowork_sync_run FROM anon, authenticated;
REVOKE ALL ON TABLE public._nightly_sync_runs FROM anon, authenticated;
