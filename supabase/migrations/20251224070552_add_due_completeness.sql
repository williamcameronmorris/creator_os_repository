/*
  # Add DUE Completeness Tracking

  1. Changes
    - Add specific deliverables tracking fields
    - Add usage specifics (organic vs paid, platforms)
    - Add exclusivity details (competitor list, exact dates)
    - Add completeness score calculation

  2. Purpose
    - Prevent creators from agreeing to deals without understanding what they're selling
    - Flag incomplete deals that need clarification before work begins
*/

-- Add detailed deliverables tracking
ALTER TABLE deals ADD COLUMN IF NOT EXISTS deliverables_list jsonb DEFAULT '[]';
-- Example: [{"type": "YouTube Video", "length": "8-10 min", "quantity": 1}, {"type": "Instagram Reel", "quantity": 3}]

-- Add detailed usage rights
ALTER TABLE deals ADD COLUMN IF NOT EXISTS usage_platforms text[] DEFAULT '{}';
-- Example: ['YouTube Organic', 'Instagram Paid Ads', 'TikTok Organic']

ALTER TABLE deals ADD COLUMN IF NOT EXISTS usage_start_date date DEFAULT NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS usage_end_date date DEFAULT NULL;

-- Add detailed exclusivity
ALTER TABLE deals ADD COLUMN IF NOT EXISTS exclusivity_competitors text[] DEFAULT '{}';
-- Example: ['Nike', 'Adidas', 'Under Armour']

ALTER TABLE deals ADD COLUMN IF NOT EXISTS exclusivity_start_date date DEFAULT NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS exclusivity_end_date date DEFAULT NULL;

-- Add completeness tracking
ALTER TABLE deals ADD COLUMN IF NOT EXISTS due_completeness_score integer DEFAULT 0;
-- Score out of 100 based on how complete the D-U-E fields are

ALTER TABLE deals ADD COLUMN IF NOT EXISTS due_missing_fields text[] DEFAULT '{}';
-- Array of missing required fields

-- Add scope lock status
ALTER TABLE deals ADD COLUMN IF NOT EXISTS scope_locked boolean DEFAULT false;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS scope_locked_date timestamptz DEFAULT NULL;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS scope_recap_sent boolean DEFAULT false;

-- Create function to calculate DUE completeness
CREATE OR REPLACE FUNCTION calculate_due_completeness(deal_row deals)
RETURNS integer AS $$
DECLARE
  score integer := 0;
BEGIN
  -- Deliverables (40 points possible)
  IF deal_row.deliverables_list IS NOT NULL AND jsonb_array_length(deal_row.deliverables_list) > 0 THEN
    score := score + 40;
  END IF;

  -- Usage (30 points possible)
  IF deal_row.usage_platforms IS NOT NULL AND array_length(deal_row.usage_platforms, 1) > 0 THEN
    score := score + 15;
  END IF;

  IF deal_row.usage_start_date IS NOT NULL AND deal_row.usage_end_date IS NOT NULL THEN
    score := score + 15;
  END IF;

  -- Exclusivity (30 points possible)
  IF deal_row.exclusivity = false THEN
    -- No exclusivity = complete for this section
    score := score + 30;
  ELSIF deal_row.exclusivity = true THEN
    IF deal_row.exclusivity_category IS NOT NULL AND deal_row.exclusivity_category != '' THEN
      score := score + 10;
    END IF;

    IF deal_row.exclusivity_competitors IS NOT NULL AND array_length(deal_row.exclusivity_competitors, 1) > 0 THEN
      score := score + 10;
    END IF;

    IF deal_row.exclusivity_start_date IS NOT NULL AND deal_row.exclusivity_end_date IS NOT NULL THEN
      score := score + 10;
    END IF;
  END IF;

  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Create function to identify missing fields
CREATE OR REPLACE FUNCTION identify_missing_due_fields(deal_row deals)
RETURNS text[] AS $$
DECLARE
  missing text[] := '{}';
BEGIN
  -- Check Deliverables
  IF deal_row.deliverables_list IS NULL OR jsonb_array_length(deal_row.deliverables_list) = 0 THEN
    missing := array_append(missing, 'Specific deliverables with specs');
  END IF;

  -- Check Usage
  IF deal_row.usage_platforms IS NULL OR array_length(deal_row.usage_platforms, 1) = 0 THEN
    missing := array_append(missing, 'Usage platforms (organic vs paid)');
  END IF;

  IF deal_row.usage_start_date IS NULL OR deal_row.usage_end_date IS NULL THEN
    missing := array_append(missing, 'Usage duration (start and end dates)');
  END IF;

  -- Check Exclusivity
  IF deal_row.exclusivity = true THEN
    IF deal_row.exclusivity_category IS NULL OR deal_row.exclusivity_category = '' THEN
      missing := array_append(missing, 'Exclusivity category');
    END IF;

    IF deal_row.exclusivity_competitors IS NULL OR array_length(deal_row.exclusivity_competitors, 1) = 0 THEN
      missing := array_append(missing, 'Specific competitor list for exclusivity');
    END IF;

    IF deal_row.exclusivity_start_date IS NULL OR deal_row.exclusivity_end_date IS NULL THEN
      missing := array_append(missing, 'Exclusivity window (exact dates)');
    END IF;
  END IF;

  RETURN missing;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-calculate completeness on insert/update
CREATE OR REPLACE FUNCTION update_due_completeness()
RETURNS TRIGGER AS $$
BEGIN
  NEW.due_completeness_score := calculate_due_completeness(NEW);
  NEW.due_missing_fields := identify_missing_due_fields(NEW);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_due_completeness ON deals;
CREATE TRIGGER trigger_update_due_completeness
  BEFORE INSERT OR UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_due_completeness();

-- Update existing deals to calculate their scores
UPDATE deals SET updated_at = updated_at;