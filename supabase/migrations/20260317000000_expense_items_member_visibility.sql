-- =============================================================================
-- Add SELECT RLS policies for expense_items and expense_item_participants
-- so linked group members (group_members.user_id = auth.uid()) can read them.
-- Mirrors the pattern from 20260302000000_group_member_visibility.sql.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- expense_items — SELECT for linked members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expense_items_member_select" ON settleup.expense_items;

CREATE POLICY "expense_items_member_select"
  ON settleup.expense_items FOR SELECT
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- expense_item_participants — SELECT for linked members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expense_item_participants_member_select" ON settleup.expense_item_participants;

CREATE POLICY "expense_item_participants_member_select"
  ON settleup.expense_item_participants FOR SELECT
  TO authenticated
  USING (
    item_id IN (
      SELECT ei.id FROM settleup.expense_items ei
      JOIN settleup.expenses e ON e.id = ei.expense_id
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- expense_participants(expense_id) index — referenced in JOINs but missing
-- (also covers 4F from production readiness roadmap)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_expense_participants_expense_id
  ON settleup.expense_participants (expense_id);
