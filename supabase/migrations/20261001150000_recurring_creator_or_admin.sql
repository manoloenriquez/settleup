-- Audit M4: any group member could change or delete anyone's recurring
-- template. Members still see every template and create their own; only the
-- creator or a group owner/admin may pause, edit or delete one. A template
-- whose creator closed their account (created_by_user_id NULL) is left to
-- owners/admins.

DROP POLICY IF EXISTS "recurring_expenses_member_insert" ON settleup.recurring_expenses;
CREATE POLICY "recurring_expenses_member_insert"
  ON settleup.recurring_expenses FOR INSERT
  TO authenticated
  WITH CHECK (
    group_id IN (SELECT settleup.user_group_ids())
    AND created_by_user_id = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "recurring_expenses_member_update" ON settleup.recurring_expenses;
CREATE POLICY "recurring_expenses_creator_or_admin_update"
  ON settleup.recurring_expenses FOR UPDATE
  TO authenticated
  USING (
    group_id IN (SELECT settleup.user_group_ids())
    AND (created_by_user_id = (SELECT auth.uid()) OR settleup.is_group_admin_or_owner(group_id))
  )
  WITH CHECK (
    group_id IN (SELECT settleup.user_group_ids())
    AND (created_by_user_id = (SELECT auth.uid()) OR settleup.is_group_admin_or_owner(group_id))
  );

DROP POLICY IF EXISTS "recurring_expenses_member_delete" ON settleup.recurring_expenses;
CREATE POLICY "recurring_expenses_creator_or_admin_delete"
  ON settleup.recurring_expenses FOR DELETE
  TO authenticated
  USING (
    group_id IN (SELECT settleup.user_group_ids())
    AND (created_by_user_id = (SELECT auth.uid()) OR settleup.is_group_admin_or_owner(group_id))
  );
