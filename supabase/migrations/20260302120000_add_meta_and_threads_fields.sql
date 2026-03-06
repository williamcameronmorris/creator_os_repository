/*
  # Add Meta (Facebook/Instagram Business) and Threads Fields

  Adds new columns to the profiles table for:
  - Meta user-level access tokens (covers Pages, Instagram Business, Messenger)
  - Facebook Page connection
  - Instagram Business Account (linked to the Facebook Page)
  - Threads API connection

  Also expands platform CHECK constraints to include 'facebook' and 'threads'.
*/

-- =====================================================
-- PART 1: ADD META / FACEBOOK FIELDS TO PROFILES
-- =====================================================

DO $$ BEGIN
  -- Meta user-level token (covers Pages + Instagram Business + Messenger)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'meta_user_id') THEN
    ALTER TABLE profiles ADD COLUMN meta_user_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'meta_access_token') THEN
    ALTER TABLE profiles ADD COLUMN meta_access_token text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'meta_token_expires_at') THEN
    ALTER TABLE profiles ADD COLUMN meta_token_expires_at timestamptz DEFAULT NULL;
  END IF;

  -- Facebook Page fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'facebook_page_id') THEN
    ALTER TABLE profiles ADD COLUMN facebook_page_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'facebook_page_access_token') THEN
    ALTER TABLE profiles ADD COLUMN facebook_page_access_token text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'facebook_page_name') THEN
    ALTER TABLE profiles ADD COLUMN facebook_page_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'facebook_page_followers') THEN
    ALTER TABLE profiles ADD COLUMN facebook_page_followers integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_facebook_sync') THEN
    ALTER TABLE profiles ADD COLUMN last_facebook_sync timestamptz DEFAULT NULL;
  END IF;

  -- Instagram Business Account (linked to Facebook Page, separate from legacy instagram_user_id)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'instagram_business_account_id') THEN
    ALTER TABLE profiles ADD COLUMN instagram_business_account_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_instagram_sync') THEN
    ALTER TABLE profiles ADD COLUMN last_instagram_sync timestamptz DEFAULT NULL;
  END IF;

  -- Threads fields
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'threads_user_id') THEN
    ALTER TABLE profiles ADD COLUMN threads_user_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'threads_access_token') THEN
    ALTER TABLE profiles ADD COLUMN threads_access_token text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'threads_token_expires_at') THEN
    ALTER TABLE profiles ADD COLUMN threads_token_expires_at timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'threads_handle') THEN
    ALTER TABLE profiles ADD COLUMN threads_handle text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'threads_followers') THEN
    ALTER TABLE profiles ADD COLUMN threads_followers integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_threads_sync') THEN
    ALTER TABLE profiles ADD COLUMN last_threads_sync timestamptz DEFAULT NULL;
  END IF;

END $$;

-- =====================================================
-- PART 2: EXPAND PLATFORM CHECK CONSTRAINTS
-- =====================================================

-- content_posts: expand platform values to include facebook and threads
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.content_posts'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%platform%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.content_posts DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.content_posts
  ADD CONSTRAINT content_posts_platform_check
  CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'threads'));

-- platform_credentials: expand platform values
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.platform_credentials'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%platform%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.platform_credentials DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

ALTER TABLE public.platform_credentials
  ADD CONSTRAINT platform_credentials_platform_check
  CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'facebook', 'threads'));

-- =====================================================
-- PART 3: INDEXES FOR NEW FIELDS
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_profiles_meta_user_id ON public.profiles(meta_user_id) WHERE meta_user_id != '';
CREATE INDEX IF NOT EXISTS idx_profiles_facebook_page_id ON public.profiles(facebook_page_id) WHERE facebook_page_id != '';
CREATE INDEX IF NOT EXISTS idx_profiles_threads_user_id ON public.profiles(threads_user_id) WHERE threads_user_id != '';
