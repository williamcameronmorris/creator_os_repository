/*
  # AI Content Workflow System

  1. New Tables
    - `ai_content_suggestions`
      - Stores AI-generated content ideas based on performance analysis
      - Includes suggested format, improvements, and reasoning
      - Tracks which platform and content type
      - Links to original post that inspired the suggestion
    
    - `content_workflow_stages`
      - Tracks content through the creation workflow
      - Stages: idea → script → create → schedule → published → engage → analyze
      - Stores current stage, completion status, and AI suggestions for each stage
      - Links to content_posts for the final published content
    
    - `ai_workflow_suggestions`
      - Stores AI suggestions for next steps at each workflow stage
      - Provides context-aware recommendations
      - Tracks if suggestion was acted upon
  
  2. Security
    - Enable RLS on all new tables
    - Add policies for authenticated users to manage their own content workflow
  
  3. Important Notes
    - Integrates with existing content_posts and platform_metrics tables
    - Supports multi-stage content creation process
    - AI suggestions are generated based on real performance data
*/

-- AI Content Suggestions Table
CREATE TABLE IF NOT EXISTS ai_content_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  content_type text NOT NULL,
  suggested_format text NOT NULL,
  suggested_topic text NOT NULL,
  reasoning text NOT NULL,
  expected_performance text,
  inspired_by_post_id uuid,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  acted_on_at timestamptz,
  created_workflow_id uuid
);

-- Content Workflow Stages Table
CREATE TABLE IF NOT EXISTS content_workflow_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  content_type text NOT NULL,
  
  current_stage text DEFAULT 'idea' NOT NULL,
  
  idea_content text,
  idea_completed_at timestamptz,
  
  script_content text,
  script_completed_at timestamptz,
  
  creation_notes text,
  creation_completed_at timestamptz,
  
  schedule_date timestamptz,
  schedule_completed_at timestamptz,
  
  published_post_id uuid REFERENCES content_posts(id) ON DELETE SET NULL,
  published_at timestamptz,
  
  engagement_notes text,
  engagement_completed_at timestamptz,
  
  analysis_notes text,
  analysis_completed_at timestamptz,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- AI Workflow Suggestions Table
CREATE TABLE IF NOT EXISTS ai_workflow_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workflow_id uuid REFERENCES content_workflow_stages(id) ON DELETE CASCADE NOT NULL,
  stage text NOT NULL,
  suggestion_type text NOT NULL,
  suggestion_text text NOT NULL,
  action_button_text text,
  action_url text,
  priority text DEFAULT 'medium',
  created_at timestamptz DEFAULT now(),
  dismissed_at timestamptz,
  acted_on_at timestamptz
);

-- Enable RLS
ALTER TABLE ai_content_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_workflow_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_content_suggestions
CREATE POLICY "Users can view own content suggestions"
  ON ai_content_suggestions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own content suggestions"
  ON ai_content_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own content suggestions"
  ON ai_content_suggestions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own content suggestions"
  ON ai_content_suggestions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for content_workflow_stages
CREATE POLICY "Users can view own workflow stages"
  ON content_workflow_stages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own workflow stages"
  ON content_workflow_stages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflow stages"
  ON content_workflow_stages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflow stages"
  ON content_workflow_stages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS Policies for ai_workflow_suggestions
CREATE POLICY "Users can view own workflow suggestions"
  ON ai_workflow_suggestions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own workflow suggestions"
  ON ai_workflow_suggestions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workflow suggestions"
  ON ai_workflow_suggestions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workflow suggestions"
  ON ai_workflow_suggestions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ai_content_suggestions_user_id ON ai_content_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_content_suggestions_status ON ai_content_suggestions(status);
CREATE INDEX IF NOT EXISTS idx_content_workflow_stages_user_id ON content_workflow_stages(user_id);
CREATE INDEX IF NOT EXISTS idx_content_workflow_stages_current_stage ON content_workflow_stages(current_stage);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_suggestions_workflow_id ON ai_workflow_suggestions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_ai_workflow_suggestions_user_id ON ai_workflow_suggestions(user_id);
