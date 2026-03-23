/*
  # Add Inspiration Entries

  Synced copy of the Notion Inspiration Library database.
  Used by the AI recommendation engine to cross-reference a user's
  hook framework usage against what's producing Outlier performance.

  Source: Notion database e3c17222-2fdb-42f5-baab-0e0992eb396b
  Sync: Triggered manually or on a weekly cron via sync-inspiration-library edge fn.

  This is a shared (non-user-scoped) reference table — all users read the same data.
  Only the service role can write (sync is always server-side).
*/

CREATE TABLE IF NOT EXISTS inspiration_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Notion page identifier (stable across syncs)
  notion_id        text UNIQUE NOT NULL,

  -- Core content fields
  post_title       text         DEFAULT '',
  platform         text         DEFAULT 'instagram',
  content_format   text         DEFAULT '',   -- Reel | Short | Long-form Video | Carousel | Static Post
  hook_framework   text         DEFAULT '',   -- Proof-First | Curiosity Gap | Pain Point | Challenge |
                                              -- Question + Proof | Bold Claim | Storytelling |
                                              -- Contrarian | How-To | List/Ranking
  hook_text        text         DEFAULT '',   -- Exact words from the first 3 seconds
  performance_tier text         DEFAULT '',   -- Outlier | Strong | Reference | Untested
  topic_tags       text[]       DEFAULT ARRAY[]::text[],
  tactical_notes   text         DEFAULT '',
  creator          text         DEFAULT '',
  source_url       text         DEFAULT '',

  -- Engagement numbers at time of analysis
  likes            integer      DEFAULT 0,
  views            integer      DEFAULT 0,
  comments         integer      DEFAULT 0,
  duration         text         DEFAULT '',

  -- Notion metadata
  status           text         DEFAULT '',   -- New | Analyzed | Needs Review
  date_analyzed    date         DEFAULT NULL,
  notion_url       text         DEFAULT '',

  -- Sync timestamps
  synced_at        timestamptz  DEFAULT now(),
  created_at       timestamptz  DEFAULT now(),
  updated_at       timestamptz  DEFAULT now()
);

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Inspiration entries are read-only reference data. Any authenticated user
-- can read them. Only the service role (edge functions) can write.

ALTER TABLE inspiration_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read inspiration entries"
  ON inspiration_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role has full access to inspiration entries"
  ON inspiration_entries
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── Indexes ────────────────────────────────────────────────────────────────

-- Primary lookup patterns for the recommendation engine
CREATE INDEX IF NOT EXISTS idx_inspiration_hook_framework
  ON inspiration_entries(hook_framework)
  WHERE hook_framework != '';

CREATE INDEX IF NOT EXISTS idx_inspiration_performance_tier
  ON inspiration_entries(performance_tier)
  WHERE performance_tier != '';

-- Compound index for the core query:
-- "Give me Outlier entries that use hook framework X"
CREATE INDEX IF NOT EXISTS idx_inspiration_framework_tier
  ON inspiration_entries(hook_framework, performance_tier);

-- GIN index for topic_tags array queries:
-- "Give me entries tagged with 'Monetization'"
CREATE INDEX IF NOT EXISTS idx_inspiration_topic_tags
  ON inspiration_entries USING GIN(topic_tags);

-- Content format queries
CREATE INDEX IF NOT EXISTS idx_inspiration_content_format
  ON inspiration_entries(content_format)
  WHERE content_format != '';

-- ── Auto-update updated_at ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS update_inspiration_entries_updated_at ON inspiration_entries;
CREATE TRIGGER update_inspiration_entries_updated_at
  BEFORE UPDATE ON inspiration_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
