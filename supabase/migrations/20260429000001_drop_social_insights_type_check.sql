/*
  Drop the social_insights.insight_type CHECK constraint.

  The original constraint allowed only 6 hard-coded analytic types
  (posting_pattern, content_performance, audience_behavior, content_gap,
  trending_format, engagement_health), but generate-insights writes a
  different set (follower_growth, top_performer, underperformer,
  save_rate, ai_pattern) — every nightly insert was failing the check.

  insight_type is an app-level enum that we keep extending; pinning it in
  the schema ties our hands and produces silent data loss when code and
  schema drift.
*/

ALTER TABLE social_insights
  DROP CONSTRAINT IF EXISTS social_insights_insight_type_check;
