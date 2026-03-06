/*
  # Add onboarding completed field

  1. Changes
    - Add `onboarding_completed` boolean field to profiles table
    - Defaults to false for new users
    - Used to track if user has completed first-time setup flow
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'onboarding_completed'
  ) THEN
    ALTER TABLE profiles ADD COLUMN onboarding_completed boolean DEFAULT false;
  END IF;
END $$;
