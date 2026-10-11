-- Payment QR storage: let people delete their own replaced images, and make
-- the bucket enforce image type and size.
--
-- Storage deletes need SELECT as well as DELETE on storage.objects. The broad
-- SELECT policy was dropped (20260602000005) so nobody could list everyone's
-- QR files, which also made every delete a silent no-op: replaced QR codes
-- stayed public forever. This SELECT policy covers only the owner's folder;
-- public URLs keep working because the bucket is public.

DROP POLICY IF EXISTS "payment_qr_owner_select" ON storage.objects;
CREATE POLICY "payment_qr_owner_select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-qr'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- Server-side limits matching the apps (5 MB; JPEG, PNG, WebP). image/jpg is
-- not a real type but TestFlight builds up to 3 send it for .jpg files.
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
WHERE id = 'payment-qr';
