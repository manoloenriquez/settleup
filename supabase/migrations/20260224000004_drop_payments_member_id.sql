-- Drop the legacy member_id column from payments.
-- from_member_id and to_member_id are the canonical columns going forward.
ALTER TABLE settleup.payments DROP COLUMN IF EXISTS member_id;
