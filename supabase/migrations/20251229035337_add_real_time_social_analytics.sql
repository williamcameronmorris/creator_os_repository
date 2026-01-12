/*
  # Add Real-Time Social Analytics Infrastructure

  1. New Tables
    - `platform_credentials` - Securely store API tokens and credentials
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `platform` (text: instagram, tiktok, youtube)
      - `access_token` (text, encrypted)
      - `refresh_token` (text, encrypted)
      - `token_expires_at` (timestamptz)
      - `platform_user_id` (text)
      - `platform_username` (text)
      - `last_synced_at` (timestamptz)
      - `is_active` (boolean)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `social_insights` - Aggregated insights and patterns
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `platform` (text)
      - `insight_type` (text: posting_pattern, content_performance, audience_behavior)
      - `insight_data` (jsonb - flexible structure for different insights)
      - `priority` (text: high, medium, low)
      - `action_required` (boolean)
      - `date` (date)
      - `created_at` (timestamptz)

    - `platform_metrics` - Daily aggregated metrics per platform
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to profiles)
      - `platform` (text)
      - `date` (date)
      - `followers_count` (integer)
      - `followers_change` (integer)
      - `total_posts` (integer)
      - `total_views` (bigint)
      - `total_likes` (bigint)
      - `total_comments` (bigint)
      - `total_shares` (bigint)
      - `total_saves` (bigint)
      - `avg_engagement_rate` (numeric)
      - `created_at` (timestamptz)

  2. Profile Extensions
    - Add TikTok and YouTube access token fields
    - Add last sync timestamps for each platform

  3. Enhanced Post Analytics
    - Add more detailed metrics to content_posts

  4. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to access only their data
*/

-- Extend profiles with more platform fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tiktok_access_token') THEN
    ALTER TABLE profiles ADD COLUMN tiktok_access_token text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tiktok_user_id') THEN
    ALTER TABLE profiles ADD COLUMN tiktok_user_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'youtube_access_token') THEN
    ALTER TABLE profiles ADD COLUMN youtube_access_token text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'youtube_channel_id') THEN
    ALTER TABLE profiles ADD COLUMN youtube_channel_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_instagram_sync') THEN
    ALTER TABLE profiles ADD COLUMN last_instagram_sync timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_tiktok_sync') THEN
    ALTER TABLE profiles ADD COLUMN last_tiktok_sync timestamptz DEFAULT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'last_youtube_sync') THEN
    ALTER TABLE profiles ADD COLUMN last_youtube_sync timestamptz DEFAULT NULL;
  END IF;
END $$;

-- Add more detailed metrics to content_posts
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_posts' AND column_name = 'saves') THEN
    ALTER TABLE content_posts ADD COLUMN saves integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_posts' AND column_name = 'reach') THEN
    ALTER TABLE content_posts ADD COLUMN reach integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_posts' AND column_name = 'impressions') THEN
    ALTER TABLE content_posts ADD COLUMN impressions integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_posts' AND column_name = 'tiktok_post_id') THEN
    ALTER TABLE content_posts ADD COLUMN tiktok_post_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_posts' AND column_name = 'youtube_video_id') THEN
    ALTER TABLE content_posts ADD COLUMN youtube_video_id text DEFAULT '';
  END IF;
END $$;

-- Create platform_credentials table
CREATE TABLE IF NOT EXISTS platform_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  access_token text DEFAULT '',
  refresh_token text DEFAULT '',
  token_expires_at timestamptz DEFAULT NULL,
  platform_user_id text DEFAULT '',
  platform_username text DEFAULT '',
  last_synced_at timestamptz DEFAULT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform)
);

-- Create social_insights table
CREATE TABLE IF NOT EXISTS social_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube', 'all')),
  insight_type text NOT NULL CHECK (insight_type IN ('posting_pattern', 'content_performance', 'audience_behavior', 'content_gap', 'trending_format', 'engagement_health')),
  insight_data jsonb DEFAULT '{}'::jsonb,
  priority text DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  action_required boolean DEFAULT false,
  date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

-- Create platform_metrics table
CREATE TABLE IF NOT EXISTS platform_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  followers_count integer DEFAULT 0,
  followers_change integer DEFAULT 0,
  total_posts integer DEFAULT 0,
  total_views bigint DEFAULT 0,
  total_likes bigint DEFAULT 0,
  total_comments bigint DEFAULT 0,
  total_shares bigint DEFAULT 0,
  total_saves bigint DEFAULT 0,
  avg_engagement_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform, date)
);

-- Enable RLS on new tables
ALTER TABLE platform_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_metrics ENABLE ROW LEVEL SECURITY;

-- Platform credentials policies
CREATE POLICY "Users can view own credentials"
  ON platform_credentials FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credentials"
  ON platform_credentials FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credentials"
  ON platform_credentials FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own credentials"
  ON platform_credentials FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Social insights policies
CREATE POLICY "Users can view own insights"
  ON social_insights FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own insights"
  ON social_insights FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own insights"
  ON social_insights FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own insights"
  ON social_insights FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Platform metrics policies
CREATE POLICY "Users can view own metrics"
  ON platform_metrics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own metrics"
  ON platform_metrics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own metrics"
  ON platform_metrics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own metrics"
  ON platform_metrics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_platform_credentials_updated_at ON platform_credentials;
CREATE TRIGGER update_platform_credentials_updated_at
  BEFORE UPDATE ON platform_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_social_insights_user_date ON social_insights(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_social_insights_priority ON social_insights(user_id, priority, action_required);
CREATE INDEX IF NOT EXISTS idx_platform_metrics_user_platform ON platform_metrics(user_id, platform, date DESC);
CREATE INDEX IF NOT EXISTS idx_content_posts_user_platform ON content_posts(user_id, platform, published_date DESC);
