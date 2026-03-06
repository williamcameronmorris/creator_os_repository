/*
  # Add Daily Pulse Sessions Table

  1. New Tables
    - `daily_pulse_sessions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `session_date` (date) - The date of the daily pulse session
      - `dismissed_all` (boolean) - Whether user clicked "Skip All"
      - `cards_reviewed` (jsonb) - Array of card IDs that were marked as done
      - `last_category_viewed` (text) - Last category the user was viewing
      - `completed_at` (timestamptz) - When the user completed all cards
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `daily_pulse_sessions` table
    - Add policy for authenticated users to manage their own sessions

  3. Indexes
    - Index on (user_id, session_date) for quick lookups
*/

-- Create daily_pulse_sessions table
CREATE TABLE IF NOT EXISTS daily_pulse_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_date date NOT NULL DEFAULT CURRENT_DATE,
  dismissed_all boolean NOT NULL DEFAULT false,
  cards_reviewed jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_category_viewed text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, session_date)
);

-- Enable RLS
ALTER TABLE daily_pulse_sessions ENABLE ROW LEVEL SECURITY;

-- Policy for users to view their own sessions
CREATE POLICY "Users can view own daily pulse sessions"
  ON daily_pulse_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Policy for users to insert their own sessions
CREATE POLICY "Users can insert own daily pulse sessions"
  ON daily_pulse_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy for users to update their own sessions
CREATE POLICY "Users can update own daily pulse sessions"
  ON daily_pulse_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy for users to delete their own sessions
CREATE POLICY "Users can delete own daily pulse sessions"
  ON daily_pulse_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_daily_pulse_sessions_user_date 
  ON daily_pulse_sessions(user_id, session_date);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_daily_pulse_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_daily_pulse_sessions_updated_at ON daily_pulse_sessions;
CREATE TRIGGER trigger_daily_pulse_sessions_updated_at
  BEFORE UPDATE ON daily_pulse_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_daily_pulse_sessions_updated_at();
