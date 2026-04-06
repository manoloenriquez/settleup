-- =============================================================================
-- RLS policies for expense UPDATE and child-table DELETE
--
-- Allows the expense creator OR any admin/owner to UPDATE/DELETE expense rows
-- and their children. These policies enable the update_expense RPC to work
-- and also act as defense-in-depth for direct table access.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- expenses: UPDATE by creator or admin/owner
-- ---------------------------------------------------------------------------

CREATE POLICY "expenses_member_update"
  ON settleup.expenses FOR UPDATE
  TO authenticated
  USING (
    group_id IN (SELECT settleup.user_group_ids())
    AND (
      created_by_user_id = auth.uid()
      OR settleup.is_group_admin_or_owner(group_id)
    )
  )
  WITH CHECK (
    group_id IN (SELECT settleup.user_group_ids())
  );

-- ---------------------------------------------------------------------------
-- expense_participants: DELETE by creator or admin/owner
-- (needed for re-insert during edit)
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_participants_member_delete"
  ON settleup.expense_participants FOR DELETE
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
        AND (
          e.created_by_user_id = auth.uid()
          OR settleup.is_group_admin_or_owner(e.group_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- expense_payers: DELETE by creator or admin/owner
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_payers_member_delete"
  ON settleup.expense_payers FOR DELETE
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
        AND (
          e.created_by_user_id = auth.uid()
          OR settleup.is_group_admin_or_owner(e.group_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- expense_items: DELETE by creator or admin/owner
-- (CASCADE will handle expense_item_participants, but explicit policy for
--  direct access if needed)
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_items_member_delete"
  ON settleup.expense_items FOR DELETE
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
        AND (
          e.created_by_user_id = auth.uid()
          OR settleup.is_group_admin_or_owner(e.group_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- expense_item_participants: DELETE by creator or admin/owner
-- ---------------------------------------------------------------------------

CREATE POLICY "expense_item_participants_member_delete"
  ON settleup.expense_item_participants FOR DELETE
  TO authenticated
  USING (
    item_id IN (
      SELECT ei.id FROM settleup.expense_items ei
      JOIN settleup.expenses e ON e.id = ei.expense_id
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
        AND (
          e.created_by_user_id = auth.uid()
          OR settleup.is_group_admin_or_owner(e.group_id)
        )
    )
  );
