/*
  # Add SocialFlow Features to Brand Deal OS

  1. Profile Extensions
    - Add fields for user role (creator/brand)
    - Add subscription tier (free/paid)
    - Add Instagram integration fields
    - Add social media handles and followers
    - Add avatar URL

  2. New Tables
    - `content_posts` - Scheduled social media content
    - `media_library` - Uploaded media assets
    - `post_analytics` - Performance metrics for posts
    - `revenue_records` - Revenue tracking entries
    - `brand_partnerships` - Partnership tracking (different from deals)

  3. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users
*/

-- Extend profiles table with SocialFlow fields
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
    ALTER TABLE profiles ADD COLUMN role text DEFAULT 'creator' CHECK (role IN ('creator', 'brand'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_tier') THEN
    ALTER TABLE profiles ADD COLUMN subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'paid'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
    ALTER TABLE profiles ADD COLUMN full_name text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'avatar_url') THEN
    ALTER TABLE profiles ADD COLUMN avatar_url text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'instagram_handle') THEN
    ALTER TABLE profiles ADD COLUMN instagram_handle text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'instagram_access_token') THEN
    ALTER TABLE profiles ADD COLUMN instagram_access_token text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'instagram_user_id') THEN
    ALTER TABLE profiles ADD COLUMN instagram_user_id text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'instagram_followers') THEN
    ALTER TABLE profiles ADD COLUMN instagram_followers integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tiktok_handle') THEN
    ALTER TABLE profiles ADD COLUMN tiktok_handle text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'tiktok_followers') THEN
    ALTER TABLE profiles ADD COLUMN tiktok_followers integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'youtube_handle') THEN
    ALTER TABLE profiles ADD COLUMN youtube_handle text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'youtube_followers') THEN
    ALTER TABLE profiles ADD COLUMN youtube_followers integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'bio') THEN
    ALTER TABLE profiles ADD COLUMN bio text DEFAULT '';
  END IF;
END $$;

-- Create content_posts table
CREATE TABLE IF NOT EXISTS content_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  caption text DEFAULT '',
  media_url text DEFAULT '',
  media_type text DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'carousel')),
  scheduled_date timestamptz DEFAULT NULL,
  published_date timestamptz DEFAULT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'failed')),
  instagram_post_id text DEFAULT '',
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  engagement_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create media_library table
CREATE TABLE IF NOT EXISTS media_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  file_name text NOT NULL DEFAULT '',
  file_url text NOT NULL DEFAULT '',
  file_type text NOT NULL DEFAULT 'image' CHECK (file_type IN ('image', 'video')),
  file_size bigint DEFAULT 0,
  thumbnail_url text DEFAULT '',
  tags text[] DEFAULT ARRAY[]::text[],
  uploaded_at timestamptz DEFAULT now()
);

-- Create post_analytics table
CREATE TABLE IF NOT EXISTS post_analytics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  post_id uuid REFERENCES content_posts(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('instagram', 'tiktok', 'youtube')),
  date date NOT NULL DEFAULT CURRENT_DATE,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  saves integer DEFAULT 0,
  reach integer DEFAULT 0,
  impressions integer DEFAULT 0,
  engagement_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create revenue_records table
CREATE TABLE IF NOT EXISTS revenue_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  deal_id uuid REFERENCES deals(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'cancelled')),
  payment_method text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create brand_partnerships table
CREATE TABLE IF NOT EXISTS brand_partnerships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand_name text NOT NULL DEFAULT '',
  contact_name text DEFAULT '',
  contact_email text DEFAULT '',
  partnership_type text DEFAULT 'sponsorship' CHECK (partnership_type IN ('sponsorship', 'affiliate', 'ambassador', 'collaboration')),
  start_date date DEFAULT NULL,
  end_date date DEFAULT NULL,
  total_value numeric DEFAULT 0,
  status text DEFAULT 'active' CHECK (status IN ('active', 'pending', 'completed', 'cancelled')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE content_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE brand_partnerships ENABLE ROW LEVEL SECURITY;

-- Content posts policies
CREATE POLICY "Users can view own posts"
  ON content_posts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own posts"
  ON content_posts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts"
  ON content_posts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts"
  ON content_posts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Media library policies
CREATE POLICY "Users can view own media"
  ON media_library FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media"
  ON media_library FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media"
  ON media_library FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media"
  ON media_library FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Post analytics policies
CREATE POLICY "Users can view own analytics"
  ON post_analytics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own analytics"
  ON post_analytics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own analytics"
  ON post_analytics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own analytics"
  ON post_analytics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Revenue records policies
CREATE POLICY "Users can view own revenue"
  ON revenue_records FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own revenue"
  ON revenue_records FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own revenue"
  ON revenue_records FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own revenue"
  ON revenue_records FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Brand partnerships policies
CREATE POLICY "Users can view own partnerships"
  ON brand_partnerships FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own partnerships"
  ON brand_partnerships FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own partnerships"
  ON brand_partnerships FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own partnerships"
  ON brand_partnerships FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add triggers for updated_at
DROP TRIGGER IF EXISTS update_content_posts_updated_at ON content_posts;
CREATE TRIGGER update_content_posts_updated_at
  BEFORE UPDATE ON content_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_revenue_records_updated_at ON revenue_records;
CREATE TRIGGER update_revenue_records_updated_at
  BEFORE UPDATE ON revenue_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_brand_partnerships_updated_at ON brand_partnerships;
CREATE TRIGGER update_brand_partnerships_updated_at
  BEFORE UPDATE ON brand_partnerships
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
