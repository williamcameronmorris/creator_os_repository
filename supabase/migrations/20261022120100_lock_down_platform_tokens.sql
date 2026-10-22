-- Step 2 of 2: platform tokens are server-only.
--
-- profiles carried seven plaintext OAuth tokens (YouTube refresh, Meta user and
-- page, Instagram, Threads, TikTok) and platform_credentials carried more, both
-- behind "own row" SELECT policies. RLS scoped them to the owner but still
-- handed them to the browser session: any XSS, extension or leaked session
-- could read every long-lived grant. Every legitimate reader is an edge
-- function on the service role, which these grants do not touch.
--
-- After this migration:
--   * platform_credentials has RLS on and no policies, and anon/authenticated
--     hold no privileges on it. Service role only.
--   * profiles is granted per column. The token columns are not granted to
--     anon or authenticated at all, so `select=*` from a browser fails with
--     "permission denied" instead of returning tokens.
--   * subscription_tier and the token expiry columns stay readable but are no
--     longer writable by the client. increment_ai_request trusts
--     subscription_tier, so a client write of 'admin' was a 100000/day quota.
--   * Step 1 (20261022120000_profile_token_flags) already moved token_health
--     and data_health onto the has_*_token flags.
--
-- Apply AFTER the app build that selects PROFILE_COLUMNS is live. The build
-- before it used select('*') on profiles, which this migration denies.
--
-- Adding a column to profiles now means granting it below, or the app cannot
-- see it. That is the point: new columns are private until someone decides.

BEGIN;

-- ── platform_credentials: service role only ────────────────────────────────
DROP POLICY IF EXISTS "Users can view own credentials" ON public.platform_credentials;
DROP POLICY IF EXISTS "Users can insert own credentials" ON public.platform_credentials;
DROP POLICY IF EXISTS "Users can update own credentials" ON public.platform_credentials;
DROP POLICY IF EXISTS "Users can delete own credentials" ON public.platform_credentials;
ALTER TABLE public.platform_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_credentials FROM anon, authenticated;

-- ── profiles: column grants ────────────────────────────────────────────────
-- Table-level grants cover every column, so they have to go before column
-- grants mean anything. anon has no policy on profiles and gets nothing.
REVOKE ALL ON public.profiles FROM anon, authenticated;

GRANT SELECT (
  id, cpm_tier, cpm_custom, youtube_avg_views, tiktok_avg_views,
  instagram_avg_views, youtube_shorts_avg_views, revision_rounds_included,
  extra_revision_fee, payment_terms, created_at, updated_at,
  onboarding_completed, include_youtube_longform, role, subscription_tier,
  full_name, avatar_url, instagram_handle, instagram_user_id,
  instagram_followers, tiktok_handle, tiktok_followers, youtube_handle,
  youtube_followers, bio, tiktok_user_id, youtube_channel_id,
  last_instagram_sync, last_tiktok_sync, last_youtube_sync, meta_user_id,
  facebook_page_id, facebook_page_name, facebook_page_followers,
  last_facebook_sync, instagram_business_account_id, threads_user_id,
  threads_handle, threads_followers, last_threads_sync, display_name, phone,
  city, state, website, timezone, instagram_token_expires_at,
  youtube_token_expires_at, meta_token_expires_at, threads_token_expires_at,
  tiktok_token_expires_at, first_name, last_name, niche_preference,
  posting_frequency, primary_platform, notes, onboarding_step,
  has_instagram_token, has_youtube_refresh_token, has_tiktok_token,
  has_threads_token, has_meta_token
) ON public.profiles TO authenticated;

GRANT INSERT (
  id, cpm_tier, cpm_custom, youtube_avg_views, tiktok_avg_views,
  instagram_avg_views, youtube_shorts_avg_views, revision_rounds_included,
  extra_revision_fee, payment_terms, created_at, updated_at,
  onboarding_completed, include_youtube_longform, role, full_name,
  avatar_url, instagram_handle, instagram_user_id, instagram_followers,
  tiktok_handle, tiktok_followers, youtube_handle, youtube_followers, bio,
  tiktok_user_id, youtube_channel_id, last_instagram_sync, last_tiktok_sync,
  last_youtube_sync, meta_user_id, facebook_page_id, facebook_page_name,
  facebook_page_followers, last_facebook_sync, instagram_business_account_id,
  threads_user_id, threads_handle, threads_followers, last_threads_sync,
  display_name, phone, city, state, website, timezone, first_name, last_name,
  niche_preference, posting_frequency, primary_platform, notes,
  onboarding_step
) ON public.profiles TO authenticated;

GRANT UPDATE (
  id, cpm_tier, cpm_custom, youtube_avg_views, tiktok_avg_views,
  instagram_avg_views, youtube_shorts_avg_views, revision_rounds_included,
  extra_revision_fee, payment_terms, created_at, updated_at,
  onboarding_completed, include_youtube_longform, role, full_name,
  avatar_url, instagram_handle, instagram_user_id, instagram_followers,
  tiktok_handle, tiktok_followers, youtube_handle, youtube_followers, bio,
  tiktok_user_id, youtube_channel_id, last_instagram_sync, last_tiktok_sync,
  last_youtube_sync, meta_user_id, facebook_page_id, facebook_page_name,
  facebook_page_followers, last_facebook_sync, instagram_business_account_id,
  threads_user_id, threads_handle, threads_followers, last_threads_sync,
  display_name, phone, city, state, website, timezone, first_name, last_name,
  niche_preference, posting_frequency, primary_platform, notes,
  onboarding_step
) ON public.profiles TO authenticated;

COMMIT;
