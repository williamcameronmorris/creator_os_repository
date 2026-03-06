/*
  # Refactor Deal Workflow to Match Creator Brand Deal Path
  
  ## Overview
  This migration consolidates the dual-stage system and implements a comprehensive creator-focused brand deal workflow.
  
  ## Problem Being Solved
  - **Dual-Stage System**: Currently using both `deals.stage` (enum) and `deals.stage_id` (custom kanban)
  - **Generic CRM Stages**: Default stages were sales-focused, not creator-focused
  - **Missing Workflow Steps**: No fit check, contract management, production checklist, or renewal tracking
  
  ## Solution
  1. **Consolidate to Single Stage System**: Make `stage_id` the source of truth
  2. **Creator-Focused Stages**: Replace 6 generic stages with 15 creator-specific stages
  3. **Fit Check System**: Add scoring to evaluate deal quality (0-100)
  4. **Contract & Rights Module**: Track contracts, usage rights, and generate plain-English summaries
  5. **Production Checklist**: Deadline-driven production tracking
  6. **Enhanced Reporting**: Surface deal reports in UI with performance tracking
  7. **Payment & Renewal Tracking**: First-class invoice and renewal management
  
  ## New Deal Stages (15 stages organized into Opportunity → Delivery → Renewal)
  
  ### Opportunity Phase
  1. **Lead** - Inbound found you, or you found them
  2. **Fit Check** - Evaluate brand/audience match + red flags
  3. **Outreach / Contacted** - Initial contact made
  4. **Info Exchanged** - Deliverables, timeline, budget range, usage discussed
  5. **Brief Received** - Brand brief or scope document received
  6. **Quote Sent** - Pricing proposal delivered
  7. **Negotiating** - Active negotiation on terms/pricing
  8. **Contract Signed** - Agreement finalized, scope locked
  
  ### Delivery Phase
  9. **In Production** - Creating content (drafts + revisions)
  10. **Approved** - Brand approved final content
  11. **Posted / Live** - Content published on platforms
  12. **Reporting Sent** - Performance report delivered to brand
  
  ### Payment & Renewal Phase
  13. **Invoiced** - Invoice sent to brand
  14. **Paid** - Payment received
  15. **Closed** - Deal complete (with renewal opportunity tracked)
  
  ## New Tables
  
  ### `deal_fit_checks`
  Structured evaluation of deal quality:
  - `deal_id` (uuid) - Links to deals
  - `audience_match` (boolean) - Does audience align with brand?
  - `content_match` (boolean) - Does content fit brand message?
  - `brand_safety` (boolean) - Any reputation risks?
  - `budget_realistic` (boolean) - Budget matches scope?
  - `timeline_realistic` (boolean) - Timeline feasible?
  - `usage_clarity` (boolean) - Usage rights clearly defined?
  - `payment_terms_clear` (boolean) - Payment structure agreed?
  - `has_real_brief` (boolean) - Actual brief vs. "make something cool"?
  - `fit_score` (integer) - Calculated score 0-100
  - `fit_notes` (text) - Additional context
  
  ### `deal_contracts`
  Contract and rights management:
  - `deal_id` (uuid) - Links to deals
  - `contract_status` (text) - draft, sent, signed, executed
  - `contract_file_url` (text) - Link to PDF/DocuSign
  - `contract_version` (text) - Version notes
  - `rights_summary` (text) - Auto-generated plain-English rights summary
  - `organic_only` (boolean) - Organic content only?
  - `paid_usage_allowed` (boolean) - Can brand run as paid ads?
  - `full_digital_rights` (boolean) - Full digital usage rights?
  - `whitelisting_allowed` (boolean) - Can brand run through creator's account?
  - `revision_rounds` (integer) - Number of revisions included
  - `exclusivity_active` (boolean) - Exclusivity clause?
  
  ### `deal_production_checklist`
  Production milestone tracking:
  - `deal_id` (uuid) - Links to deals
  - `draft_delivered_date` (date) - When draft was delivered
  - `draft_file_url` (text) - Link to draft
  - `feedback_received_date` (date) - When brand feedback received
  - `feedback_notes` (text) - Brand feedback details
  - `revisions_delivered_date` (date) - When revisions delivered
  - `final_approved_date` (date) - When brand approved
  - `post_published_date` (date) - When content went live
  - `post_url` (text) - Link to published content
  - `is_overdue` (boolean) - Calculated: any missed deadlines?
  
  ### `deal_performance_reports`
  Enhanced reporting (extends deal_reports):
  - `deal_id` (uuid) - Links to deals
  - `views` (integer) - Total views
  - `likes` (integer) - Total likes  
  - `comments` (integer) - Total comments
  - `shares` (integer) - Total shares
  - `engagement_rate` (numeric) - Engagement rate
  - `best_performing_metric` (text) - What performed best
  - `renewal_opportunity_score` (integer) - 0-100 likelihood of renewal
  - `recommended_next_campaign` (text) - Suggestions for next campaign
  - `report_generated_at` (timestamptz) - When report was created
  - `report_sent_at` (timestamptz) - When sent to brand
  
  ### `deal_invoices`
  Invoice and payment tracking:
  - `deal_id` (uuid) - Links to deals
  - `invoice_number` (text) - Invoice identifier
  - `invoice_amount` (numeric) - Amount billed
  - `invoice_date` (date) - Date invoice sent
  - `due_date` (date) - Payment due date
  - `payment_terms` (text) - Net 15, Net 30, etc.
  - `payment_received_date` (date) - When paid
  - `is_overdue` (boolean) - Calculated: past due date?
  - `invoice_file_url` (text) - Link to invoice PDF
  - `payment_method` (text) - How they paid
  - `notes` (text) - Payment notes
  
  ### `deal_renewals`
  Renewal opportunity tracking:
  - `deal_id` (uuid) - Links to original deal
  - `renewal_likelihood` (text) - high, medium, low
  - `renewal_reminder_date` (date) - When to follow up
  - `renewal_notes` (text) - Notes on renewal opportunity
  - `renewal_deal_id` (uuid) - If renewed, links to new deal
  - `status` (text) - pending, contacted, renewed, declined
  
  ## Schema Changes to Existing Tables
  
  ### `deals` table updates:
  - **Deprecate** `stage` enum (keep for backward compatibility)
  - Make `stage_id` the primary workflow driver
  - Add `fit_check_completed` (boolean)
  - Add `contract_status` (text) - quick reference
  - Add `production_status` (text) - draft, revisions, approved, live
  - Add `renewal_opportunity` (boolean)
  - Add `renewal_reminder_date` (date)
  
  ### `deal_stages` table:
  - Add `stage_category` (text) - opportunity, delivery, payment_renewal
  - Add `auto_actions` (jsonb) - Actions to trigger when entering stage
  - Add `is_milestone` (boolean) - Key milestones like "Contract Signed", "Paid"
  
  ## Security
  - Enable RLS on all new tables
  - Users can only access their own data
  - All tables properly linked to auth.users
  
  ## Migration Strategy
  1. Create new tables
  2. Update existing tables with new fields
  3. Delete old default stages
  4. Create new creator-focused default stages
  5. Migrate existing deals to new stage system (best-effort mapping)
*/

-- ===================================================================
-- 1. CREATE NEW TABLES
-- ===================================================================

-- Deal Fit Checks
CREATE TABLE IF NOT EXISTS deal_fit_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  audience_match boolean DEFAULT false,
  content_match boolean DEFAULT false,
  brand_safety boolean DEFAULT false,
  budget_realistic boolean DEFAULT false,
  timeline_realistic boolean DEFAULT false,
  usage_clarity boolean DEFAULT false,
  payment_terms_clear boolean DEFAULT false,
  has_real_brief boolean DEFAULT false,
  fit_score integer DEFAULT 0 CHECK (fit_score >= 0 AND fit_score <= 100),
  fit_notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(deal_id)
);

-- Deal Contracts
CREATE TABLE IF NOT EXISTS deal_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  contract_status text DEFAULT 'draft' CHECK (contract_status IN ('draft', 'sent', 'signed', 'executed')),
  contract_file_url text DEFAULT '',
  contract_version text DEFAULT 'v1',
  rights_summary text DEFAULT '',
  organic_only boolean DEFAULT true,
  paid_usage_allowed boolean DEFAULT false,
  full_digital_rights boolean DEFAULT false,
  whitelisting_allowed boolean DEFAULT false,
  revision_rounds integer DEFAULT 1,
  exclusivity_active boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(deal_id)
);

-- Deal Production Checklist
CREATE TABLE IF NOT EXISTS deal_production_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  draft_delivered_date date DEFAULT NULL,
  draft_file_url text DEFAULT '',
  feedback_received_date date DEFAULT NULL,
  feedback_notes text DEFAULT '',
  revisions_delivered_date date DEFAULT NULL,
  final_approved_date date DEFAULT NULL,
  post_published_date date DEFAULT NULL,
  post_url text DEFAULT '',
  is_overdue boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(deal_id)
);

-- Deal Performance Reports
CREATE TABLE IF NOT EXISTS deal_performance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  views integer DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  engagement_rate numeric DEFAULT 0,
  best_performing_metric text DEFAULT '',
  renewal_opportunity_score integer DEFAULT 0 CHECK (renewal_opportunity_score >= 0 AND renewal_opportunity_score <= 100),
  recommended_next_campaign text DEFAULT '',
  report_generated_at timestamptz DEFAULT NULL,
  report_sent_at timestamptz DEFAULT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(deal_id)
);

-- Deal Invoices
CREATE TABLE IF NOT EXISTS deal_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  invoice_number text DEFAULT '',
  invoice_amount numeric DEFAULT 0,
  invoice_date date DEFAULT NULL,
  due_date date DEFAULT NULL,
  payment_terms text DEFAULT 'Net 15',
  payment_received_date date DEFAULT NULL,
  is_overdue boolean DEFAULT false,
  invoice_file_url text DEFAULT '',
  payment_method text DEFAULT '',
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Deal Renewals
CREATE TABLE IF NOT EXISTS deal_renewals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  renewal_likelihood text DEFAULT 'medium' CHECK (renewal_likelihood IN ('high', 'medium', 'low')),
  renewal_reminder_date date DEFAULT NULL,
  renewal_notes text DEFAULT '',
  renewal_deal_id uuid REFERENCES deals(id) ON DELETE SET NULL DEFAULT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'renewed', 'declined')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(deal_id)
);

-- ===================================================================
-- 2. UPDATE EXISTING TABLES
-- ===================================================================

-- Add new fields to deals table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'fit_check_completed'
  ) THEN
    ALTER TABLE deals ADD COLUMN fit_check_completed boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'contract_status'
  ) THEN
    ALTER TABLE deals ADD COLUMN contract_status text DEFAULT 'not_started' CHECK (contract_status IN ('not_started', 'draft', 'sent', 'signed', 'executed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'production_status'
  ) THEN
    ALTER TABLE deals ADD COLUMN production_status text DEFAULT 'not_started' CHECK (production_status IN ('not_started', 'draft', 'revisions', 'approved', 'live'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'renewal_opportunity'
  ) THEN
    ALTER TABLE deals ADD COLUMN renewal_opportunity boolean DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deals' AND column_name = 'renewal_reminder_date'
  ) THEN
    ALTER TABLE deals ADD COLUMN renewal_reminder_date date DEFAULT NULL;
  END IF;
END $$;

-- Add new fields to deal_stages table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deal_stages' AND column_name = 'stage_category'
  ) THEN
    ALTER TABLE deal_stages ADD COLUMN stage_category text DEFAULT 'opportunity' CHECK (stage_category IN ('opportunity', 'delivery', 'payment_renewal'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deal_stages' AND column_name = 'auto_actions'
  ) THEN
    ALTER TABLE deal_stages ADD COLUMN auto_actions jsonb DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'deal_stages' AND column_name = 'is_milestone'
  ) THEN
    ALTER TABLE deal_stages ADD COLUMN is_milestone boolean DEFAULT false;
  END IF;
END $$;

-- ===================================================================
-- 3. ENABLE RLS ON NEW TABLES
-- ===================================================================

ALTER TABLE deal_fit_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_production_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_performance_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_renewals ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- 4. CREATE RLS POLICIES
-- ===================================================================

-- deal_fit_checks policies
CREATE POLICY "Users can view own fit checks"
  ON deal_fit_checks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fit checks"
  ON deal_fit_checks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fit checks"
  ON deal_fit_checks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fit checks"
  ON deal_fit_checks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- deal_contracts policies
CREATE POLICY "Users can view own contracts"
  ON deal_contracts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own contracts"
  ON deal_contracts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own contracts"
  ON deal_contracts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own contracts"
  ON deal_contracts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- deal_production_checklist policies
CREATE POLICY "Users can view own production checklists"
  ON deal_production_checklist FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own production checklists"
  ON deal_production_checklist FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own production checklists"
  ON deal_production_checklist FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own production checklists"
  ON deal_production_checklist FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- deal_performance_reports policies
CREATE POLICY "Users can view own performance reports"
  ON deal_performance_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own performance reports"
  ON deal_performance_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own performance reports"
  ON deal_performance_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own performance reports"
  ON deal_performance_reports FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- deal_invoices policies
CREATE POLICY "Users can view own invoices"
  ON deal_invoices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own invoices"
  ON deal_invoices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invoices"
  ON deal_invoices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own invoices"
  ON deal_invoices FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- deal_renewals policies
CREATE POLICY "Users can view own renewals"
  ON deal_renewals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own renewals"
  ON deal_renewals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own renewals"
  ON deal_renewals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own renewals"
  ON deal_renewals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ===================================================================
-- 5. CREATE INDEXES FOR PERFORMANCE
-- ===================================================================

CREATE INDEX IF NOT EXISTS idx_deal_fit_checks_deal_id ON deal_fit_checks(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_contracts_deal_id ON deal_contracts(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_production_checklist_deal_id ON deal_production_checklist(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_performance_reports_deal_id ON deal_performance_reports(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_invoices_deal_id ON deal_invoices(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_renewals_deal_id ON deal_renewals(deal_id);

-- ===================================================================
-- 6. DELETE OLD DEFAULT STAGES AND CREATE NEW ONES
-- ===================================================================

-- Delete old generic CRM stages for all users
DELETE FROM deal_stages WHERE is_default = true;

-- Function to create new creator-focused default stages
CREATE OR REPLACE FUNCTION create_creator_default_stages(user_id_param uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO deal_stages (user_id, name, position, color, stage_category, is_default, is_milestone)
  VALUES
    -- Opportunity Phase (positions 0-7)
    (user_id_param, 'Lead', 0, '#9CA3AF', 'opportunity', true, false),
    (user_id_param, 'Fit Check', 1, '#8B5CF6', 'opportunity', true, true),
    (user_id_param, 'Contacted', 2, '#60A5FA', 'opportunity', true, false),
    (user_id_param, 'Info Exchanged', 3, '#3B82F6', 'opportunity', true, false),
    (user_id_param, 'Brief Received', 4, '#10B981', 'opportunity', true, false),
    (user_id_param, 'Quote Sent', 5, '#FBBF24', 'opportunity', true, false),
    (user_id_param, 'Negotiating', 6, '#F59E0B', 'opportunity', true, false),
    (user_id_param, 'Contract Signed', 7, '#34D399', 'opportunity', true, true),
    
    -- Delivery Phase (positions 8-11)
    (user_id_param, 'In Production', 8, '#A78BFA', 'delivery', true, false),
    (user_id_param, 'Approved', 9, '#10B981', 'delivery', true, true),
    (user_id_param, 'Posted / Live', 10, '#059669', 'delivery', true, true),
    (user_id_param, 'Reporting Sent', 11, '#06B6D4', 'delivery', true, false),
    
    -- Payment & Renewal Phase (positions 12-14)
    (user_id_param, 'Invoiced', 12, '#F59E0B', 'payment_renewal', true, false),
    (user_id_param, 'Paid', 13, '#22C55E', 'payment_renewal', true, true),
    (user_id_param, 'Closed', 14, '#6B7280', 'payment_renewal', true, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create new stages for all existing users
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN SELECT id FROM auth.users LOOP
    PERFORM create_creator_default_stages(user_record.id);
  END LOOP;
END $$;

-- ===================================================================
-- 7. MIGRATE EXISTING DEALS TO NEW STAGE SYSTEM
-- ===================================================================

-- Map old stages to new stages (best effort)
DO $$
DECLARE
  deal_record RECORD;
  new_stage_id uuid;
BEGIN
  FOR deal_record IN 
    SELECT id, user_id, stage, stage_id 
    FROM deals 
    WHERE stage_id IS NULL 
  LOOP
    -- Map old stage enum to new stage_id
    CASE deal_record.stage
      WHEN 'Intake' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Lead' LIMIT 1;
      WHEN 'Quoted' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Quote Sent' LIMIT 1;
      WHEN 'Negotiating' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Negotiating' LIMIT 1;
      WHEN 'Contracted' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Contract Signed' LIMIT 1;
      WHEN 'In Production' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'In Production' LIMIT 1;
      WHEN 'Delivered' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Posted / Live' LIMIT 1;
      WHEN 'Closed' THEN
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Closed' LIMIT 1;
      ELSE
        SELECT id INTO new_stage_id FROM deal_stages WHERE user_id = deal_record.user_id AND name = 'Lead' LIMIT 1;
    END CASE;
    
    -- Update deal with new stage_id
    IF new_stage_id IS NOT NULL THEN
      UPDATE deals SET stage_id = new_stage_id WHERE id = deal_record.id;
    END IF;
  END LOOP;
END $$;

-- ===================================================================
-- 8. CREATE HELPER FUNCTIONS
-- ===================================================================

-- Function to calculate fit check score
CREATE OR REPLACE FUNCTION calculate_fit_score(fit_check_id uuid)
RETURNS integer AS $$
DECLARE
  score integer := 0;
  check_record RECORD;
BEGIN
  SELECT * INTO check_record FROM deal_fit_checks WHERE id = fit_check_id;
  
  IF check_record.audience_match THEN score := score + 13; END IF;
  IF check_record.content_match THEN score := score + 13; END IF;
  IF check_record.brand_safety THEN score := score + 12; END IF;
  IF check_record.budget_realistic THEN score := score + 13; END IF;
  IF check_record.timeline_realistic THEN score := score + 12; END IF;
  IF check_record.usage_clarity THEN score := score + 13; END IF;
  IF check_record.payment_terms_clear THEN score := score + 12; END IF;
  IF check_record.has_real_brief THEN score := score + 12; END IF;
  
  RETURN score;
END;
$$ LANGUAGE plpgsql;

-- Function to auto-generate rights summary
CREATE OR REPLACE FUNCTION generate_rights_summary(contract_id uuid)
RETURNS text AS $$
DECLARE
  contract_record RECORD;
  summary text := '';
BEGIN
  SELECT * INTO contract_record FROM deal_contracts WHERE id = contract_id;
  
  -- Usage rights
  IF contract_record.organic_only THEN
    summary := summary || 'Organic posts only. ';
  END IF;
  
  IF contract_record.paid_usage_allowed THEN
    summary := summary || 'Brand can use as paid ads. ';
  END IF;
  
  IF contract_record.full_digital_rights THEN
    summary := summary || 'Full digital usage rights granted. ';
  END IF;
  
  -- Whitelisting
  IF contract_record.whitelisting_allowed THEN
    summary := summary || 'Whitelisting allowed through creator account. ';
  ELSE
    summary := summary || 'No whitelisting. ';
  END IF;
  
  -- Exclusivity
  IF contract_record.exclusivity_active THEN
    summary := summary || 'Exclusivity clause active. ';
  ELSE
    summary := summary || 'No exclusivity. ';
  END IF;
  
  -- Revisions
  summary := summary || contract_record.revision_rounds::text || ' revision rounds included.';
  
  RETURN summary;
END;
$$ LANGUAGE plpgsql;

-- Function to check if invoice is overdue
CREATE OR REPLACE FUNCTION check_invoice_overdue()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.due_date IS NOT NULL AND NEW.payment_received_date IS NULL THEN
    NEW.is_overdue := (NEW.due_date < CURRENT_DATE);
  ELSE
    NEW.is_overdue := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-calculate overdue status
DROP TRIGGER IF EXISTS trigger_check_invoice_overdue ON deal_invoices;
CREATE TRIGGER trigger_check_invoice_overdue
  BEFORE INSERT OR UPDATE ON deal_invoices
  FOR EACH ROW
  EXECUTE FUNCTION check_invoice_overdue();

-- ===================================================================
-- 9. CREATE UPDATED_AT TRIGGERS FOR NEW TABLES
-- ===================================================================

DROP TRIGGER IF EXISTS update_deal_fit_checks_updated_at ON deal_fit_checks;
CREATE TRIGGER update_deal_fit_checks_updated_at
  BEFORE UPDATE ON deal_fit_checks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_contracts_updated_at ON deal_contracts;
CREATE TRIGGER update_deal_contracts_updated_at
  BEFORE UPDATE ON deal_contracts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_production_checklist_updated_at ON deal_production_checklist;
CREATE TRIGGER update_deal_production_checklist_updated_at
  BEFORE UPDATE ON deal_production_checklist
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_performance_reports_updated_at ON deal_performance_reports;
CREATE TRIGGER update_deal_performance_reports_updated_at
  BEFORE UPDATE ON deal_performance_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_invoices_updated_at ON deal_invoices;
CREATE TRIGGER update_deal_invoices_updated_at
  BEFORE UPDATE ON deal_invoices
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_renewals_updated_at ON deal_renewals;
CREATE TRIGGER update_deal_renewals_updated_at
  BEFORE UPDATE ON deal_renewals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
