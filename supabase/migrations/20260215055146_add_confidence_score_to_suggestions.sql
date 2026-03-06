/*
  # Add confidence_score to AI content suggestions

  ## Overview
  Adds confidence_score column to track the AI's confidence level in its suggestions.

  ## Changes
  - Add `confidence_score` column to `ai_content_suggestions` table
  - Column is optional with default value of 75
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_content_suggestions' AND column_name = 'confidence_score'
  ) THEN
    ALTER TABLE ai_content_suggestions ADD COLUMN confidence_score integer DEFAULT 75 CHECK (confidence_score >= 0 AND confidence_score <= 100);
  END IF;
END $$;