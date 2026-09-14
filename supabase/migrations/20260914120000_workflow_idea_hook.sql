-- The hook and reasoning a creator picked an idea for travel with the
-- workflow, so the scripting stage can open on that hook instead of the
-- topic alone. Nullable: older workflows and manual ideas have neither.

alter table public.content_workflow_stages
  add column if not exists idea_hook text,
  add column if not exists idea_reasoning text;

comment on column public.content_workflow_stages.idea_hook is
  'The hook line the idea was chosen for; passed to generate-script.';
comment on column public.content_workflow_stages.idea_reasoning is
  'Why the idea was suggested; passed to generate-script for context.';
