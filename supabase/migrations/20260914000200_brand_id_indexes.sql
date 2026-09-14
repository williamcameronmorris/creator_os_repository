-- Index every brand_id foreign key that lacked one.
--
-- Every row-level policy filters on brand_id, so each of these tables was
-- scanned end to end on every read. The tables that already had an index
-- (content_posts, content_post_metrics_daily, pfm_account_snapshots,
-- ai_daily_briefs, user_content_profiles, media_kits, platform_metrics,
-- brand_social_accounts) are untouched.
create index if not exists ai_content_suggestions_brand_idx    on public.ai_content_suggestions (brand_id);
create index if not exists brand_prospect_activities_brand_idx on public.brand_prospect_activities (brand_id);
create index if not exists brand_prospects_brand_idx           on public.brand_prospects (brand_id);
create index if not exists challenge_day_completions_brand_idx on public.challenge_day_completions (brand_id);
create index if not exists challenge_metrics_brand_idx         on public.challenge_metrics (brand_id);
create index if not exists challenge_progress_brand_idx        on public.challenge_progress (brand_id);
create index if not exists comments_brand_idx                  on public.comments (brand_id);
create index if not exists content_workflow_stages_brand_idx   on public.content_workflow_stages (brand_id);
create index if not exists deal_activities_brand_idx           on public.deal_activities (brand_id);
create index if not exists deal_contracts_brand_idx            on public.deal_contracts (brand_id);
create index if not exists deal_fit_checks_brand_idx           on public.deal_fit_checks (brand_id);
create index if not exists deal_invoices_brand_idx             on public.deal_invoices (brand_id);
create index if not exists deal_performance_reports_brand_idx  on public.deal_performance_reports (brand_id);
create index if not exists deal_production_checklist_brand_idx on public.deal_production_checklist (brand_id);
create index if not exists deal_renewals_brand_idx             on public.deal_renewals (brand_id);
create index if not exists deal_reports_brand_idx              on public.deal_reports (brand_id);
create index if not exists deal_stages_brand_idx               on public.deal_stages (brand_id);
create index if not exists deal_templates_brand_idx            on public.deal_templates (brand_id);
create index if not exists deals_brand_idx                     on public.deals (brand_id);
create index if not exists media_kit_leads_brand_idx           on public.media_kit_leads (brand_id);
create index if not exists media_kit_rates_brand_idx           on public.media_kit_rates (brand_id);
create index if not exists media_library_brand_idx             on public.media_library (brand_id);
create index if not exists playbook_tasks_brand_idx            on public.playbook_tasks (brand_id);
create index if not exists post_analytics_brand_idx            on public.post_analytics (brand_id);
create index if not exists revenue_records_brand_idx           on public.revenue_records (brand_id);
create index if not exists saved_content_ideas_brand_idx       on public.saved_content_ideas (brand_id);
