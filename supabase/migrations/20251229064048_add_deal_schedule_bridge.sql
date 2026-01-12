/*
  # Add Deal-Schedule Bridge

  1. Updates to Deals Table
    - `synced_to_schedule` (boolean) - Track if deal has been synced to schedule
    - `last_schedule_sync` (timestamptz) - Track when last synced
  
  2. Updates to Content Posts Table
    - `deal_id` (uuid) - Link post back to deal
    - `is_sponsored` (boolean) - Mark if post is sponsored content
  
  3. Security
    - Maintain existing RLS policies
*/

-- Add fields to deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'synced_to_schedule'
  ) THEN
    ALTER TABLE deals ADD COLUMN synced_to_schedule boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'last_schedule_sync'
  ) THEN
    ALTER TABLE deals ADD COLUMN last_schedule_sync timestamptz;
  END IF;
END $$;

-- Add fields to content_posts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_posts' AND column_name = 'deal_id'
  ) THEN
    ALTER TABLE content_posts ADD COLUMN deal_id uuid REFERENCES deals(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'content_posts' AND column_name = 'is_sponsored'
  ) THEN
    ALTER TABLE content_posts ADD COLUMN is_sponsored boolean DEFAULT false;
  END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_content_posts_deal_id ON content_posts(deal_id);
CREATE INDEX IF NOT EXISTS idx_content_posts_is_sponsored ON content_posts(is_sponsored);
CREATE INDEX IF NOT EXISTS idx_deals_synced_to_schedule ON deals(synced_to_schedule);
