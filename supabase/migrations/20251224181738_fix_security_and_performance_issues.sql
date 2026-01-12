/*
  # Fix Security and Performance Issues

  1. Performance Improvements
    - Add indexes on all foreign key columns for better query performance
    - Fix RLS policies to use (select auth.uid()) instead of auth.uid()
    - Set immutable search_path for all functions

  2. Security Improvements
    - Optimize RLS policy evaluation to prevent re-evaluation per row
*/

-- ========================================
-- PART 1: Add Missing Indexes on Foreign Keys
-- ========================================

-- Deals table
CREATE INDEX IF NOT EXISTS idx_deals_user_id ON deals(user_id);

-- Deal reports table
CREATE INDEX IF NOT EXISTS idx_deal_reports_deal_id ON deal_reports(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_reports_user_id ON deal_reports(user_id);

-- Deal templates table
CREATE INDEX IF NOT EXISTS idx_deal_templates_user_id ON deal_templates(user_id);

-- Deal activities table
CREATE INDEX IF NOT EXISTS idx_deal_activities_user_id ON deal_activities(user_id);

-- ========================================
-- PART 2: Fix RLS Policies - Profiles Table
-- ========================================

DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

-- ========================================
-- PART 3: Fix RLS Policies - Deals Table
-- ========================================

DROP POLICY IF EXISTS "Users can view own deals" ON deals;
CREATE POLICY "Users can view own deals"
  ON deals FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own deals" ON deals;
CREATE POLICY "Users can insert own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own deals" ON deals;
CREATE POLICY "Users can update own deals"
  ON deals FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own deals" ON deals;
CREATE POLICY "Users can delete own deals"
  ON deals FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ========================================
-- PART 4: Fix RLS Policies - Deal Reports Table
-- ========================================

DROP POLICY IF EXISTS "Users can view own reports" ON deal_reports;
CREATE POLICY "Users can view own reports"
  ON deal_reports FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own reports" ON deal_reports;
CREATE POLICY "Users can insert own reports"
  ON deal_reports FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own reports" ON deal_reports;
CREATE POLICY "Users can update own reports"
  ON deal_reports FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own reports" ON deal_reports;
CREATE POLICY "Users can delete own reports"
  ON deal_reports FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ========================================
-- PART 5: Fix RLS Policies - Deal Templates Table
-- ========================================

DROP POLICY IF EXISTS "Users can view own templates" ON deal_templates;
CREATE POLICY "Users can view own templates"
  ON deal_templates FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own templates" ON deal_templates;
CREATE POLICY "Users can insert own templates"
  ON deal_templates FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own templates" ON deal_templates;
CREATE POLICY "Users can update own templates"
  ON deal_templates FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own templates" ON deal_templates;
CREATE POLICY "Users can delete own templates"
  ON deal_templates FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ========================================
-- PART 6: Fix RLS Policies - Copy Snippets Table
-- ========================================

DROP POLICY IF EXISTS "Users can read own copy snippets" ON copy_snippets;
CREATE POLICY "Users can read own copy snippets"
  ON copy_snippets FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own copy snippets" ON copy_snippets;
CREATE POLICY "Users can create own copy snippets"
  ON copy_snippets FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own copy snippets" ON copy_snippets;
CREATE POLICY "Users can update own copy snippets"
  ON copy_snippets FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own copy snippets" ON copy_snippets;
CREATE POLICY "Users can delete own copy snippets"
  ON copy_snippets FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ========================================
-- PART 7: Fix RLS Policies - Default Snippet Favorites Table
-- ========================================

DROP POLICY IF EXISTS "Users can read own default snippet favorites" ON default_snippet_favorites;
CREATE POLICY "Users can read own default snippet favorites"
  ON default_snippet_favorites FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create own default snippet favorites" ON default_snippet_favorites;
CREATE POLICY "Users can create own default snippet favorites"
  ON default_snippet_favorites FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own default snippet favorites" ON default_snippet_favorites;
CREATE POLICY "Users can delete own default snippet favorites"
  ON default_snippet_favorites FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ========================================
-- PART 8: Fix RLS Policies - Deal Stages Table
-- ========================================

DROP POLICY IF EXISTS "Users can view own stages" ON deal_stages;
CREATE POLICY "Users can view own stages"
  ON deal_stages FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own stages" ON deal_stages;
CREATE POLICY "Users can insert own stages"
  ON deal_stages FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own stages" ON deal_stages;
CREATE POLICY "Users can update own stages"
  ON deal_stages FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own stages" ON deal_stages;
CREATE POLICY "Users can delete own stages"
  ON deal_stages FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- ========================================
-- PART 9: Fix RLS Policies - Deal Activities Table
-- ========================================

DROP POLICY IF EXISTS "Users can view activities for own deals" ON deal_activities;
CREATE POLICY "Users can view activities for own deals"
  ON deal_activities FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert activities for own deals" ON deal_activities;
CREATE POLICY "Users can insert activities for own deals"
  ON deal_activities FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

-- ========================================
-- PART 10: Fix Function Search Paths
-- ========================================

-- Fix calculate_due_completeness function
CREATE OR REPLACE FUNCTION calculate_due_completeness(deal_row deals)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix identify_missing_due_fields function
CREATE OR REPLACE FUNCTION identify_missing_due_fields(deal_row deals)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

-- Fix update_due_completeness function
CREATE OR REPLACE FUNCTION update_due_completeness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.due_completeness_score := calculate_due_completeness(NEW);
  NEW.due_missing_fields := identify_missing_due_fields(NEW);
  RETURN NEW;
END;
$$;

-- Fix update_updated_at_column function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix update_deal_last_activity function (if it exists)
CREATE OR REPLACE FUNCTION update_deal_last_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE deals
  SET last_activity_at = now()
  WHERE id = NEW.deal_id;
  RETURN NEW;
END;
$$;

-- Fix create_default_stages_for_user function (if it exists)
CREATE OR REPLACE FUNCTION create_default_stages_for_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO deal_stages (user_id, name, color, position)
  VALUES
    (NEW.id, 'Prospecting', '#3B82F6', 0),
    (NEW.id, 'Negotiating', '#F59E0B', 1),
    (NEW.id, 'Contracted', '#10B981', 2),
    (NEW.id, 'In Progress', '#8B5CF6', 3),
    (NEW.id, 'Completed', '#06B6D4', 4);
  RETURN NEW;
END;
$$;