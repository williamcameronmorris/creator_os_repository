/*
  # Enhanced Deal Pipeline and Activity Tracking

  ## Overview
  This migration adds support for flexible pipeline stages, activity tracking, and enhanced deal metadata
  to enable a kanban-style workflow and smart dashboard features.

  ## New Tables
  
  ### `deal_stages`
  - `id` (uuid, primary key) - Unique identifier for each stage
  - `user_id` (uuid, foreign key) - Links to auth.users
  - `name` (text) - Stage name (e.g., "Lead", "Negotiating", "Won")
  - `position` (integer) - Order of stages in the pipeline
  - `color` (text) - Visual indicator color
  - `is_default` (boolean) - Whether this is a default system stage
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### `deal_activities`
  - `id` (uuid, primary key) - Unique identifier
  - `deal_id` (uuid, foreign key) - Links to deals
  - `user_id` (uuid, foreign key) - Links to auth.users
  - `activity_type` (text) - Type of activity (e.g., "created", "stage_changed", "note_added")
  - `description` (text) - Human-readable description
  - `metadata` (jsonb) - Additional structured data
  - `created_at` (timestamptz) - When the activity occurred

  ## Schema Changes
  
  ### Updated `deals` table
  - Add `stage_id` (uuid, foreign key) - Current pipeline stage
  - Add `priority` (text) - Deal priority (high, medium, low)
  - Add `tags` (text[]) - Array of tags for categorization
  - Add `expected_close_date` (date) - When deal is expected to close
  - Add `last_activity_at` (timestamptz) - Timestamp of last activity

  ## Security
  - Enable RLS on all new tables
  - Users can only access their own stages and activities
  - Activities are linked to deals, which are already protected by RLS
  
  ## Default Data
  - Create default pipeline stages for each user on first login
  - Stages: Lead, Contacted, Negotiating, Proposal Sent, Won, Lost
*/

-- Create deal_stages table
CREATE TABLE IF NOT EXISTS deal_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  color text DEFAULT '#6B7280',
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deal_activities table
CREATE TABLE IF NOT EXISTS deal_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Add new columns to deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'stage_id'
  ) THEN
    ALTER TABLE deals ADD COLUMN stage_id uuid REFERENCES deal_stages(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'priority'
  ) THEN
    ALTER TABLE deals ADD COLUMN priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'tags'
  ) THEN
    ALTER TABLE deals ADD COLUMN tags text[] DEFAULT ARRAY[]::text[];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'expected_close_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN expected_close_date date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE deals ADD COLUMN last_activity_at timestamptz DEFAULT now();
  END IF;
END $$;

-- Enable RLS
ALTER TABLE deal_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for deal_stages
CREATE POLICY "Users can view own stages"
  ON deal_stages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stages"
  ON deal_stages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stages"
  ON deal_stages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own stages"
  ON deal_stages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for deal_activities
CREATE POLICY "Users can view activities for own deals"
  ON deal_activities FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_activities.deal_id
      AND deals.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert activities for own deals"
  ON deal_activities FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM deals
      WHERE deals.id = deal_activities.deal_id
      AND deals.user_id = auth.uid()
    )
  );

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_deal_stages_user_id ON deal_stages(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_stages_position ON deal_stages(user_id, position);
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal_id ON deal_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_created_at ON deal_activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_stage_id ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_last_activity_at ON deals(last_activity_at DESC);

-- Function to create default stages for new users
CREATE OR REPLACE FUNCTION create_default_stages_for_user(user_id_param uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO deal_stages (user_id, name, position, color, is_default)
  VALUES
    (user_id_param, 'Lead', 0, '#9CA3AF', true),
    (user_id_param, 'Contacted', 1, '#60A5FA', true),
    (user_id_param, 'Negotiating', 2, '#FBBF24', true),
    (user_id_param, 'Proposal Sent', 3, '#A78BFA', true),
    (user_id_param, 'Won', 4, '#34D399', true),
    (user_id_param, 'Lost', 5, '#F87171', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update last_activity_at when activities are added
CREATE OR REPLACE FUNCTION update_deal_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE deals
  SET last_activity_at = NEW.created_at
  WHERE id = NEW.deal_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update last_activity_at
DROP TRIGGER IF EXISTS trigger_update_deal_last_activity ON deal_activities;
CREATE TRIGGER trigger_update_deal_last_activity
  AFTER INSERT ON deal_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_last_activity();

-- Create default stages for existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    IF NOT EXISTS (SELECT 1 FROM deal_stages WHERE user_id = user_record.id) THEN
      PERFORM create_default_stages_for_user(user_record.id);
    END IF;
  END LOOP;
END $$;