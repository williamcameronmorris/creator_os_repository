/*
  # Add Brand Prospecting System

  ## Overview
  This migration creates a comprehensive brand prospecting system that allows creators
  to research, save, and organize potential brand partnerships before reaching out.

  ## New Tables
  
  ### `brand_prospects`
  Stores brands that creators are researching or planning to pitch
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, foreign key) - References auth.users
  - `brand_name` (text) - Name of the brand
  - `website` (text, optional) - Brand website URL
  - `industry` (text, optional) - Industry/category
  - `contact_name` (text, optional) - Contact person name
  - `contact_email` (text, optional) - Contact email
  - `contact_phone` (text, optional) - Contact phone
  - `status` (text) - Status: dream_brand, ready_to_pitch, researching, not_a_fit
  - `notes` (text, optional) - Research notes and observations
  - `tags` (text[], optional) - Searchable tags
  - `fit_score` (integer, optional) - AI-generated fit score (0-100)
  - `fit_analysis` (jsonb, optional) - Detailed fit assessment data
  - `budget_tier` (text, optional) - Estimated budget: micro, small, medium, large, enterprise
  - `last_outreach_date` (timestamptz, optional) - Last time they reached out
  - `next_follow_up_date` (timestamptz, optional) - Reminder for next outreach
  - `converted_to_deal_id` (uuid, optional) - References deals when converted
  - `created_at` (timestamptz) - When prospect was saved
  - `updated_at` (timestamptz) - Last update timestamp

  ### `brand_prospect_activities`
  Tracks research and outreach activities for each prospect
  - `id` (uuid, primary key) - Unique identifier
  - `prospect_id` (uuid, foreign key) - References brand_prospects
  - `user_id` (uuid, foreign key) - References auth.users
  - `activity_type` (text) - Type: note, outreach, research, status_change
  - `title` (text) - Activity title
  - `description` (text, optional) - Activity details
  - `created_at` (timestamptz) - Activity timestamp

  ## Security
  - Enable RLS on all new tables
  - Users can only access their own brand prospects
  - Users can only access activities for their prospects
  - Separate policies for select, insert, update, and delete operations
  
  ## Indexes
  - Index on user_id for fast lookups
  - Index on status for filtering
  - Index on next_follow_up_date for reminder queries
  - GIN index on tags for array searches
*/

-- Create brand_prospects table
CREATE TABLE IF NOT EXISTS brand_prospects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  brand_name text NOT NULL,
  website text,
  industry text,
  contact_name text,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'researching',
  notes text,
  tags text[] DEFAULT '{}',
  fit_score integer CHECK (fit_score >= 0 AND fit_score <= 100),
  fit_analysis jsonb DEFAULT '{}',
  budget_tier text,
  last_outreach_date timestamptz,
  next_follow_up_date timestamptz,
  converted_to_deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Create brand_prospect_activities table
CREATE TABLE IF NOT EXISTS brand_prospect_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid REFERENCES brand_prospects(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_brand_prospects_user_id ON brand_prospects(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_prospects_status ON brand_prospects(status);
CREATE INDEX IF NOT EXISTS idx_brand_prospects_next_follow_up ON brand_prospects(next_follow_up_date) WHERE next_follow_up_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_brand_prospects_tags ON brand_prospects USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_brand_prospect_activities_prospect_id ON brand_prospect_activities(prospect_id);
CREATE INDEX IF NOT EXISTS idx_brand_prospect_activities_user_id ON brand_prospect_activities(user_id);

-- Enable Row Level Security
ALTER TABLE brand_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_prospect_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for brand_prospects

-- Select policy: Users can view their own prospects
CREATE POLICY "Users can view own brand prospects"
  ON brand_prospects
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Insert policy: Users can create their own prospects
CREATE POLICY "Users can create own brand prospects"
  ON brand_prospects
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Update policy: Users can update their own prospects
CREATE POLICY "Users can update own brand prospects"
  ON brand_prospects
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete policy: Users can delete their own prospects
CREATE POLICY "Users can delete own brand prospects"
  ON brand_prospects
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for brand_prospect_activities

-- Select policy: Users can view activities for their prospects
CREATE POLICY "Users can view activities for own prospects"
  ON brand_prospect_activities
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM brand_prospects
      WHERE brand_prospects.id = brand_prospect_activities.prospect_id
      AND brand_prospects.user_id = auth.uid()
    )
  );

-- Insert policy: Users can create activities for their prospects
CREATE POLICY "Users can create activities for own prospects"
  ON brand_prospect_activities
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM brand_prospects
      WHERE brand_prospects.id = brand_prospect_activities.prospect_id
      AND brand_prospects.user_id = auth.uid()
    )
  );

-- Update policy: Users can update their own activities
CREATE POLICY "Users can update own activities"
  ON brand_prospect_activities
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Delete policy: Users can delete their own activities
CREATE POLICY "Users can delete own activities"
  ON brand_prospect_activities
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create updated_at trigger function if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

-- Add trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS update_brand_prospects_updated_at ON brand_prospects;
CREATE TRIGGER update_brand_prospects_updated_at
  BEFORE UPDATE ON brand_prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();