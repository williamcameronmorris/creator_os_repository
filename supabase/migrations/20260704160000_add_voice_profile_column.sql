-- In Your Voice (Pillar 01): store a richer per-user voice fingerprint on the
-- existing content profile so the AI generators can write in the creator's own
-- voice. `analyze-captions` populates `voice_profile`; `_shared/voice.ts` reads
-- it and injects it into generation prompts.
--
-- `posts_analyzed` already tracks how many of the user's posts fed the profile
-- (the source count), and `analyzed_at` drives the stale/refresh signal, so this
-- migration only needs to add the voice payload itself.
alter table public.user_content_profiles
  add column if not exists voice_profile jsonb;
