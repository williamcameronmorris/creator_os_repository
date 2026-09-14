-- profiles.timezone
--
-- useTimezone selects this column on every page, and Settings now lets the
-- user pick it, but no migration in this repository ever created it:
-- production got it by hand. Add it here so a fresh database (and the type
-- generator) agrees with the code. IANA name, e.g. "America/Chicago". Null
-- means "use the browser".
alter table public.profiles add column if not exists timezone text;
