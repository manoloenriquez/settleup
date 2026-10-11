-- Payment QR storage: owners see only their own folder (which is what lets the
-- Storage API delete their replaced images); the bucket enforces type and
-- size. Deletes themselves go through the Storage API (storage.protect_delete
-- blocks SQL deletes); tools/ui-driver/check-qr-delete.sh exercises them.
-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); n integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (alice, 'qr-a@' || alice || '.example.invalid', '{}'),
    (bob, 'qr-b@' || bob || '.example.invalid', '{}');
  INSERT INTO storage.objects(bucket_id, name, owner) VALUES
    ('payment-qr', alice || '/gcash-qr-1.jpg', alice),
    ('payment-qr', alice || '/gcash-qr-2.jpg', alice),
    ('payment-qr', bob || '/gcash-qr-1.jpg', bob);

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);

  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'payment-qr';
  ASSERT n = 2, 'Alice sees only her own two QR files, not Bob''s';

  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'payment-qr';
  ASSERT n = 0, 'Nobody can list QR files anonymously';

  PERFORM set_config('role', 'postgres', true);
  ASSERT (SELECT file_size_limit FROM storage.buckets WHERE id = 'payment-qr') = 5242880, 'Bucket caps size at 5 MB';
  ASSERT (SELECT 'image/svg+xml' <> ALL(allowed_mime_types) AND 'image/png' = ANY(allowed_mime_types)
          FROM storage.buckets WHERE id = 'payment-qr'), 'Bucket accepts images only';
END $$;
ROLLBACK;
