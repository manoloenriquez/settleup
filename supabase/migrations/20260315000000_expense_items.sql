-- expense_items: individual line items within an expense
CREATE TABLE settleup.expense_items (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id    UUID        NOT NULL REFERENCES settleup.expenses(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settleup.expense_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_items_owner_all"
  ON settleup.expense_items FOR ALL TO authenticated
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
  ON settleup.expense_items TO authenticated;

-- expense_item_participants: who shares each line item
CREATE TABLE settleup.expense_item_participants (
  item_id      UUID   NOT NULL REFERENCES settleup.expense_items(id) ON DELETE CASCADE,
  member_id    UUID   NOT NULL REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  share_cents  BIGINT NOT NULL,
  PRIMARY KEY (item_id, member_id)
);

ALTER TABLE settleup.expense_item_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_item_participants_owner_all"
  ON settleup.expense_item_participants FOR ALL TO authenticated
  USING (
    item_id IN (
      SELECT ei.id FROM settleup.expense_items ei
      JOIN settleup.expenses e ON e.id = ei.expense_id
      JOIN settleup.groups g ON g.id = e.group_id
      WHERE g.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    item_id IN (
      SELECT ei.id FROM settleup.expense_items ei
      JOIN settleup.expenses e ON e.id = ei.expense_id
      JOIN settleup.groups g ON g.id = e.group_id
      WHERE g.owner_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON settleup.expense_item_participants TO authenticated;

-- Indexes
CREATE INDEX idx_expense_items_expense_id ON settleup.expense_items(expense_id);
CREATE INDEX idx_expense_item_participants_member_id ON settleup.expense_item_participants(member_id);
