-- Public buckets can serve direct public object URLs without a broad SELECT
-- policy on storage.objects. Dropping this policy prevents clients from
-- listing all payment QR files in the bucket.

DROP POLICY IF EXISTS "payment_qr_select" ON storage.objects;
