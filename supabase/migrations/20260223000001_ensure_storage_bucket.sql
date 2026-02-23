-- Ensure the payment-qr storage bucket exists.
-- Idempotent: ON CONFLICT DO NOTHING makes this safe to re-run.
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-qr', 'payment-qr', true)
ON CONFLICT (id) DO NOTHING;
