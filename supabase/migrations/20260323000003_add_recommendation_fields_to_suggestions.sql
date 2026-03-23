/*
  # Add Recommendation Engine Fields to ai_content_suggestions

  Extends ai_content_suggestions to support the new proactive recommendation
  engine (generate-recommendations edge function).

  New columns:
  - source        — "recommendation_engine" | "generate-ideas" | manual etc.
  - hook_framework — The specific hook framework used (e.g. "Proof-First")
  - hook_text      — The specific opening line / hook copy
  - metadata       — Flexible jsonb for extra context (inspiration_source etc.)
*/

DO $$ BEGIN

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_content_suggestions' AND column_name = 'source') THEN
    ALTER TABLE ai_content_suggestions ADD COLUMN source text DEFAULT 'generate-ideas';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_content_suggestions' AND column_name = 'hook_framework') THEN
    ALTER TABLE ai_content_suggestions ADD COLUMN hook_framework text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_content_suggestions' AND column_name = 'hook_text') THEN
    ALTER TABLE ai_content_suggestions ADD COLUMN hook_text text DEFAULT '';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_content_suggestions' AND column_name = 'metadata') THEN
    ALTER TABLE ai_content_suggestions ADD COLUMN metadata jsonb DEFAULT '{}'::jsonb;
  END IF;

END $$;

-- Index for filtering by source (recommendation engine vs legacy ideas)
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_source
  ON ai_content_suggestions(user_id, source)
  WHERE source IS NOT NULL;
