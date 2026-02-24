-- Update storage policies so the QR image folder is keyed by user_id (not group_id).
-- The existing policies are permissive but not folder-scoped; tighten INSERT/DELETE
-- to validate that the first path segment matches the uploading user's id.

-- Drop old policies
DROP POLICY IF EXISTS "payment_qr_insert" ON storage.objects;
DROP POLICY IF EXISTS "payment_qr_delete" ON storage.objects;

-- Re-create with user-scoped folder check
CREATE POLICY "payment_qr_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-qr'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "payment_qr_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-qr'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
