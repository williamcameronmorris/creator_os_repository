-- 20260507000002_add_content_post_metrics_daily.sql
-- content_post_metrics_daily: per-post daily snapshot of platform-native metrics.
-- Powers period-over-period analytics for individual posts (e.g. "this Reel's
-- engagement over the last 30d vs the prior 30d").
--
-- WHY this exists separately from content_posts:
--   * content_posts stores the CURRENT-snapshot metric values (views, likes, comments,
--     shares, engagement_rate). That gives us the latest number, but no history.
--   * Period-over-period math requires snapshot-as-stock semantics: the value at the
--     END of the period minus the value at the START of the period. Without daily
--     history, summing snapshots overstates totals (each daily row contains a lifetime
--     stock, not a daily flow).
--   * Profile-level history is already captured in platform_metrics (one row per
--     user/platform/date). This table is the per-post equivalent.
--
-- WHY metrics is jsonb:
--   Platforms expose different native metrics. IG: likes/comments/shares/saves. YT:
--   views/likes/comments/subscribers_gained. TikTok: views/likes/comments/shares.
--   A single typed-column schema would either lose platform-native nuance or end up
--   with a wide sparse table. jsonb keeps it honest and lets the sync jobs upsert
--   whatever the platform API returns without a schema migration each time.

CREATE TABLE IF NOT EXISTS public.content_post_metrics_daily (
    post_id uuid NOT NULL REFERENCES public.content_posts(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
    snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, snapshot_date)
);

-- Time-range scans scoped to a user (the analytics page's primary query shape).
CREATE INDEX IF NOT EXISTS idx_cpmd_user_date
    ON public.content_post_metrics_daily (user_id, snapshot_date DESC);

-- Most-recent-snapshot-per-post lookups.
CREATE INDEX IF NOT EXISTS idx_cpmd_post_date
    ON public.content_post_metrics_daily (post_id, snapshot_date DESC);

-- Per-platform aggregations across the user's catalog.
CREATE INDEX IF NOT EXISTS idx_cpmd_user_platform_date
    ON public.content_post_metrics_daily (user_id, platform, snapshot_date DESC);

ALTER TABLE public.content_post_metrics_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own post metrics" ON public.content_post_metrics_daily;
CREATE POLICY "Users can view own post metrics"
    ON public.content_post_metrics_daily FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own post metrics" ON public.content_post_metrics_daily;
CREATE POLICY "Users can insert own post metrics"
    ON public.content_post_metrics_daily FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own post metrics" ON public.content_post_metrics_daily;
CREATE POLICY "Users can update own post metrics"
    ON public.content_post_metrics_daily FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own post metrics" ON public.content_post_metrics_daily;
CREATE POLICY "Users can delete own post metrics"
    ON public.content_post_metrics_daily FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

COMMENT ON TABLE public.content_post_metrics_daily IS
    'Per-post daily snapshot of platform-native metrics. Append-only history that powers period-over-period math at the post level. Profile-level history lives in platform_metrics.';

COMMENT ON COLUMN public.content_post_metrics_daily.metrics IS
    'Platform-native metrics blob. IG: {likes, comments, shares, saves, reach, impressions}. YT: {views, likes, comments, subscribers_gained}. TikTok: {views, likes, comments, shares}.';
