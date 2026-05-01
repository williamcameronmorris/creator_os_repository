-- First-time user flow groundwork.
--
-- Two changes, kept in one migration because they're conceptually one feature:
--
-- 1. profiles.onboarding_step
--    Replaces the binary `onboarding_completed` flag with a 4-state enum so
--    we can resume users at the step they left off at instead of always
--    routing them to step 1. The `onboarding_completed` column stays for
--    backwards-compat (anything still reading it just checks step='done').
--
-- 2. handle_new_user() trigger
--    Creates a profiles row automatically on auth.users insert. Today the
--    sign-up flow only calls supabase.auth.signUp, leaving the user with no
--    profiles row until the client happens to write to it. The new
--    onboarding flow needs a row to update from step one, so we materialize
--    it at sign-up time. ON CONFLICT DO NOTHING means we're safe to run on
--    existing users with rows.

-- ─── 1. onboarding_step column ─────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'name_niche'
    CHECK (onboarding_step IN ('name_niche', 'connect', 'walkthrough', 'done'));

-- Backfill: existing users who already finished the old onboarding land on
-- 'done' so they don't get yanked back through the new flow on their next
-- session. Users who never finished start at the new step 1.
UPDATE public.profiles
   SET onboarding_step = 'done'
 WHERE onboarding_completed = true;

-- ─── 2. handle_new_user trigger ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, onboarding_step)
  VALUES (NEW.id, 'name_niche')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
