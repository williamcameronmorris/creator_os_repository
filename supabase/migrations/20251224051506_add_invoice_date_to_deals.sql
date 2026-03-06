/*
  # Add Invoice Date Field to Deals Table

  ## Overview
  This migration adds an invoice_date field to track when invoices are sent to brands,
  enabling late payment detection and follow-up reminders.

  ## Changes
  - Add `invoice_date` (date) - Date when invoice was sent to the brand

  ## Purpose
  This field enables the dashboard to flag deals with late payments
  (e.g., Payment Pending status with invoice date > 30 days ago)
*/

-- Add invoice_date column to deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'invoice_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN invoice_date date;
  END IF;
END $$;