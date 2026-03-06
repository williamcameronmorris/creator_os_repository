/*
  # Fix Security and Performance Issues for Brand Prospects

  ## Changes Made
  
  1. **Add Missing Index**
     - Add index on `brand_prospects.converted_to_deal_id` foreign key for better query performance
  
  2. **Optimize RLS Policies**
     - Update all RLS policies on `brand_prospects` table to use `(select auth.uid())` instead of `auth.uid()`
     - Update all RLS policies on `brand_prospect_activities` table to use `(select auth.uid())` instead of `auth.uid()`
     - This prevents re-evaluation of auth functions for each row, improving performance at scale
  
  3. **Function Security - Set Explicit Search Paths**
     - Update all overloaded versions of functions to have explicit search_path
     - Prevents search_path injection attacks
  
  ## Performance Impact
  - Improved query performance for foreign key lookups
  - Better RLS policy evaluation performance at scale
  - Enhanced security through explicit function search paths
*/

-- Add missing index on foreign key
CREATE INDEX IF NOT EXISTS idx_brand_prospects_converted_to_deal_id 
ON brand_prospects(converted_to_deal_id);

-- Drop and recreate RLS policies for brand_prospects with optimized auth calls
DROP POLICY IF EXISTS "Users can view own brand prospects" ON brand_prospects;
DROP POLICY IF EXISTS "Users can create own brand prospects" ON brand_prospects;
DROP POLICY IF EXISTS "Users can update own brand prospects" ON brand_prospects;
DROP POLICY IF EXISTS "Users can delete own brand prospects" ON brand_prospects;

CREATE POLICY "Users can view own brand prospects"
  ON brand_prospects FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create own brand prospects"
  ON brand_prospects FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own brand prospects"
  ON brand_prospects FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own brand prospects"
  ON brand_prospects FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Drop and recreate RLS policies for brand_prospect_activities with optimized auth calls
DROP POLICY IF EXISTS "Users can view activities for own prospects" ON brand_prospect_activities;
DROP POLICY IF EXISTS "Users can create activities for own prospects" ON brand_prospect_activities;
DROP POLICY IF EXISTS "Users can update own activities" ON brand_prospect_activities;
DROP POLICY IF EXISTS "Users can delete own activities" ON brand_prospect_activities;

CREATE POLICY "Users can view activities for own prospects"
  ON brand_prospect_activities FOR SELECT
  TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "Users can create activities for own prospects"
  ON brand_prospect_activities FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own activities"
  ON brand_prospect_activities FOR UPDATE
  TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own activities"
  ON brand_prospect_activities FOR DELETE
  TO authenticated
  USING (user_id = (select auth.uid()));

-- Fix function search paths for security (handling overloaded functions)
-- We need to alter each function signature individually

-- check_and_reset_ai_quota() - no args version (returns void)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'check_and_reset_ai_quota' 
    AND pronargs = 0 
    AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'void')
  ) THEN
    ALTER FUNCTION check_and_reset_ai_quota() SET search_path = public, pg_temp;
  END IF;
END $$;

-- check_and_reset_ai_quota(uuid) version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'check_and_reset_ai_quota' 
    AND pronargs = 1
  ) THEN
    ALTER FUNCTION check_and_reset_ai_quota(uuid) SET search_path = public, pg_temp;
  END IF;
END $$;

-- increment_ai_request() - no args version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'increment_ai_request' 
    AND pronargs = 0
  ) THEN
    ALTER FUNCTION increment_ai_request() SET search_path = public, pg_temp;
  END IF;
END $$;

-- increment_ai_request(uuid) version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'increment_ai_request' 
    AND pronargs = 1
  ) THEN
    ALTER FUNCTION increment_ai_request(uuid) SET search_path = public, pg_temp;
  END IF;
END $$;

-- create_creator_default_stages() - trigger version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_creator_default_stages' 
    AND pronargs = 0
    AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'trigger')
  ) THEN
    ALTER FUNCTION create_creator_default_stages() SET search_path = public, pg_temp;
  END IF;
END $$;

-- create_creator_default_stages(uuid) - void version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_creator_default_stages' 
    AND pronargs = 1
    AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'void')
  ) THEN
    ALTER FUNCTION create_creator_default_stages(uuid) SET search_path = public, pg_temp;
  END IF;
END $$;

-- calculate_fit_score(uuid) version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'calculate_fit_score' 
    AND pronargs = 1
    AND proargtypes[0] = (SELECT oid FROM pg_type WHERE typname = 'uuid')
  ) THEN
    ALTER FUNCTION calculate_fit_score(uuid) SET search_path = public, pg_temp;
  END IF;
END $$;

-- calculate_fit_score(jsonb, integer, numeric, boolean) version - already has search_path set
-- No need to alter this one as it already shows: SET search_path TO 'public', 'pg_temp'

-- generate_rights_summary(uuid) version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'generate_rights_summary' 
    AND pronargs = 1
    AND proargtypes[0] = (SELECT oid FROM pg_type WHERE typname = 'uuid')
  ) THEN
    ALTER FUNCTION generate_rights_summary(uuid) SET search_path = public, pg_temp;
  END IF;
END $$;

-- generate_rights_summary(jsonb) version - already has search_path set
-- No need to alter this one as it already shows: SET search_path TO 'public', 'pg_temp'

-- create_default_stages_for_user() - trigger version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_default_stages_for_user' 
    AND pronargs = 0
    AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'trigger')
  ) THEN
    ALTER FUNCTION create_default_stages_for_user() SET search_path = public, pg_temp;
  END IF;
END $$;

-- create_default_stages_for_user(uuid) - void version
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'create_default_stages_for_user' 
    AND pronargs = 1
    AND prorettype = (SELECT oid FROM pg_type WHERE typname = 'void')
  ) THEN
    ALTER FUNCTION create_default_stages_for_user(uuid) SET search_path = public, pg_temp;
  END IF;
END $$;
