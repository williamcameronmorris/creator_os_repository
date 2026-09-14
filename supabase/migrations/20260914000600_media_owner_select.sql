-- Owner-scoped reads on the media bucket.
--
-- Signing a URL for an object (storage.objects SELECT as the caller) needs a
-- read policy. Production no longer carries the original "Users can view
-- all media" policy (20251229043321), and reads only worked because the
-- bucket is public. Scope reads to the owner's folder
-- (every path starts with the uploader's user id, matching the existing
-- insert/update/delete policies). Safe to apply before the bucket goes
-- private: it only adds a way to sign URLs.
drop policy if exists "Users can view all media" on storage.objects;
drop policy if exists "Users can view their own media" on storage.objects;

create policy "Users can view their own media"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'media'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
