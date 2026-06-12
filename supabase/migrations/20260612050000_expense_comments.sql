-- Comment threads on expenses, so disputes ("that included your dessert")
-- stay attached to the expense instead of leaving for the group chat.

CREATE TABLE settleup.expense_comments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id     UUID        NOT NULL REFERENCES settleup.expenses(id) ON DELETE CASCADE,
  author_user_id UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body           TEXT        NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 500),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX expense_comments_expense_idx ON settleup.expense_comments (expense_id, created_at);

ALTER TABLE settleup.expense_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_comments_member_select"
  ON settleup.expense_comments FOR SELECT
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

CREATE POLICY "expense_comments_member_insert"
  ON settleup.expense_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

CREATE POLICY "expense_comments_delete_own"
  ON settleup.expense_comments FOR DELETE
  TO authenticated
  USING (author_user_id = auth.uid());

-- Realtime so threads update live alongside the rest of the group data
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settleup.expense_comments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
