-- Recurring expenses: templates that pg_cron materializes into normal
-- expenses on schedule (rent, utilities, subscriptions). Generated
-- expenses are equal-split among the template's participants and paid by
-- the template's payer; they appear and behave like any other expense.

CREATE TABLE settleup.recurring_expenses (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id               UUID        NOT NULL REFERENCES settleup.groups(id) ON DELETE CASCADE,
  item_name              TEXT        NOT NULL CHECK (length(trim(item_name)) > 0),
  amount_cents           BIGINT      NOT NULL CHECK (amount_cents > 0),
  category_id            UUID        REFERENCES settleup.expense_categories(id) ON DELETE SET NULL,
  payer_member_id        UUID        NOT NULL REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  participant_member_ids UUID[]      NOT NULL CHECK (array_length(participant_member_ids, 1) >= 1),
  cadence                TEXT        NOT NULL CHECK (cadence IN ('weekly', 'monthly')),
  next_run_at            DATE        NOT NULL,
  active                 BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by_user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX recurring_expenses_due_idx
  ON settleup.recurring_expenses (next_run_at) WHERE active;

ALTER TABLE settleup.recurring_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_expenses_member_select"
  ON settleup.recurring_expenses FOR SELECT
  TO authenticated
  USING (group_id IN (SELECT settleup.user_group_ids()));

CREATE POLICY "recurring_expenses_member_insert"
  ON settleup.recurring_expenses FOR INSERT
  TO authenticated
  WITH CHECK (group_id IN (SELECT settleup.user_group_ids()));

CREATE POLICY "recurring_expenses_member_update"
  ON settleup.recurring_expenses FOR UPDATE
  TO authenticated
  USING (group_id IN (SELECT settleup.user_group_ids()));

CREATE POLICY "recurring_expenses_member_delete"
  ON settleup.recurring_expenses FOR DELETE
  TO authenticated
  USING (group_id IN (SELECT settleup.user_group_ids()));

-- ---------------------------------------------------------------------------
-- Materializer: turn due templates into expenses, advance next_run_at
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.materialize_recurring_expenses()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_template   recurring_expenses%ROWTYPE;
  v_expense_id UUID;
  v_member_ids UUID[];
  v_shares     BIGINT[];
  v_count      INT := 0;
  i            INT;
BEGIN
  FOR v_template IN
    SELECT * FROM recurring_expenses
    WHERE active AND next_run_at <= CURRENT_DATE
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Skip participants/payers that have since been removed from the group
    SELECT ARRAY(
      SELECT gm.id FROM group_members gm
      WHERE gm.id = ANY(v_template.participant_member_ids)
        AND gm.group_id = v_template.group_id
      ORDER BY gm.id
    ) INTO v_member_ids;

    IF array_length(v_member_ids, 1) IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM group_members gm
         WHERE gm.id = v_template.payer_member_id AND gm.group_id = v_template.group_id
       )
    THEN
      -- Template no longer valid; deactivate instead of failing forever
      UPDATE recurring_expenses SET active = FALSE WHERE id = v_template.id;
      CONTINUE;
    END IF;

    INSERT INTO expenses (group_id, category_id, item_name, amount_cents, notes, created_by_user_id)
    VALUES (
      v_template.group_id,
      v_template.category_id,
      v_template.item_name,
      v_template.amount_cents,
      'Auto · ' || v_template.cadence,
      v_template.created_by_user_id
    )
    RETURNING id INTO v_expense_id;

    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (v_expense_id, v_template.payer_member_id, v_template.amount_cents);

    v_shares := settleup.equal_split(v_template.amount_cents, array_length(v_member_ids, 1));
    FOR i IN 1..array_length(v_member_ids, 1) LOOP
      INSERT INTO expense_participants (expense_id, member_id, share_cents)
      VALUES (v_expense_id, v_member_ids[i], v_shares[i]);
    END LOOP;

    UPDATE recurring_expenses
    SET next_run_at = CASE cadence
      WHEN 'weekly' THEN next_run_at + INTERVAL '7 days'
      ELSE next_run_at + INTERVAL '1 month'
    END
    WHERE id = v_template.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION settleup.materialize_recurring_expenses() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Schedule daily at 00:15 (best effort — skipped if pg_cron is unavailable)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule(
    'settleup-recurring-expenses',
    '15 0 * * *',
    $job$SELECT settleup.materialize_recurring_expenses()$job$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron unavailable; schedule settleup.materialize_recurring_expenses() manually';
END;
$$;
