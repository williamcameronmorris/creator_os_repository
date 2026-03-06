/*
  # Add YouTube Long-Form Toggle to Profiles

  1. Changes
    - Add `include_youtube_longform` boolean column to profiles table
    - Defaults to `true` for all existing and new users
    - When false, YouTube long-form views will be excluded from pricing calculations
  
  2. Purpose
    - Allows creators who don't make long-form content to opt out
    - Prevents YouTube long-form from negatively affecting their CPM calculations
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'include_youtube_longform'
  ) THEN
    ALTER TABLE profiles ADD COLUMN include_youtube_longform boolean DEFAULT true NOT NULL;
  END IF;
END $$;