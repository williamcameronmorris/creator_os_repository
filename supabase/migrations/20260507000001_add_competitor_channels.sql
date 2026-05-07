/*
  # Add Competitor Channel Tracking

  v1: YouTube only. Mirrors `platform_metrics` shape so the existing
  Analytics dashboard can compare a creator's channel against tracked
  competitors using the same daily-snapshot pattern.

  Tables:
    - `competitor_channels` — one row per tracked competitor channel
    - `competitor_metrics` — daily snapshot of subs/views/video count

  Both are user-scoped (RLS) and cascade on profile delete.
*/

CREATE TABLE IF NOT EXISTS competitor_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL CHECK (platform IN ('youtube')),
  handle text NOT NULL,
  channel_id text NOT NULL,
  title text DEFAULT '',
  thumbnail_url text DEFAULT '',
  description text DEFAULT '',
  subscriber_count bigint DEFAULT 0,
  video_count integer DEFAULT 0,
  view_count bigint DEFAULT 0,
  avg_views_per_video numeric DEFAULT 0,
  last_pulled_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, platform, channel_id)
);

CREATE TABLE IF NOT EXISTS competitor_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id uuid REFERENCES competitor_channels(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  subscriber_count bigint DEFAULT 0,
  video_count integer DEFAULT 0,
  view_count bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(competitor_id, date)
);

ALTER TABLE competitor_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own competitors"
  ON competitor_channels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitors"
  ON competitor_channels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitors"
  ON competitor_channels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitors"
  ON competitor_channels FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own competitor metrics"
  ON competitor_metrics FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own competitor metrics"
  ON competitor_metrics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own competitor metrics"
  ON competitor_metrics FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own competitor metrics"
  ON competitor_metrics FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_competitor_channels_updated_at ON competitor_channels;
CREATE TRIGGER update_competitor_channels_updated_at
  BEFORE UPDATE ON competitor_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_competitor_channels_user ON competitor_channels(user_id, platform);
CREATE INDEX IF NOT EXISTS idx_competitor_metrics_user_date ON competitor_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_competitor_metrics_competitor_date ON competitor_metrics(competitor_id, date DESC);
