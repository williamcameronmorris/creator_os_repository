-- Step 1 of 2: readable flags for stored platform tokens.
--
-- Adds has_*_token generated booleans to profiles and points token_health and
-- data_health at them instead of the raw token columns. Both views are
-- security_invoker, so once step 2 (20261022120100_lock_down_platform_tokens)
-- stops granting the token columns to the app, a view that still read them
-- would fail for every signed-in user.
--
-- Safe to apply before the app change ships: nothing is revoked here, and the
-- views keep their column names and types.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_instagram_token boolean
    GENERATED ALWAYS AS (COALESCE(instagram_access_token, '') <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_youtube_refresh_token boolean
    GENERATED ALWAYS AS (COALESCE(youtube_refresh_token, '') <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_tiktok_token boolean
    GENERATED ALWAYS AS (COALESCE(tiktok_access_token, '') <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_threads_token boolean
    GENERATED ALWAYS AS (COALESCE(threads_access_token, '') <> '') STORED,
  ADD COLUMN IF NOT EXISTS has_meta_token boolean
    GENERATED ALWAYS AS (COALESCE(meta_access_token, '') <> '') STORED;

-- ── views: same columns, no raw tokens ─────────────────────────────────────
CREATE OR REPLACE VIEW public.token_health WITH (security_invoker = on) AS
 SELECT id AS user_id,
    has_instagram_token AS instagram_connected,
    instagram_token_expires_at,
    has_youtube_refresh_token AS youtube_connected,
    youtube_token_expires_at,
    has_tiktok_token AS tiktok_connected,
    tiktok_token_expires_at,
    has_threads_token AS threads_connected,
    threads_token_expires_at
   FROM public.profiles;

CREATE OR REPLACE VIEW public.data_health WITH (security_invoker = on) AS
 WITH plat AS (
         SELECT DISTINCT b.id AS brand_id,
            x.platform
           FROM brands b
             CROSS JOIN LATERAL ( SELECT a.platform
                   FROM brand_social_accounts a
                  WHERE a.brand_id = b.id
                UNION
                 SELECT c.platform
                   FROM content_posts c
                  WHERE c.brand_id = b.id AND c.status = 'published'::text) x
          WHERE x.platform IS NOT NULL
        ), brand_rows AS (
         SELECT b.id AS brand_id,
            b.owner_id,
            b.is_default,
            pfm.accounts_connected,
            pfm.newest_snapshot_at,
            COALESCE(cp.total_posts, 0::bigint) AS total_posts,
            cp.newest_post_at,
            COALESCE(cp.platforms_with_posts, 0::bigint) AS platforms_with_posts,
            pm.newest_metric_date,
            COALESCE(pm.platforms_with_metrics, 0::bigint) AS platforms_with_metrics,
            COALESCE(pp.scored_posts, 0::bigint) AS scored_posts,
            COALESCE(pp.posts_with_verdict, 0::bigint) AS posts_with_verdict
           FROM brands b
             LEFT JOIN LATERAL ( SELECT count(DISTINCT s.pfm_account_id) AS accounts_connected,
                    max(s.snapshot_at) AS newest_snapshot_at
                   FROM pfm_account_snapshots s
                  WHERE s.brand_id = b.id AND s.snapshot_at > (now() - '7 days'::interval)) pfm ON true
             LEFT JOIN LATERAL ( SELECT count(*) AS total_posts,
                    max(COALESCE(c.published_at, c.published_date)) AS newest_post_at,
                    count(DISTINCT c.platform) AS platforms_with_posts
                   FROM content_posts c
                  WHERE c.brand_id = b.id AND c.status = 'published'::text) cp ON true
             LEFT JOIN LATERAL ( SELECT max(d.snapshot_date) AS newest_metric_date,
                    count(DISTINCT d.platform) FILTER (WHERE d.snapshot_date > (CURRENT_DATE - 7)) AS platforms_with_metrics
                   FROM content_post_metrics_daily d
                  WHERE d.brand_id = b.id) pm ON true
             LEFT JOIN LATERAL ( SELECT count(*) AS scored_posts,
                    count(*) FILTER (WHERE v.views_multiple IS NOT NULL) AS posts_with_verdict
                   FROM post_performance v
                  WHERE v.brand_id = b.id) pp ON true
        )
 SELECT p.id AS user_id,
        CASE
            WHEN br.is_default THEN p.last_instagram_sync
            ELSE NULL::timestamp with time zone
        END AS last_instagram_sync,
        CASE
            WHEN br.is_default THEN p.last_youtube_sync
            ELSE NULL::timestamp with time zone
        END AS last_youtube_sync,
        CASE
            WHEN br.is_default THEN p.last_facebook_sync
            ELSE NULL::timestamp with time zone
        END AS last_facebook_sync,
        CASE
            WHEN br.is_default THEN p.last_threads_sync
            ELSE NULL::timestamp with time zone
        END AS last_threads_sync,
        CASE
            WHEN br.is_default THEN p.meta_token_expires_at
            ELSE NULL::timestamp with time zone
        END AS meta_token_expires_at,
        CASE
            WHEN br.is_default THEN p.youtube_token_expires_at
            ELSE NULL::timestamp with time zone
        END AS youtube_token_expires_at,
        CASE
            WHEN br.is_default THEN p.threads_token_expires_at
            ELSE NULL::timestamp with time zone
        END AS threads_token_expires_at,
    br.is_default AND p.has_meta_token AS has_meta_token,
    br.is_default AND p.has_youtube_refresh_token AS has_youtube_refresh,
    br.is_default AND p.has_threads_token AS has_threads_token,
    br.accounts_connected,
    br.newest_snapshot_at,
    br.total_posts,
    br.newest_post_at,
    br.platforms_with_posts,
    br.newest_metric_date,
    br.platforms_with_metrics,
    br.scored_posts,
    br.posts_with_verdict,
    br.brand_id,
    pl.platform,
    ppf.accounts_connected AS platform_accounts_connected,
    ppf.newest_snapshot_at AS platform_newest_snapshot_at,
    COALESCE(pcp.total_posts, 0::bigint) AS platform_total_posts,
    pcp.newest_post_at AS platform_newest_post_at,
    pmd.newest_metric_date AS platform_newest_metric_date,
    COALESCE(pmd.posts_with_metrics_7d, 0::bigint) AS platform_posts_with_metrics_7d
   FROM brand_rows br
     JOIN profiles p ON p.id = br.owner_id
     LEFT JOIN plat pl ON pl.brand_id = br.brand_id
     LEFT JOIN LATERAL ( SELECT count(DISTINCT s.pfm_account_id) AS accounts_connected,
            max(s.snapshot_at) AS newest_snapshot_at
           FROM pfm_account_snapshots s
          WHERE s.brand_id = br.brand_id AND s.platform = pl.platform AND s.snapshot_at > (now() - '7 days'::interval)) ppf ON true
     LEFT JOIN LATERAL ( SELECT count(*) AS total_posts,
            max(COALESCE(c.published_at, c.published_date)) AS newest_post_at
           FROM content_posts c
          WHERE c.brand_id = br.brand_id AND c.platform = pl.platform AND c.status = 'published'::text) pcp ON true
     LEFT JOIN LATERAL ( SELECT max(d.snapshot_date) AS newest_metric_date,
            count(DISTINCT d.post_id) FILTER (WHERE d.snapshot_date > (CURRENT_DATE - 7)) AS posts_with_metrics_7d
           FROM content_post_metrics_daily d
          WHERE d.brand_id = br.brand_id AND d.platform = pl.platform) pmd ON true
;

COMMIT;
