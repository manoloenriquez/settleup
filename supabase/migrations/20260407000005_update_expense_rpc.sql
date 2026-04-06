-- =============================================================================
-- update_expense + update_itemized_expense RPCs
--
-- Strategy: UPDATE the expense row, DELETE + re-INSERT all children
-- (payers, participants, items, item_participants).
--
-- Auth: creator (created_by_user_id = auth.uid()) OR admin/owner.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RPC: update_expense
--
-- Input JSONB shape:
-- {
--   "expense_id":      "uuid",
--   "item_name":       "text",
--   "amount_cents":    1000,
--   "notes":           "optional text",
--   "split_mode":      "equal" | "custom",
--   "participant_ids": ["uuid", ...],
--   "custom_splits":   [{"member_id": "uuid", "share_cents": 500}, ...],
--   "payers":          [{"member_id": "uuid", "paid_cents": 1000}]
-- }
--
-- Returns: { "expense": { ...expense row } }
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.update_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id    UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_split_mode    TEXT;
  v_expense       JSONB;
  v_existing      RECORD;
  v_participant   JSONB;
  v_payer         JSONB;
  v_member_ids    UUID[];
  v_shares        BIGINT[];
  v_payer_sum     BIGINT := 0;
  v_custom_sum    BIGINT := 0;
  i               INT;
BEGIN
  -- ---- Parse input ----
  v_expense_id   := (p_input->>'expense_id')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';
  v_split_mode   := COALESCE(p_input->>'split_mode', 'equal');

  IF v_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_id is required';
  END IF;
  IF v_item_name IS NULL OR length(v_item_name) = 0 THEN
    RAISE EXCEPTION 'item_name is required';
  END IF;
  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;
  IF v_split_mode NOT IN ('equal', 'custom') THEN
    RAISE EXCEPTION 'split_mode must be equal or custom';
  END IF;

  -- ---- Fetch existing expense and authorize ----
  SELECT e.id, e.group_id, e.created_by_user_id
  INTO v_existing
  FROM expenses e
  WHERE e.id = v_expense_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_existing.created_by_user_id IS DISTINCT FROM auth.uid()
     AND NOT settleup.is_group_admin_or_owner(v_existing.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to edit this expense';
  END IF;

  -- ---- Validate payer sum ----
  SELECT COALESCE(SUM((payer->>'paid_cents')::BIGINT), 0)
  INTO v_payer_sum
  FROM jsonb_array_elements(p_input->'payers') AS payer;

  IF v_payer_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Payer total (%) must equal amount_cents (%)', v_payer_sum, v_amount_cents;
  END IF;

  -- ---- Validate split sum for custom mode ----
  IF v_split_mode = 'custom' THEN
    SELECT COALESCE(SUM((s->>'share_cents')::BIGINT), 0)
    INTO v_custom_sum
    FROM jsonb_array_elements(p_input->'custom_splits') AS s;

    IF v_custom_sum <> v_amount_cents THEN
      RAISE EXCEPTION 'Custom split total (%) must equal amount_cents (%)', v_custom_sum, v_amount_cents;
    END IF;
  END IF;

  -- ---- Update expense row ----
  UPDATE expenses
  SET item_name    = v_item_name,
      amount_cents = v_amount_cents,
      notes        = v_notes
  WHERE id = v_expense_id;

  -- ---- Delete old children ----
  -- expense_items CASCADE deletes expense_item_participants
  DELETE FROM expense_items WHERE expense_id = v_expense_id;
  DELETE FROM expense_participants WHERE expense_id = v_expense_id;
  DELETE FROM expense_payers WHERE expense_id = v_expense_id;

  -- ---- Re-insert participants ----
  IF v_split_mode = 'equal' THEN
    SELECT ARRAY(
      SELECT participant_id::UUID
      FROM jsonb_array_elements_text(p_input->'participant_ids') AS participant_id
      ORDER BY participant_id
    ) INTO v_member_ids;

    IF array_length(v_member_ids, 1) IS NULL OR array_length(v_member_ids, 1) = 0 THEN
      RAISE EXCEPTION 'At least one participant_id is required';
    END IF;

    v_shares := settleup.equal_split(v_amount_cents, array_length(v_member_ids, 1));

    FOR i IN 1..array_length(v_member_ids, 1) LOOP
      INSERT INTO expense_participants (expense_id, member_id, share_cents)
      VALUES (v_expense_id, v_member_ids[i], v_shares[i]);
    END LOOP;
  ELSE
    FOR v_participant IN SELECT * FROM jsonb_array_elements(p_input->'custom_splits') LOOP
      INSERT INTO expense_participants (expense_id, member_id, share_cents)
      VALUES (
        v_expense_id,
        (v_participant->>'member_id')::UUID,
        (v_participant->>'share_cents')::BIGINT
      );
    END LOOP;
  END IF;

  -- ---- Re-insert payers ----
  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  -- ---- Return updated expense ----
  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.update_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: update_itemized_expense
--
-- Input JSONB shape:
-- {
--   "expense_id":   "uuid",
--   "item_name":    "text",
--   "amount_cents":  1000,
--   "notes":        "optional",
--   "payers":       [{"member_id": "uuid", "paid_cents": 1000}],
--   "line_items":   [
--     {"name": "text", "amount_cents": 500, "participant_ids": ["uuid", ...]},
--     ...
--   ]
-- }
--
-- Returns: { "expense": { ...expense row } }
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.update_itemized_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id    UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense       JSONB;
  v_existing      RECORD;
  v_line_item     JSONB;
  v_item_id       UUID;
  v_payer         JSONB;
  v_member_ids    UUID[];
  v_shares        BIGINT[];
  v_payer_sum     BIGINT := 0;
  v_item_sum      BIGINT := 0;
  v_rollup        JSONB := '{}'::JSONB;
  v_member_id     UUID;
  v_share_cents   BIGINT;
  v_existing_val  BIGINT;
  i               INT;
BEGIN
  -- ---- Parse input ----
  v_expense_id   := (p_input->>'expense_id')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';

  IF v_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_id is required';
  END IF;
  IF v_item_name IS NULL OR length(v_item_name) = 0 THEN
    RAISE EXCEPTION 'item_name is required';
  END IF;
  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  -- ---- Fetch existing expense and authorize ----
  SELECT e.id, e.group_id, e.created_by_user_id
  INTO v_existing
  FROM expenses e
  WHERE e.id = v_expense_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  IF v_existing.created_by_user_id IS DISTINCT FROM auth.uid()
     AND NOT settleup.is_group_admin_or_owner(v_existing.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to edit this expense';
  END IF;

  -- ---- Validate payer sum ----
  SELECT COALESCE(SUM((payer->>'paid_cents')::BIGINT), 0)
  INTO v_payer_sum
  FROM jsonb_array_elements(p_input->'payers') AS payer;

  IF v_payer_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Payer total (%) must equal amount_cents (%)', v_payer_sum, v_amount_cents;
  END IF;

  -- ---- Validate line item sum ----
  SELECT COALESCE(SUM((li->>'amount_cents')::BIGINT), 0)
  INTO v_item_sum
  FROM jsonb_array_elements(p_input->'line_items') AS li;

  IF v_item_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Line items total (%) must equal amount_cents (%)', v_item_sum, v_amount_cents;
  END IF;

  -- ---- Update expense row ----
  UPDATE expenses
  SET item_name    = v_item_name,
      amount_cents = v_amount_cents,
      notes        = v_notes
  WHERE id = v_expense_id;

  -- ---- Delete old children (CASCADE handles item_participants) ----
  DELETE FROM expense_items WHERE expense_id = v_expense_id;
  DELETE FROM expense_participants WHERE expense_id = v_expense_id;
  DELETE FROM expense_payers WHERE expense_id = v_expense_id;

  -- ---- Process line items ----
  FOR v_line_item IN SELECT * FROM jsonb_array_elements(p_input->'line_items') LOOP
    INSERT INTO expense_items (expense_id, name, amount_cents)
    VALUES (
      v_expense_id,
      trim(v_line_item->>'name'),
      (v_line_item->>'amount_cents')::BIGINT
    )
    RETURNING id INTO v_item_id;

    SELECT ARRAY(
      SELECT participant_id::UUID
      FROM jsonb_array_elements_text(v_line_item->'participant_ids') AS participant_id
      ORDER BY participant_id
    ) INTO v_member_ids;

    IF array_length(v_member_ids, 1) IS NULL OR array_length(v_member_ids, 1) = 0 THEN
      RAISE EXCEPTION 'Each line item requires at least one participant_id';
    END IF;

    v_shares := settleup.equal_split(
      (v_line_item->>'amount_cents')::BIGINT,
      array_length(v_member_ids, 1)
    );

    FOR i IN 1..array_length(v_member_ids, 1) LOOP
      INSERT INTO expense_item_participants (item_id, member_id, share_cents)
      VALUES (v_item_id, v_member_ids[i], v_shares[i]);

      v_existing_val := COALESCE((v_rollup->>(v_member_ids[i]::TEXT))::BIGINT, 0);
      v_rollup := jsonb_set(
        v_rollup,
        ARRAY[v_member_ids[i]::TEXT],
        to_jsonb(v_existing_val + v_shares[i])
      );
    END LOOP;
  END LOOP;

  -- ---- Insert rollup expense_participants ----
  FOR v_member_id, v_share_cents IN
    SELECT key::UUID, value::BIGINT
    FROM jsonb_each_text(v_rollup)
  LOOP
    INSERT INTO expense_participants (expense_id, member_id, share_cents)
    VALUES (v_expense_id, v_member_id, v_share_cents);
  END LOOP;

  -- ---- Re-insert payers ----
  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  -- ---- Return updated expense ----
  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.update_itemized_expense(JSONB) TO authenticated;
