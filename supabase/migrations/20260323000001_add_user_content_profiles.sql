/*
  # Add User Content Profiles

  Stores AI-analyzed content patterns for each user, derived from their
  top-performing posts. Used by the proactive AI recommendation engine to
  surface personalized content suggestions.

  Table: user_content_profiles
  - One row per user (upserted on each analysis run)
  - Updated automatically after every instagram/tiktok/youtube sync
  - Read by generate-ideas and the future proactive home screen
*/

CREATE TABLE IF NOT EXISTS user_content_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,

  -- Hook patterns identified across top-performing posts
  hook_frameworks  text[]    DEFAULT ARRAY[]::text[],

  -- Topic clusters the creator focuses on (e.g. "guitar gear", "music production")
  dominant_topics  text[]    DEFAULT ARRAY[]::text[],

  -- Free-form style notes: caption length tendency, emoji use, hashtag style, etc.
  caption_style    text      DEFAULT '',

  -- Average caption length (chars) across analyzed posts
  avg_caption_length integer DEFAULT 0,

  -- Specific patterns tied to their highest-engagement posts
  -- Array of { pattern: string, example_caption: string, avg_engagement: number }
  top_patterns     jsonb     DEFAULT '[]'::jsonb,

  -- Full structured analysis returned by Claude (for debugging / future use)
  raw_analysis     jsonb     DEFAULT '{}'::jsonb,

  -- How many posts were fed into this analysis
  posts_analyzed   integer   DEFAULT 0,

  -- Timestamp of last analysis run
  analyzed_at      timestamptz DEFAULT now(),

  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

-- RLS: users can only read their own profile
ALTER TABLE user_content_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own content profile"
  ON user_content_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own content profile"
  ON user_content_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content profile"
  ON user_content_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role needs full access for edge functions
CREATE POLICY "Service role has full access to content profiles"
  ON user_content_profiles
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS idx_user_content_profiles_user_id
  ON user_content_profiles(user_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS update_user_content_profiles_updated_at ON user_content_profiles;
CREATE TRIGGER update_user_content_profiles_updated_at
  BEFORE UPDATE ON user_content_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
