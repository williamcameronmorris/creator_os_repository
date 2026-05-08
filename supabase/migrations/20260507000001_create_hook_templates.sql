-- 20260507000001_create_hook_templates.sql
-- hook_templates: parameterized hook formulas (with [insert X] placeholders) sourced
-- from a curated 1000 Viral Hooks collection. Used by Clio as a fallback formula bank
-- when no relevant Outlier exists in the curated inspiration_entries library.
--
-- Kept SEPARATE from inspiration_entries on purpose:
--   * inspiration_entries = analyzed posts with performance signal (Outliers Clio cites)
--   * hook_templates      = template scaffolding with [insert X] blanks (no performance data)
-- Mixing them would pollute the framework counts that ground Clio's recommendations.
--
-- NOTE: seed data (~997 templates) was loaded directly into production via Supabase
-- MCP from a parsed copy of '1,000 Viral Hooks (PBL).pdf'. Not committed here because
-- (a) the existing repo pattern keeps reference data out of migrations (see
-- inspiration_entries: schema only, content syncs from Notion), and (b) the file would
-- be ~150KB. To re-seed from scratch, re-parse the PDF via the workspace scripts.

CREATE TABLE IF NOT EXISTS public.hook_templates (
    id BIGSERIAL PRIMARY KEY,
    template_text TEXT NOT NULL,
    hook_framework TEXT NOT NULL,
    source_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Clio queries by framework, so index it.
CREATE INDEX IF NOT EXISTS idx_hook_templates_framework
    ON public.hook_templates(hook_framework);

-- Public read access (templates are not user-scoped, like inspiration_entries).
ALTER TABLE public.hook_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read access" ON public.hook_templates;
CREATE POLICY "Public read access"
    ON public.hook_templates
    FOR SELECT
    USING (true);

COMMENT ON TABLE public.hook_templates IS
    'Curated parameterized hook formulas. Used by Clio as fallback formula bank when no relevant Outlier exists in inspiration_entries.';
