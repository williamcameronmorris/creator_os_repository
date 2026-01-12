/*
  # Configure Storage Buckets for Media Files

  1. Storage Buckets
    - `media` - For user-uploaded content (images, videos)
    - `avatars` - For user profile pictures
  
  2. Security
    - Public read access for media bucket
    - Authenticated users can upload their own files
    - Users can only delete their own files
    - RLS policies for secure access control
*/

-- Create media bucket for user content
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  52428800, -- 50MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']
)
ON CONFLICT (id) DO NOTHING;

-- Create avatars bucket for profile pictures
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for media bucket
CREATE POLICY "Users can upload their own media"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view all media"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'media');

CREATE POLICY "Users can update their own media"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own media"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'media' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for avatars bucket
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Anyone can view avatars"
  ON storage.objects
  FOR SELECT
  TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can update their own avatar"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );
