-- Day 4 hygiene: add derived boolean columns so the client can check platform
-- connectedness WITHOUT ever selecting the raw access token.
--
-- These are STORED generated columns — computed automatically on every
-- INSERT/UPDATE of the source columns, zero read cost. Existing rows get
-- their values computed on migration (effectively free for this table size).
--
-- Why generated columns over a view: clients already select many non-token
-- fields from profiles; adding one more column per platform is the smallest
-- possible change. No view rewrites, no RPC round-trips, no schema split.
--
-- This does NOT remove read access to token columns — that requires a
-- separate effort to move Graph API calls server-side (tracked separately).
-- The value here is simply that client code no longer needs to SELECT tokens
-- just to render a "Connected" chip.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS instagram_connected boolean
    GENERATED ALWAYS AS (
      (instagram_access_token IS NOT NULL AND instagram_access_token <> '')
      OR (instagram_business_account_id IS NOT NULL AND instagram_business_account_id <> '')
    ) STORED,
  ADD COLUMN IF NOT EXISTS youtube_connected boolean
    GENERATED ALWAYS AS (
      youtube_access_token IS NOT NULL AND youtube_access_token <> ''
    ) STORED,
  ADD COLUMN IF NOT EXISTS tiktok_connected boolean
    GENERATED ALWAYS AS (
      tiktok_access_token IS NOT NULL AND tiktok_access_token <> ''
    ) STORED,
  ADD COLUMN IF NOT EXISTS threads_connected boolean
    GENERATED ALWAYS AS (
      threads_access_token IS NOT NULL AND threads_access_token <> ''
    ) STORED,
  ADD COLUMN IF NOT EXISTS facebook_connected boolean
    GENERATED ALWAYS AS (
      (meta_access_token IS NOT NULL AND meta_access_token <> '')
      AND (facebook_page_id IS NOT NULL AND facebook_page_id <> '')
    ) STORED;
