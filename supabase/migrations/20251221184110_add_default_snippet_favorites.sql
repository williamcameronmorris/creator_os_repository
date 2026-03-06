/*
  # Add Default Snippet Favorites
  
  1. New Tables
    - `default_snippet_favorites`
      - `id` (uuid, primary key)
      - `user_id` (uuid, foreign key to auth.users)
      - `snippet_key` (text) - Unique identifier for default snippet (category-label)
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on `default_snippet_favorites` table
    - Add policies for authenticated users to:
      - Read their own favorites
      - Create their own favorites
      - Delete their own favorites
  
  3. Notes
    - Allows users to favorite built-in default copy snippets
    - snippet_key format: "{category}-{label}" (e.g., "Budget Ask-Soft")
    - Combined with copy_snippets table for complete favorites functionality
*/

CREATE TABLE IF NOT EXISTS default_snippet_favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  snippet_key text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(user_id, snippet_key)
);

ALTER TABLE default_snippet_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own default snippet favorites"
  ON default_snippet_favorites
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own default snippet favorites"
  ON default_snippet_favorites
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own default snippet favorites"
  ON default_snippet_favorites
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_default_snippet_favorites_user_id ON default_snippet_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_default_snippet_favorites_snippet_key ON default_snippet_favorites(user_id, snippet_key);