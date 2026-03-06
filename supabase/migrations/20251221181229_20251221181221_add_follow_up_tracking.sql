/*
  # Add Follow-Up Tracking to Deals

  1. Changes
    - Add `follow_up_count` column to `deals` table
      - Tracks number of times user has followed up with this deal
      - Default value is 0
      - Used to provide contextual guidance on next steps
  
  2. Notes
    - Follow-up count helps determine suggested actions:
      - 0 follow-ups: Initial outreach
      - 1 follow-up: Standard follow-up guidance
      - 2+ follow-ups: Decision point (no response vs move forward)
*/

-- Add follow_up_count to deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'follow_up_count'
  ) THEN
    ALTER TABLE deals ADD COLUMN follow_up_count integer DEFAULT 0 NOT NULL;
  END IF;
END $$;
