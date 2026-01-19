/*
  # Fix Pipeline Field Mappings

  ## Overview
  This migration adds missing fields to the deals table to properly support
  the KanbanBoard pipeline view and ensure deals show up correctly in pipeline cards.

  ## Changes to `deals` table
  1. Add `brand_name` column - Maps to brand field for clarity
  2. Add `deliverable_type` column - Stores the type of deliverable
  3. Add `rate` column - Stores the deal value for calculations
  
  ## Data Migration
  - Copy existing `brand` data to `brand_name`
  - Copy existing `requested_deliverables` to `deliverable_type`
  - Set `rate` to `final_amount` if set, otherwise use `quote_standard`
  - For deals without stage_id, set to the first available stage (Lead)

  ## Security
  - No RLS changes needed (inherits from existing deals table policies)
*/

-- Add missing columns to deals table
DO $$
BEGIN
  -- Add brand_name column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'brand_name'
  ) THEN
    ALTER TABLE deals ADD COLUMN brand_name text DEFAULT '';
  END IF;

  -- Add deliverable_type column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'deliverable_type'
  ) THEN
    ALTER TABLE deals ADD COLUMN deliverable_type text DEFAULT '';
  END IF;

  -- Add rate column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'rate'
  ) THEN
    ALTER TABLE deals ADD COLUMN rate numeric DEFAULT 0;
  END IF;
END $$;

-- Migrate existing data
UPDATE deals
SET 
  brand_name = COALESCE(brand, ''),
  deliverable_type = COALESCE(requested_deliverables, ''),
  rate = CASE
    WHEN final_amount > 0 THEN final_amount
    WHEN quote_standard > 0 THEN quote_standard
    ELSE 0
  END
WHERE brand_name = '' OR deliverable_type = '' OR rate = 0;

-- Create function to auto-assign stage_id to deals without one
CREATE OR REPLACE FUNCTION assign_default_stage_to_deal()
RETURNS TRIGGER AS $$
DECLARE
  default_stage_id uuid;
BEGIN
  -- If stage_id is not set, assign the first stage for this user
  IF NEW.stage_id IS NULL THEN
    SELECT id INTO default_stage_id
    FROM deal_stages
    WHERE user_id = NEW.user_id
    ORDER BY position
    LIMIT 1;
    
    NEW.stage_id := default_stage_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-assign stage_id
DROP TRIGGER IF EXISTS trigger_assign_default_stage ON deals;
CREATE TRIGGER trigger_assign_default_stage
  BEFORE INSERT ON deals
  FOR EACH ROW
  EXECUTE FUNCTION assign_default_stage_to_deal();

-- Update existing deals without stage_id
UPDATE deals d
SET stage_id = (
  SELECT id FROM deal_stages ds
  WHERE ds.user_id = d.user_id
  ORDER BY ds.position
  LIMIT 1
)
WHERE stage_id IS NULL;

-- Create trigger to keep brand_name, deliverable_type, and rate in sync
CREATE OR REPLACE FUNCTION sync_deal_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Sync brand_name from brand
  IF NEW.brand IS DISTINCT FROM OLD.brand THEN
    NEW.brand_name := NEW.brand;
  END IF;
  
  -- Sync deliverable_type from requested_deliverables
  IF NEW.requested_deliverables IS DISTINCT FROM OLD.requested_deliverables THEN
    NEW.deliverable_type := NEW.requested_deliverables;
  END IF;
  
  -- Sync rate from final_amount or quote_standard
  IF NEW.final_amount IS DISTINCT FROM OLD.final_amount OR 
     NEW.quote_standard IS DISTINCT FROM OLD.quote_standard THEN
    NEW.rate := CASE
      WHEN NEW.final_amount > 0 THEN NEW.final_amount
      WHEN NEW.quote_standard > 0 THEN NEW.quote_standard
      ELSE NEW.rate
    END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to sync fields on update
DROP TRIGGER IF EXISTS trigger_sync_deal_fields ON deals;
CREATE TRIGGER trigger_sync_deal_fields
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION sync_deal_fields();

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_deals_brand_name ON deals(brand_name);
CREATE INDEX IF NOT EXISTS idx_deals_rate ON deals(rate);
