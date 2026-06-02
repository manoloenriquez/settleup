-- Address SettleUp database advisor findings that are safe for beta.

ALTER FUNCTION settleup.equal_split(BIGINT, INT) SET search_path = settleup;
ALTER FUNCTION settleup.mask_account(TEXT) SET search_path = settleup;

CREATE INDEX IF NOT EXISTS groups_owner_user_idx
  ON settleup.groups (owner_user_id);

CREATE INDEX IF NOT EXISTS expenses_created_by_user_idx
  ON settleup.expenses (created_by_user_id);

CREATE INDEX IF NOT EXISTS payments_created_by_user_idx
  ON settleup.payments (created_by_user_id);

CREATE INDEX IF NOT EXISTS payments_group_idx
  ON settleup.payments (group_id);

DROP INDEX IF EXISTS settleup.idx_expense_payers_member_id;
DROP INDEX IF EXISTS settleup.idx_payments_from_member_id;
DROP INDEX IF EXISTS settleup.idx_payments_to_member_id;
