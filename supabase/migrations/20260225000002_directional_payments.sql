-- Directional payments: from_member_id pays to_member_id

ALTER TABLE settleup.payments
  ADD COLUMN from_member_id UUID REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  ADD COLUMN to_member_id UUID REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Migrate existing: old member_id → from_member_id.
-- Guarded because 20260224000004 (earlier timestamp) already drops member_id
-- on fresh replays; databases that applied this migration historically had
-- the column and ran the backfill. No-op either way on applied databases.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'settleup' AND table_name = 'payments' AND column_name = 'member_id'
  ) THEN
    UPDATE settleup.payments SET from_member_id = member_id WHERE from_member_id IS NULL;
    COMMENT ON COLUMN settleup.payments.member_id IS 'DEPRECATED: Use from_member_id/to_member_id';
  END IF;
END;
$$;

ALTER TABLE settleup.payments
  ADD CONSTRAINT payments_no_self_payment CHECK (from_member_id IS DISTINCT FROM to_member_id);

CREATE INDEX payments_from_member_idx ON settleup.payments (from_member_id);
CREATE INDEX payments_to_member_idx ON settleup.payments (to_member_id);
