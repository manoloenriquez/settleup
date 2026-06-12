-- Multi-payer recurring expenses: templates can carry a full payer split
-- (e.g. two housemates covering rent 60/40). `payers` is a JSONB array of
-- { member_id, paid_cents }; when NULL the template falls back to the
-- single payer_member_id paying the full amount, so existing templates
-- keep working unchanged.

ALTER TABLE settleup.recurring_expenses
  ADD COLUMN payers JSONB CHECK (payers IS NULL OR jsonb_typeof(payers) = 'array');

CREATE OR REPLACE FUNCTION settleup.materialize_recurring_expenses()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_template     recurring_expenses%ROWTYPE;
  v_expense_id   UUID;
  v_member_ids   UUID[];
  v_shares       BIGINT[];
  v_payers       JSONB;
  v_payer_sum    BIGINT;
  v_payers_valid BOOLEAN;
  v_payer        JSONB;
  v_count        INT := 0;
  i              INT;
BEGIN
  FOR v_template IN
    SELECT * FROM recurring_expenses
    WHERE active AND next_run_at <= CURRENT_DATE
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Skip participants that have since been removed from the group
    SELECT ARRAY(
      SELECT gm.id FROM group_members gm
      WHERE gm.id = ANY(v_template.participant_member_ids)
        AND gm.group_id = v_template.group_id
      ORDER BY gm.id
    ) INTO v_member_ids;

    -- Resolve payers: stored multi-payer split, or single payer paying all
    v_payers := COALESCE(
      v_template.payers,
      jsonb_build_array(jsonb_build_object(
        'member_id', v_template.payer_member_id,
        'paid_cents', v_template.amount_cents
      ))
    );

    SELECT
      COALESCE(SUM((p->>'paid_cents')::BIGINT), 0),
      COALESCE(BOOL_AND(
        (p->>'paid_cents')::BIGINT > 0
        AND EXISTS (
          SELECT 1 FROM group_members gm
          WHERE gm.id = (p->>'member_id')::UUID
            AND gm.group_id = v_template.group_id
        )
      ), FALSE)
    INTO v_payer_sum, v_payers_valid
    FROM jsonb_array_elements(v_payers) p;

    IF array_length(v_member_ids, 1) IS NULL
       OR NOT v_payers_valid
       OR v_payer_sum <> v_template.amount_cents
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

    FOR v_payer IN SELECT * FROM jsonb_array_elements(v_payers) LOOP
      INSERT INTO expense_payers (expense_id, member_id, paid_cents)
      VALUES (v_expense_id, (v_payer->>'member_id')::UUID, (v_payer->>'paid_cents')::BIGINT);
    END LOOP;

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
