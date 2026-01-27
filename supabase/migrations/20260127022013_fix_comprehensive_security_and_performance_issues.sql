/*
  # Comprehensive Security and Performance Fixes

  ## Overview
  This migration addresses critical security and performance issues identified by Supabase:
  
  ## Changes Made
  
  ### 1. Foreign Key Indexes
  Added missing indexes on foreign key columns to improve query performance:
  - brand_partnerships(user_id)
  - content_workflow_stages(published_post_id)
  - deal_contracts(user_id)
  - deal_fit_checks(user_id)
  - deal_invoices(user_id)
  - deal_performance_reports(user_id)
  - deal_production_checklist(user_id)
  - deal_renewals(renewal_deal_id, user_id)
  - media_library(user_id)
  - post_analytics(post_id, user_id)
  - revenue_records(deal_id, user_id)
  
  ### 2. RLS Policy Optimization
  Updated all RLS policies to use `(select auth.uid())` instead of `auth.uid()` directly.
  This prevents re-evaluation of the function for each row, significantly improving query performance.
  Affected tables:
  - post_analytics
  - revenue_records
  - brand_partnerships
  - platform_credentials
  - content_posts
  - media_library
  - social_insights
  - platform_metrics
  - content_workflow_stages
  - ai_workflow_suggestions
  - ai_content_suggestions
  - ai_request_usage
  - saved_content_ideas
  - deal_fit_checks
  - deal_contracts
  - deal_production_checklist
  - deal_performance_reports
  - deal_invoices
  - deal_renewals
  
  ### 3. Function Search Path Fixes
  Updated all functions to use immutable search paths by adding `SET search_path = public, pg_temp`
  
  ## Security Impact
  - Improved query performance at scale
  - Better index utilization for foreign key lookups
  - Hardened function security with explicit search paths
*/

-- =====================================================
-- PART 1: ADD MISSING FOREIGN KEY INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_brand_partnerships_user_id_fk ON public.brand_partnerships(user_id);
CREATE INDEX IF NOT EXISTS idx_content_workflow_stages_published_post_id_fk ON public.content_workflow_stages(published_post_id);
CREATE INDEX IF NOT EXISTS idx_deal_contracts_user_id_fk ON public.deal_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_fit_checks_user_id_fk ON public.deal_fit_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_invoices_user_id_fk ON public.deal_invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_performance_reports_user_id_fk ON public.deal_performance_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_production_checklist_user_id_fk ON public.deal_production_checklist(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_renewals_renewal_deal_id_fk ON public.deal_renewals(renewal_deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_renewals_user_id_fk ON public.deal_renewals(user_id);
CREATE INDEX IF NOT EXISTS idx_media_library_user_id_fk ON public.media_library(user_id);
CREATE INDEX IF NOT EXISTS idx_post_analytics_post_id_fk ON public.post_analytics(post_id);
CREATE INDEX IF NOT EXISTS idx_post_analytics_user_id_fk ON public.post_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_revenue_records_deal_id_fk ON public.revenue_records(deal_id);
CREATE INDEX IF NOT EXISTS idx_revenue_records_user_id_fk ON public.revenue_records(user_id);

-- =====================================================
-- PART 2: OPTIMIZE RLS POLICIES
-- =====================================================

-- post_analytics table policies
DROP POLICY IF EXISTS "Users can view own analytics" ON public.post_analytics;
DROP POLICY IF EXISTS "Users can insert own analytics" ON public.post_analytics;
DROP POLICY IF EXISTS "Users can update own analytics" ON public.post_analytics;
DROP POLICY IF EXISTS "Users can delete own analytics" ON public.post_analytics;

CREATE POLICY "Users can view own analytics" ON public.post_analytics
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own analytics" ON public.post_analytics
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own analytics" ON public.post_analytics
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own analytics" ON public.post_analytics
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- revenue_records table policies
DROP POLICY IF EXISTS "Users can view own revenue" ON public.revenue_records;
DROP POLICY IF EXISTS "Users can insert own revenue" ON public.revenue_records;
DROP POLICY IF EXISTS "Users can update own revenue" ON public.revenue_records;
DROP POLICY IF EXISTS "Users can delete own revenue" ON public.revenue_records;

CREATE POLICY "Users can view own revenue" ON public.revenue_records
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own revenue" ON public.revenue_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own revenue" ON public.revenue_records
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own revenue" ON public.revenue_records
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- brand_partnerships table policies
DROP POLICY IF EXISTS "Users can view own partnerships" ON public.brand_partnerships;
DROP POLICY IF EXISTS "Users can insert own partnerships" ON public.brand_partnerships;
DROP POLICY IF EXISTS "Users can update own partnerships" ON public.brand_partnerships;
DROP POLICY IF EXISTS "Users can delete own partnerships" ON public.brand_partnerships;

CREATE POLICY "Users can view own partnerships" ON public.brand_partnerships
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own partnerships" ON public.brand_partnerships
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own partnerships" ON public.brand_partnerships
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own partnerships" ON public.brand_partnerships
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- platform_credentials table policies
DROP POLICY IF EXISTS "Users can view own credentials" ON public.platform_credentials;
DROP POLICY IF EXISTS "Users can insert own credentials" ON public.platform_credentials;
DROP POLICY IF EXISTS "Users can update own credentials" ON public.platform_credentials;
DROP POLICY IF EXISTS "Users can delete own credentials" ON public.platform_credentials;

CREATE POLICY "Users can view own credentials" ON public.platform_credentials
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own credentials" ON public.platform_credentials
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own credentials" ON public.platform_credentials
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own credentials" ON public.platform_credentials
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- content_posts table policies
DROP POLICY IF EXISTS "Users can view own posts" ON public.content_posts;
DROP POLICY IF EXISTS "Users can insert own posts" ON public.content_posts;
DROP POLICY IF EXISTS "Users can update own posts" ON public.content_posts;
DROP POLICY IF EXISTS "Users can delete own posts" ON public.content_posts;

CREATE POLICY "Users can view own posts" ON public.content_posts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own posts" ON public.content_posts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own posts" ON public.content_posts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own posts" ON public.content_posts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- media_library table policies
DROP POLICY IF EXISTS "Users can view own media" ON public.media_library;
DROP POLICY IF EXISTS "Users can insert own media" ON public.media_library;
DROP POLICY IF EXISTS "Users can update own media" ON public.media_library;
DROP POLICY IF EXISTS "Users can delete own media" ON public.media_library;

CREATE POLICY "Users can view own media" ON public.media_library
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own media" ON public.media_library
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own media" ON public.media_library
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own media" ON public.media_library
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- social_insights table policies
DROP POLICY IF EXISTS "Users can view own insights" ON public.social_insights;
DROP POLICY IF EXISTS "Users can insert own insights" ON public.social_insights;
DROP POLICY IF EXISTS "Users can update own insights" ON public.social_insights;
DROP POLICY IF EXISTS "Users can delete own insights" ON public.social_insights;

CREATE POLICY "Users can view own insights" ON public.social_insights
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own insights" ON public.social_insights
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own insights" ON public.social_insights
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own insights" ON public.social_insights
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- platform_metrics table policies
DROP POLICY IF EXISTS "Users can view own metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can insert own metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can update own metrics" ON public.platform_metrics;
DROP POLICY IF EXISTS "Users can delete own metrics" ON public.platform_metrics;

CREATE POLICY "Users can view own metrics" ON public.platform_metrics
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own metrics" ON public.platform_metrics
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own metrics" ON public.platform_metrics
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own metrics" ON public.platform_metrics
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- content_workflow_stages table policies
DROP POLICY IF EXISTS "Users can view own workflow stages" ON public.content_workflow_stages;
DROP POLICY IF EXISTS "Users can create own workflow stages" ON public.content_workflow_stages;
DROP POLICY IF EXISTS "Users can update own workflow stages" ON public.content_workflow_stages;
DROP POLICY IF EXISTS "Users can delete own workflow stages" ON public.content_workflow_stages;

CREATE POLICY "Users can view own workflow stages" ON public.content_workflow_stages
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create own workflow stages" ON public.content_workflow_stages
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own workflow stages" ON public.content_workflow_stages
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own workflow stages" ON public.content_workflow_stages
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ai_workflow_suggestions table policies
DROP POLICY IF EXISTS "Users can view own workflow suggestions" ON public.ai_workflow_suggestions;
DROP POLICY IF EXISTS "Users can create own workflow suggestions" ON public.ai_workflow_suggestions;
DROP POLICY IF EXISTS "Users can update own workflow suggestions" ON public.ai_workflow_suggestions;
DROP POLICY IF EXISTS "Users can delete own workflow suggestions" ON public.ai_workflow_suggestions;

CREATE POLICY "Users can view own workflow suggestions" ON public.ai_workflow_suggestions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create own workflow suggestions" ON public.ai_workflow_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own workflow suggestions" ON public.ai_workflow_suggestions
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own workflow suggestions" ON public.ai_workflow_suggestions
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ai_content_suggestions table policies
DROP POLICY IF EXISTS "Users can view own content suggestions" ON public.ai_content_suggestions;
DROP POLICY IF EXISTS "Users can create own content suggestions" ON public.ai_content_suggestions;
DROP POLICY IF EXISTS "Users can update own content suggestions" ON public.ai_content_suggestions;
DROP POLICY IF EXISTS "Users can delete own content suggestions" ON public.ai_content_suggestions;

CREATE POLICY "Users can view own content suggestions" ON public.ai_content_suggestions
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create own content suggestions" ON public.ai_content_suggestions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own content suggestions" ON public.ai_content_suggestions
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own content suggestions" ON public.ai_content_suggestions
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- ai_request_usage table policies
DROP POLICY IF EXISTS "Users can view own AI usage" ON public.ai_request_usage;
DROP POLICY IF EXISTS "Users can insert own AI usage" ON public.ai_request_usage;
DROP POLICY IF EXISTS "Users can update own AI usage" ON public.ai_request_usage;

CREATE POLICY "Users can view own AI usage" ON public.ai_request_usage
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own AI usage" ON public.ai_request_usage
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own AI usage" ON public.ai_request_usage
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

-- saved_content_ideas table policies
DROP POLICY IF EXISTS "Users can view own saved ideas" ON public.saved_content_ideas;
DROP POLICY IF EXISTS "Users can create own saved ideas" ON public.saved_content_ideas;
DROP POLICY IF EXISTS "Users can update own saved ideas" ON public.saved_content_ideas;
DROP POLICY IF EXISTS "Users can delete own saved ideas" ON public.saved_content_ideas;

CREATE POLICY "Users can view own saved ideas" ON public.saved_content_ideas
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create own saved ideas" ON public.saved_content_ideas
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own saved ideas" ON public.saved_content_ideas
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own saved ideas" ON public.saved_content_ideas
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- deal_fit_checks table policies
DROP POLICY IF EXISTS "Users can view own fit checks" ON public.deal_fit_checks;
DROP POLICY IF EXISTS "Users can insert own fit checks" ON public.deal_fit_checks;
DROP POLICY IF EXISTS "Users can update own fit checks" ON public.deal_fit_checks;
DROP POLICY IF EXISTS "Users can delete own fit checks" ON public.deal_fit_checks;

CREATE POLICY "Users can view own fit checks" ON public.deal_fit_checks
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own fit checks" ON public.deal_fit_checks
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own fit checks" ON public.deal_fit_checks
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own fit checks" ON public.deal_fit_checks
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- deal_contracts table policies
DROP POLICY IF EXISTS "Users can view own contracts" ON public.deal_contracts;
DROP POLICY IF EXISTS "Users can insert own contracts" ON public.deal_contracts;
DROP POLICY IF EXISTS "Users can update own contracts" ON public.deal_contracts;
DROP POLICY IF EXISTS "Users can delete own contracts" ON public.deal_contracts;

CREATE POLICY "Users can view own contracts" ON public.deal_contracts
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own contracts" ON public.deal_contracts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own contracts" ON public.deal_contracts
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own contracts" ON public.deal_contracts
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- deal_production_checklist table policies
DROP POLICY IF EXISTS "Users can view own production checklists" ON public.deal_production_checklist;
DROP POLICY IF EXISTS "Users can insert own production checklists" ON public.deal_production_checklist;
DROP POLICY IF EXISTS "Users can update own production checklists" ON public.deal_production_checklist;
DROP POLICY IF EXISTS "Users can delete own production checklists" ON public.deal_production_checklist;

CREATE POLICY "Users can view own production checklists" ON public.deal_production_checklist
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own production checklists" ON public.deal_production_checklist
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own production checklists" ON public.deal_production_checklist
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own production checklists" ON public.deal_production_checklist
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- deal_performance_reports table policies
DROP POLICY IF EXISTS "Users can view own performance reports" ON public.deal_performance_reports;
DROP POLICY IF EXISTS "Users can insert own performance reports" ON public.deal_performance_reports;
DROP POLICY IF EXISTS "Users can update own performance reports" ON public.deal_performance_reports;
DROP POLICY IF EXISTS "Users can delete own performance reports" ON public.deal_performance_reports;

CREATE POLICY "Users can view own performance reports" ON public.deal_performance_reports
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own performance reports" ON public.deal_performance_reports
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own performance reports" ON public.deal_performance_reports
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own performance reports" ON public.deal_performance_reports
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- deal_invoices table policies
DROP POLICY IF EXISTS "Users can view own invoices" ON public.deal_invoices;
DROP POLICY IF EXISTS "Users can insert own invoices" ON public.deal_invoices;
DROP POLICY IF EXISTS "Users can update own invoices" ON public.deal_invoices;
DROP POLICY IF EXISTS "Users can delete own invoices" ON public.deal_invoices;

CREATE POLICY "Users can view own invoices" ON public.deal_invoices
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own invoices" ON public.deal_invoices
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own invoices" ON public.deal_invoices
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own invoices" ON public.deal_invoices
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- deal_renewals table policies
DROP POLICY IF EXISTS "Users can view own renewals" ON public.deal_renewals;
DROP POLICY IF EXISTS "Users can insert own renewals" ON public.deal_renewals;
DROP POLICY IF EXISTS "Users can update own renewals" ON public.deal_renewals;
DROP POLICY IF EXISTS "Users can delete own renewals" ON public.deal_renewals;

CREATE POLICY "Users can view own renewals" ON public.deal_renewals
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own renewals" ON public.deal_renewals
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own renewals" ON public.deal_renewals
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own renewals" ON public.deal_renewals
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- =====================================================
-- PART 3: FIX FUNCTION SEARCH PATHS
-- =====================================================

CREATE OR REPLACE FUNCTION public.assign_default_stage_to_deal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.stage_id IS NULL THEN
    SELECT id INTO NEW.stage_id
    FROM deal_stages
    WHERE user_id = NEW.user_id
    ORDER BY position ASC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_reset_ai_quota()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid;
  last_reset timestamptz;
BEGIN
  current_user_id := auth.uid();
  
  SELECT quota_reset_at INTO last_reset
  FROM ai_request_usage
  WHERE user_id = current_user_id;
  
  IF last_reset IS NULL OR last_reset < NOW() - INTERVAL '24 hours' THEN
    INSERT INTO ai_request_usage (user_id, request_count, quota_reset_at)
    VALUES (current_user_id, 0, NOW())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
      request_count = 0,
      quota_reset_at = NOW();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_ai_request()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id uuid;
  current_count integer;
  user_tier text;
  max_requests integer;
BEGIN
  current_user_id := auth.uid();
  
  PERFORM check_and_reset_ai_quota();
  
  SELECT subscription_tier INTO user_tier
  FROM profiles
  WHERE id = current_user_id;
  
  max_requests := CASE 
    WHEN user_tier = 'pro' THEN 500
    WHEN user_tier = 'enterprise' THEN 2000
    ELSE 50
  END;
  
  SELECT request_count INTO current_count
  FROM ai_request_usage
  WHERE user_id = current_user_id;
  
  IF current_count >= max_requests THEN
    RETURN false;
  END IF;
  
  UPDATE ai_request_usage
  SET request_count = request_count + 1
  WHERE user_id = current_user_id;
  
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_deal_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.last_activity_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_creator_default_stages()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.deal_stages (user_id, name, stage_category, position, color) VALUES
    (NEW.id, 'Lead', 'opportunity', 1, '#3b82f6'),
    (NEW.id, 'Outreach', 'opportunity', 2, '#8b5cf6'),
    (NEW.id, 'Pitch Sent', 'opportunity', 3, '#ec4899'),
    (NEW.id, 'Negotiation', 'opportunity', 4, '#f59e0b'),
    (NEW.id, 'Contract Sent', 'delivery', 5, '#10b981'),
    (NEW.id, 'In Progress', 'delivery', 6, '#06b6d4'),
    (NEW.id, 'Content Submitted', 'delivery', 7, '#6366f1'),
    (NEW.id, 'Content Approved', 'delivery', 8, '#14b8a6'),
    (NEW.id, 'Published', 'payment_renewal', 9, '#22c55e'),
    (NEW.id, 'Invoice Sent', 'payment_renewal', 10, '#eab308'),
    (NEW.id, 'Paid', 'payment_renewal', 11, '#10b981'),
    (NEW.id, 'Renewal', 'payment_renewal', 12, '#8b5cf6');
  
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_fit_score(
  p_brand_values jsonb,
  p_audience_match integer,
  p_rate_expectation numeric,
  p_exclusivity_ok boolean
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  score integer := 0;
BEGIN
  score := COALESCE(p_audience_match, 50);
  
  IF p_brand_values IS NOT NULL AND jsonb_array_length(p_brand_values) > 0 THEN
    score := score + 15;
  END IF;
  
  IF p_rate_expectation IS NOT NULL AND p_rate_expectation > 0 THEN
    score := score + 20;
  END IF;
  
  IF p_exclusivity_ok = true THEN
    score := score + 15;
  END IF;
  
  RETURN LEAST(score, 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_rights_summary(p_usage_rights jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  summary text := '';
  rights_array jsonb;
BEGIN
  IF p_usage_rights IS NULL THEN
    RETURN 'No usage rights specified';
  END IF;
  
  rights_array := p_usage_rights;
  
  IF jsonb_array_length(rights_array) = 0 THEN
    RETURN 'No usage rights specified';
  END IF;
  
  summary := 'Rights: ' || (
    SELECT string_agg(value::text, ', ')
    FROM jsonb_array_elements_text(rights_array)
  );
  
  RETURN summary;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_invoice_overdue()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.payment_status = 'pending' AND NEW.due_date < CURRENT_DATE THEN
    NEW.payment_status := 'overdue';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_default_stages_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.deal_stages (user_id, name, position, color) VALUES
    (NEW.id, 'Lead', 1, '#3b82f6'),
    (NEW.id, 'Contacted', 2, '#8b5cf6'),
    (NEW.id, 'Negotiation', 3, '#f59e0b'),
    (NEW.id, 'Contract Sent', 4, '#10b981'),
    (NEW.id, 'Active', 5, '#06b6d4'),
    (NEW.id, 'Completed', 6, '#22c55e'),
    (NEW.id, 'Lost', 7, '#ef4444');
  
  RETURN NEW;
END;
$$;