/*
  # AI Request Quota System

  1. New Tables
    - `ai_request_usage`
      - Tracks daily AI request usage per user
      - Stores request count and reset timestamp
      - Automatically resets daily for free tier users

  2. Security
    - Enable RLS on ai_request_usage table
    - Add policies for authenticated users to view and update their own usage

  3. Important Notes
    - Free tier: 15 requests per day
    - Resets daily at midnight UTC
    - Tracks individual request timestamps for audit trail
*/

-- AI Request Usage Table
CREATE TABLE IF NOT EXISTS ai_request_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  daily_requests_used integer DEFAULT 0 NOT NULL,
  last_reset_at timestamptz DEFAULT now() NOT NULL,
  last_request_at timestamptz,
  total_requests_lifetime integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE ai_request_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own AI usage"
  ON ai_request_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI usage"
  ON ai_request_usage FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI usage"
  ON ai_request_usage FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_ai_request_usage_user_id ON ai_request_usage(user_id);

-- Function to check and reset daily quota if needed
CREATE OR REPLACE FUNCTION check_and_reset_ai_quota(p_user_id uuid)
RETURNS TABLE(requests_used integer, requests_remaining integer, reset_at timestamptz) AS $$
DECLARE
  v_usage_record RECORD;
  v_daily_limit integer := 15;
  v_hours_since_reset numeric;
BEGIN
  -- Get or create usage record
  SELECT * INTO v_usage_record
  FROM ai_request_usage
  WHERE user_id = p_user_id;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO ai_request_usage (user_id, daily_requests_used, last_reset_at)
    VALUES (p_user_id, 0, now())
    RETURNING * INTO v_usage_record;
  END IF;

  -- Check if 24 hours have passed since last reset
  v_hours_since_reset := EXTRACT(EPOCH FROM (now() - v_usage_record.last_reset_at)) / 3600;

  -- Reset if more than 24 hours have passed
  IF v_hours_since_reset >= 24 THEN
    UPDATE ai_request_usage
    SET daily_requests_used = 0,
        last_reset_at = now(),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING * INTO v_usage_record;
  END IF;

  -- Return current usage info
  RETURN QUERY
  SELECT
    v_usage_record.daily_requests_used::integer,
    (v_daily_limit - v_usage_record.daily_requests_used)::integer,
    (v_usage_record.last_reset_at + interval '24 hours')::timestamptz;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment AI request counter
CREATE OR REPLACE FUNCTION increment_ai_request(p_user_id uuid)
RETURNS boolean AS $$
DECLARE
  v_current_usage integer;
  v_daily_limit integer := 15;
BEGIN
  -- First check and reset if needed
  PERFORM check_and_reset_ai_quota(p_user_id);

  -- Get current usage
  SELECT daily_requests_used INTO v_current_usage
  FROM ai_request_usage
  WHERE user_id = p_user_id;

  -- Check if under limit
  IF v_current_usage >= v_daily_limit THEN
    RETURN false;
  END IF;

  -- Increment counter
  UPDATE ai_request_usage
  SET daily_requests_used = daily_requests_used + 1,
      last_request_at = now(),
      total_requests_lifetime = total_requests_lifetime + 1,
      updated_at = now()
  WHERE user_id = p_user_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
