/*
  # Saved Content Ideas Feature

  1. New Tables
    - `saved_content_ideas`
      - Stores user-saved content ideas for future reference
      - Includes title, description, platform, content type
      - Tags and notes for organization
      - Favoriting and archiving capabilities

  2. Security
    - Enable RLS on saved_content_ideas table
    - Add policies for authenticated users to manage their own saved ideas

  3. Important Notes
    - Helps users organize and plan future content
    - Can be converted into scheduled posts later
    - Supports tagging system for better organization
*/

-- Saved Content Ideas Table
CREATE TABLE IF NOT EXISTS saved_content_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  platform text NOT NULL,
  content_type text NOT NULL,
  tags text[] DEFAULT '{}',
  notes text,
  inspiration_source text,
  is_favorite boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE saved_content_ideas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own saved ideas"
  ON saved_content_ideas FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own saved ideas"
  ON saved_content_ideas FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved ideas"
  ON saved_content_ideas FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved ideas"
  ON saved_content_ideas FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saved_content_ideas_user_id ON saved_content_ideas(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_content_ideas_platform ON saved_content_ideas(platform);
CREATE INDEX IF NOT EXISTS idx_saved_content_ideas_is_favorite ON saved_content_ideas(is_favorite);
CREATE INDEX IF NOT EXISTS idx_saved_content_ideas_is_archived ON saved_content_ideas(is_archived);
CREATE INDEX IF NOT EXISTS idx_saved_content_ideas_created_at ON saved_content_ideas(created_at DESC);
