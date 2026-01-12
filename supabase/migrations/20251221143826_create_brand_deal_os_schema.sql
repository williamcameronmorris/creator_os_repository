/*
  # Brand Deal OS Schema

  1. New Tables
    - `profiles`
      - `id` (uuid, primary key, references auth.users)
      - `cpm_tier` (text) - Current CPM tier (conservative/standard/premium/specialized)
      - `cpm_custom` (numeric) - Custom CPM if not using preset
      - `youtube_avg_views` (integer) - Average views from last 16 long-form videos
      - `tiktok_avg_views` (integer) - Average views from last 10 TikTok posts
      - `instagram_avg_views` (integer) - Average views from last 10 Instagram posts
      - `youtube_shorts_avg_views` (integer) - Average views from last 10 YouTube Shorts
      - `revision_rounds_included` (integer) - Default revision rounds included
      - `extra_revision_fee` (numeric) - Fee for additional revision rounds
      - `payment_terms` (text) - Default payment terms
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `deals`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `brand` (text)
      - `contact_name` (text)
      - `contact_email` (text)
      - `product` (text)
      - `category` (text)
      - `source` (text) - Where they found you
      - `objective` (text) - Awareness/Repurposing/Conversion
      - `outcome_wanted` (text)
      - `requested_deliverables` (text)
      - `recommended_package` (text) - Starter/Core/Premium/Platinum/Custom
      - `paid_usage` (boolean)
      - `paid_usage_duration` (integer) - Days
      - `whitelisting` (boolean)
      - `whitelisting_duration` (integer) - Days
      - `exclusivity` (boolean)
      - `exclusivity_category` (text)
      - `exclusivity_months` (integer)
      - `brief_date` (date)
      - `draft_date` (date)
      - `publish_date` (date)
      - `rush_level` (text) - None/Standard/Extreme
      - `budget_shared` (boolean)
      - `budget_range` (text)
      - `red_flags` (text)
      - `quote_low` (numeric)
      - `quote_standard` (numeric)
      - `quote_stretch` (numeric)
      - `final_amount` (numeric)
      - `stage` (text) - Intake/Quoted/Negotiating/Contracted/In Production/Delivered/Closed
      - `payment_status` (text) - Not Started/Deposit Paid/Fully Paid/Overdue
      - `next_followup` (date)
      - `notes` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    
    - `deal_reports`
      - `id` (uuid, primary key)
      - `deal_id` (uuid, references deals)
      - `user_id` (uuid, references profiles)
      - `deliverables_shipped` (text)
      - `results_summary` (text)
      - `best_comments` (text)
      - `what_worked` (text)
      - `what_to_improve` (text)
      - `next_campaign_ideas` (text)
      - `renewal_recommendation` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  cpm_tier text DEFAULT 'conservative' CHECK (cpm_tier IN ('conservative', 'standard', 'premium', 'specialized', 'custom')),
  cpm_custom numeric DEFAULT NULL,
  youtube_avg_views integer DEFAULT 0,
  tiktok_avg_views integer DEFAULT 0,
  instagram_avg_views integer DEFAULT 0,
  youtube_shorts_avg_views integer DEFAULT 0,
  revision_rounds_included integer DEFAULT 1,
  extra_revision_fee numeric DEFAULT 150,
  payment_terms text DEFAULT '50% upfront, 50% on delivery, Net 15',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deals table
CREATE TABLE IF NOT EXISTS deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  brand text DEFAULT '',
  contact_name text DEFAULT '',
  contact_email text DEFAULT '',
  product text DEFAULT '',
  category text DEFAULT '',
  source text DEFAULT '',
  objective text DEFAULT 'Awareness' CHECK (objective IN ('Awareness', 'Repurposing', 'Conversion', '')),
  outcome_wanted text DEFAULT '',
  requested_deliverables text DEFAULT '',
  recommended_package text DEFAULT '' CHECK (recommended_package IN ('Starter', 'Core', 'Premium', 'Platinum', 'Custom', '')),
  paid_usage boolean DEFAULT false,
  paid_usage_duration integer DEFAULT 0,
  whitelisting boolean DEFAULT false,
  whitelisting_duration integer DEFAULT 0,
  exclusivity boolean DEFAULT false,
  exclusivity_category text DEFAULT '',
  exclusivity_months integer DEFAULT 0,
  brief_date date DEFAULT NULL,
  draft_date date DEFAULT NULL,
  publish_date date DEFAULT NULL,
  rush_level text DEFAULT 'None' CHECK (rush_level IN ('None', 'Standard', 'Extreme')),
  budget_shared boolean DEFAULT false,
  budget_range text DEFAULT '',
  red_flags text DEFAULT '',
  quote_low numeric DEFAULT 0,
  quote_standard numeric DEFAULT 0,
  quote_stretch numeric DEFAULT 0,
  final_amount numeric DEFAULT 0,
  stage text DEFAULT 'Intake' CHECK (stage IN ('Intake', 'Quoted', 'Negotiating', 'Contracted', 'In Production', 'Delivered', 'Closed')),
  payment_status text DEFAULT 'Not Started' CHECK (payment_status IN ('Not Started', 'Deposit Paid', 'Fully Paid', 'Overdue')),
  next_followup date DEFAULT NULL,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create deal_reports table
CREATE TABLE IF NOT EXISTS deal_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  deliverables_shipped text DEFAULT '',
  results_summary text DEFAULT '',
  best_comments text DEFAULT '',
  what_worked text DEFAULT '',
  what_to_improve text DEFAULT '',
  next_campaign_ideas text DEFAULT '',
  renewal_recommendation text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_reports ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Deals policies
CREATE POLICY "Users can view own deals"
  ON deals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own deals"
  ON deals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own deals"
  ON deals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own deals"
  ON deals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Deal reports policies
CREATE POLICY "Users can view own reports"
  ON deal_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON deal_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON deal_reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own reports"
  ON deal_reports FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deals_updated_at ON deals;
CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_deal_reports_updated_at ON deal_reports;
CREATE TRIGGER update_deal_reports_updated_at
  BEFORE UPDATE ON deal_reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();