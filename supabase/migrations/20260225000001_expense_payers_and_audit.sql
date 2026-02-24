-- Audit field on expenses
ALTER TABLE settleup.expenses
  ADD COLUMN created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- New table: who paid for each expense (multi-payer support)
CREATE TABLE settleup.expense_payers (
  expense_id UUID NOT NULL REFERENCES settleup.expenses(id) ON DELETE CASCADE,
  member_id  UUID NOT NULL REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  paid_cents BIGINT NOT NULL CHECK (paid_cents > 0),
  PRIMARY KEY (expense_id, member_id)
);

ALTER TABLE settleup.expense_payers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_payers_owner_all"
  ON settleup.expense_payers FOR ALL TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      JOIN settleup.groups g ON g.id = e.group_id
      WHERE g.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      JOIN settleup.groups g ON g.id = e.group_id
      WHERE g.owner_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON settleup.expense_payers TO authenticated;

CREATE INDEX expense_payers_member_idx ON settleup.expense_payers (member_id);
