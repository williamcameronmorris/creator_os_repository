/*
  # Add Campaign Detail Fields

  1. Changes to deals table
    - Add key_message field for brief tab
    - Add prohibited_claims field for brief tab
    - Add scope_locked boolean for scope locking functionality
    - Add timeline milestone fields:
      - draft_delivery_date
      - feedback_due_date
      - revision_delivery_date
      - final_approval_date
  
  2. Notes
    - All fields are nullable to support existing deals
    - Fields support the Brief, Scope, and Timeline tabs in the deal detail drawer
*/

-- Add Brief tab fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'key_message'
  ) THEN
    ALTER TABLE deals ADD COLUMN key_message text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'prohibited_claims'
  ) THEN
    ALTER TABLE deals ADD COLUMN prohibited_claims text;
  END IF;
END $$;

-- Add Scope tab fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'scope_locked'
  ) THEN
    ALTER TABLE deals ADD COLUMN scope_locked boolean DEFAULT false;
  END IF;
END $$;

-- Add Timeline tab fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'draft_delivery_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN draft_delivery_date date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'feedback_due_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN feedback_due_date date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'revision_delivery_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN revision_delivery_date date;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'final_approval_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN final_approval_date date;
  END IF;
END $$;
