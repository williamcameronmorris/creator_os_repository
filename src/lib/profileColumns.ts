/**
 * Every profiles column the browser is allowed to read.
 *
 * profiles is granted per column (migration 20261022120100): the OAuth token
 * columns are not granted to the app at all, so `select('*')` on profiles
 * fails with "permission denied". Select this list instead. A column added to
 * profiles has to be granted in a migration AND added here before the app can
 * see it; scripts/check-guards.mjs fails CI on a profiles `select('*')`.
 *
 * One string literal on purpose: supabase-js derives the row type from the
 * literal, and a concatenated string loses it.
 */
// prettier-ignore
export const PROFILE_COLUMNS = 'id,cpm_tier,cpm_custom,youtube_avg_views,tiktok_avg_views,instagram_avg_views,youtube_shorts_avg_views,revision_rounds_included,extra_revision_fee,payment_terms,created_at,updated_at,onboarding_completed,include_youtube_longform,role,subscription_tier,full_name,avatar_url,instagram_handle,instagram_user_id,instagram_followers,tiktok_handle,tiktok_followers,youtube_handle,youtube_followers,bio,tiktok_user_id,youtube_channel_id,last_instagram_sync,last_tiktok_sync,last_youtube_sync,meta_user_id,facebook_page_id,facebook_page_name,facebook_page_followers,last_facebook_sync,instagram_business_account_id,threads_user_id,threads_handle,threads_followers,last_threads_sync,display_name,phone,city,state,website,timezone,instagram_token_expires_at,youtube_token_expires_at,meta_token_expires_at,threads_token_expires_at,tiktok_token_expires_at,first_name,last_name,niche_preference,posting_frequency,primary_platform,notes,onboarding_step,has_instagram_token,has_youtube_refresh_token,has_tiktok_token,has_threads_token,has_meta_token';
