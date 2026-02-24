-- Directional payments: from_member_id pays to_member_id

ALTER TABLE settleup.payments
  ADD COLUMN from_member_id UUID REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  ADD COLUMN to_member_id UUID REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Migrate existing: old member_id → from_member_id
UPDATE settleup.payments SET from_member_id = member_id WHERE from_member_id IS NULL;

ALTER TABLE settleup.payments
  ADD CONSTRAINT payments_no_self_payment CHECK (from_member_id IS DISTINCT FROM to_member_id);

COMMENT ON COLUMN settleup.payments.member_id IS 'DEPRECATED: Use from_member_id/to_member_id';

CREATE INDEX payments_from_member_idx ON settleup.payments (from_member_id);
CREATE INDEX payments_to_member_idx ON settleup.payments (to_member_id);
