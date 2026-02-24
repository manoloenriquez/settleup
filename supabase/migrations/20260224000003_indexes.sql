-- Performance indexes on heavily-filtered FK columns.

CREATE INDEX IF NOT EXISTS idx_group_members_group_id
  ON settleup.group_members (group_id);

CREATE INDEX IF NOT EXISTS idx_expenses_group_id
  ON settleup.expenses (group_id);

CREATE INDEX IF NOT EXISTS idx_expense_participants_member_id
  ON settleup.expense_participants (member_id);

CREATE INDEX IF NOT EXISTS idx_payments_member_id
  ON settleup.payments (member_id);
