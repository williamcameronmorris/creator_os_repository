-- Brightbean packaging score for discovered videos: a niche-relative CTR
-- percentile (0-100) for the title+thumbnail, used as the "why it's working"
-- signal in the Watch feed instead of a crude views/average ratio.
alter table public.suggested_creator_videos
  add column if not exists packaging_percentile int,
  add column if not exists packaging_score numeric;
