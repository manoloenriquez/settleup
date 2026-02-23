-- Idempotently ensure all storage.objects policies for payment-qr exist.
-- Uses DO blocks because PostgreSQL has no CREATE POLICY IF NOT EXISTS.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'payment_qr_insert'
  ) THEN
    CREATE POLICY "payment_qr_insert"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'payment-qr');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'payment_qr_delete'
  ) THEN
    CREATE POLICY "payment_qr_delete"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'payment-qr');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename  = 'objects'
      AND policyname = 'payment_qr_select'
  ) THEN
    CREATE POLICY "payment_qr_select"
      ON storage.objects FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'payment-qr');
  END IF;
END $$;
