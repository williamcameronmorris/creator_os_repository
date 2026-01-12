/*
  # Add Custom Copy Snippets

  1. New Tables
    - `copy_snippets`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `category` (text) - Section/category name
      - `label` (text) - Snippet title/name
      - `text` (text) - The actual copy content
      - `is_favorite` (boolean) - Mark frequently used snippets
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `copy_snippets` table
    - Add policies for authenticated users to:
      - Read their own snippets
      - Create their own snippets
      - Update their own snippets
      - Delete their own snippets

  3. Notes
    - Users can create custom copy snippets alongside default ones
    - Favorites help users quickly access frequently used copy
    - Categories align with existing Copy Bank sections
*/

CREATE TABLE IF NOT EXISTS copy_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  category text NOT NULL,
  label text NOT NULL,
  text text NOT NULL,
  is_favorite boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE copy_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own copy snippets"
  ON copy_snippets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own copy snippets"
  ON copy_snippets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own copy snippets"
  ON copy_snippets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own copy snippets"
  ON copy_snippets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_copy_snippets_user_id ON copy_snippets(user_id);
CREATE INDEX IF NOT EXISTS idx_copy_snippets_category ON copy_snippets(category);
CREATE INDEX IF NOT EXISTS idx_copy_snippets_is_favorite ON copy_snippets(user_id, is_favorite);
