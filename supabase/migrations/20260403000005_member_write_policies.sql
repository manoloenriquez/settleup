-- =============================================================================
-- Phase 2.3: Member-write RLS policies
--
-- Allows authenticated users linked to a group (via group_members.user_id)
-- to INSERT expenses, expense sub-rows, and payments in that group.
-- They can also DELETE their own expenses and payments.
--
-- group_members, groups: remain owner-only for writes (join/claim go via SECURITY DEFINER RPCs).
-- All existing *_owner_all policies remain intact — owners still have full access.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- expenses: member INSERT and DELETE (own)
-- ---------------------------------------------------------------------------

CREATE POLICY "expenses_member_insert"
  ON settleup.expenses FOR INSERT
  TO authenticated
  WITH CHECK (group_id IN (SELECT settleup.user_group_ids()));

CREATE POLICY "expenses_member_delete_own"
  ON settleup.expenses FOR DELETE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    AND group_id IN (SELECT settleup.user_group_ids())
  );

-- ---------------------------------------------------------------------------
-- expense_participants: member INSERT
-- (written through create_expense RPC which is SECURITY DEFINER;
--  this policy is defense-in-depth for any direct table access)
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_participants_member_insert"
  ON settleup.expense_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- expense_payers: member INSERT
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_payers_member_insert"
  ON settleup.expense_payers FOR INSERT
  TO authenticated
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- expense_items: member INSERT
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_items_member_insert"
  ON settleup.expense_items FOR INSERT
  TO authenticated
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- expense_item_participants: member INSERT
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_item_participants_member_insert"
  ON settleup.expense_item_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    item_id IN (
      SELECT ei.id FROM settleup.expense_items ei
      JOIN settleup.expenses e ON e.id = ei.expense_id
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- payments: member INSERT and DELETE (own)
-- ---------------------------------------------------------------------------

CREATE POLICY "payments_member_insert"
  ON settleup.payments FOR INSERT
  TO authenticated
  WITH CHECK (group_id IN (SELECT settleup.user_group_ids()));

CREATE POLICY "payments_member_delete_own"
  ON settleup.payments FOR DELETE
  TO authenticated
  USING (
    created_by_user_id = auth.uid()
    AND group_id IN (SELECT settleup.user_group_ids())
  );
