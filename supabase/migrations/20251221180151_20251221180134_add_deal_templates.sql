/*
  # Add Deal Templates

  1. New Tables
    - `deal_templates`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `name` (text) - Template name (e.g., "Express Package", "Premium Brand Deal")
      - `description` (text) - Optional description
      - `objective` (text) - Awareness/Repurposing/Conversion
      - `recommended_package` (text) - Starter/Core/Premium/Platinum/Custom
      - `paid_usage` (boolean)
      - `paid_usage_duration` (integer)
      - `whitelisting` (boolean)
      - `whitelisting_duration` (integer)
      - `exclusivity` (boolean)
      - `exclusivity_category` (text)
      - `exclusivity_months` (integer)
      - `rush_level` (text)
      - `short_form_youtube` (integer) - Default number of YT shorts
      - `short_form_tiktok` (integer) - Default number of TikToks
      - `short_form_instagram` (integer) - Default number of IG reels
      - `long_form_posts` (integer) - Default number of long-form posts
      - `long_form_factor` (text) - mention/adSpot/dedicated
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `deal_templates` table
    - Add policies for authenticated users to manage their own templates
*/

-- Create deal_templates table
CREATE TABLE IF NOT EXISTS deal_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text DEFAULT '',
  objective text DEFAULT 'Awareness' CHECK (objective IN ('Awareness', 'Repurposing', 'Conversion', '')),
  recommended_package text DEFAULT '' CHECK (recommended_package IN ('Starter', 'Core', 'Premium', 'Platinum', 'Custom', '')),
  paid_usage boolean DEFAULT false,
  paid_usage_duration integer DEFAULT 0,
  whitelisting boolean DEFAULT false,
  whitelisting_duration integer DEFAULT 0,
  exclusivity boolean DEFAULT false,
  exclusivity_category text DEFAULT '',
  exclusivity_months integer DEFAULT 0,
  rush_level text DEFAULT 'None' CHECK (rush_level IN ('None', 'Standard', 'Extreme')),
  short_form_youtube integer DEFAULT 0,
  short_form_tiktok integer DEFAULT 0,
  short_form_instagram integer DEFAULT 0,
  long_form_posts integer DEFAULT 0,
  long_form_factor text DEFAULT 'mention' CHECK (long_form_factor IN ('mention', 'adSpot', 'dedicated')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE deal_templates ENABLE ROW LEVEL SECURITY;

-- Deal templates policies
CREATE POLICY "Users can view own templates"
  ON deal_templates FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own templates"
  ON deal_templates FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own templates"
  ON deal_templates FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own templates"
  ON deal_templates FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Add trigger for updated_at
DROP TRIGGER IF EXISTS update_deal_templates_updated_at ON deal_templates;
CREATE TRIGGER update_deal_templates_updated_at
  BEFORE UPDATE ON deal_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
