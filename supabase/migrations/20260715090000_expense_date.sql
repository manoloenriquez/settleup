-- Expense dates: a user-editable DATE on settleup.expenses, distinct from the
-- created_at audit timestamp, so expenses can be backfilled ("Saturday's
-- dinner logged on Monday") and sorted/exported/analyzed by when they
-- actually happened.
--
-- * Column defaults to CURRENT_DATE; clients send their local date so the
--   server default only covers older clients.
-- * Existing rows are backfilled from created_at in Asia/Manila (the app is
--   PH-only today).
-- * Mutation RPCs accept an optional p_input->>'expense_date'; updates
--   preserve the stored date when the key is omitted.
-- * materialize_recurring_expenses stamps the template's scheduled run date.
-- * Read RPCs that emit expense rows (get_friend_view, get_group_overview,
--   get_user_activity) include expense_date; ledger-style lists order by
--   expense_date DESC with created_at DESC as tiebreak. get_user_activity
--   keeps created_at ordering — it is a recency feed mixed with payments.
--
-- Function bodies are copied in full from their latest definitions:
--   create_expense / create_itemized_expense / update_expense /
--   update_itemized_expense  → 20260601000001_expense_categories.sql
--   get_friend_view                        → 20260612000000_pending_payments.sql
--   get_group_overview                     → 20260711082158_group_overview_expense_detail.sql
--   get_user_activity                      → 20260713185452_dashboard_summary_v3_superset.sql
--   materialize_recurring_expenses         → 20260613000000_recurring_multi_payer.sql
-- Only expense_date lines are new; grants are re-stated verbatim.

-- ---------------------------------------------------------------------------
-- Column + backfill + index
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.expenses
  ADD COLUMN expense_date DATE NOT NULL DEFAULT CURRENT_DATE;

UPDATE settleup.expenses
SET expense_date = (created_at AT TIME ZONE 'Asia/Manila')::date;

CREATE INDEX expenses_group_expense_date_idx
  ON settleup.expenses (group_id, expense_date DESC, created_at DESC);

-- ---------------------------------------------------------------------------
-- create_expense
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id      UUID;
  v_category_id   UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_date  DATE;
  v_split_mode    TEXT;
  v_expense_id    UUID;
  v_expense       JSONB;
  v_participant   JSONB;
  v_payer         JSONB;
  v_member_ids    UUID[];
  v_shares        BIGINT[];
  v_payer_sum     BIGINT := 0;
  v_custom_sum    BIGINT := 0;
  i               INT;
BEGIN
  v_group_id     := (p_input->>'group_id')::UUID;
  v_category_id  := NULLIF(p_input->>'category_id', '')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';
  v_expense_date := COALESCE(NULLIF(p_input->>'expense_date', '')::DATE, CURRENT_DATE);
  v_split_mode   := COALESCE(p_input->>'split_mode', 'equal');

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required';
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

  IF NOT EXISTS (
    SELECT 1 FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = auth.uid()
    WHERE g.id = v_group_id
      AND (g.owner_user_id = auth.uid() OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to add expenses to this group';
  END IF;

  SELECT COALESCE(SUM((payer->>'paid_cents')::BIGINT), 0)
  INTO v_payer_sum
  FROM jsonb_array_elements(p_input->'payers') AS payer;

  IF v_payer_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Payer total (%) must equal amount_cents (%)', v_payer_sum, v_amount_cents;
  END IF;

  IF v_split_mode = 'custom' THEN
    SELECT COALESCE(SUM((s->>'share_cents')::BIGINT), 0)
    INTO v_custom_sum
    FROM jsonb_array_elements(p_input->'custom_splits') AS s;

    IF v_custom_sum <> v_amount_cents THEN
      RAISE EXCEPTION 'Custom split total (%) must equal amount_cents (%)', v_custom_sum, v_amount_cents;
    END IF;
  END IF;

  INSERT INTO expenses (group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
  VALUES (v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, v_expense_date, auth.uid())
  RETURNING id INTO v_expense_id;

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

  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

REVOKE ALL ON FUNCTION settleup.create_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_itemized_expense
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_itemized_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id      UUID;
  v_category_id   UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_date  DATE;
  v_expense_id    UUID;
  v_expense       JSONB;
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
  v_existing      BIGINT;
  i               INT;
BEGIN
  v_group_id     := (p_input->>'group_id')::UUID;
  v_category_id  := NULLIF(p_input->>'category_id', '')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';
  v_expense_date := COALESCE(NULLIF(p_input->>'expense_date', '')::DATE, CURRENT_DATE);

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required';
  END IF;
  IF v_item_name IS NULL OR length(v_item_name) = 0 THEN
    RAISE EXCEPTION 'item_name is required';
  END IF;
  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = auth.uid()
    WHERE g.id = v_group_id
      AND (g.owner_user_id = auth.uid() OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to add expenses to this group';
  END IF;

  SELECT COALESCE(SUM((payer->>'paid_cents')::BIGINT), 0)
  INTO v_payer_sum
  FROM jsonb_array_elements(p_input->'payers') AS payer;

  IF v_payer_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Payer total (%) must equal amount_cents (%)', v_payer_sum, v_amount_cents;
  END IF;

  SELECT COALESCE(SUM((li->>'amount_cents')::BIGINT), 0)
  INTO v_item_sum
  FROM jsonb_array_elements(p_input->'line_items') AS li;

  IF v_item_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Line items total (%) must equal amount_cents (%)', v_item_sum, v_amount_cents;
  END IF;

  INSERT INTO expenses (group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
  VALUES (v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, v_expense_date, auth.uid())
  RETURNING id INTO v_expense_id;

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

      v_existing := COALESCE((v_rollup->>(v_member_ids[i]::TEXT))::BIGINT, 0);
      v_rollup := jsonb_set(
        v_rollup,
        ARRAY[v_member_ids[i]::TEXT],
        to_jsonb(v_existing + v_shares[i])
      );
    END LOOP;
  END LOOP;

  FOR v_member_id, v_share_cents IN
    SELECT key::UUID, value::BIGINT
    FROM jsonb_each_text(v_rollup)
  LOOP
    INSERT INTO expense_participants (expense_id, member_id, share_cents)
    VALUES (v_expense_id, v_member_id, v_share_cents);
  END LOOP;

  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

REVOKE ALL ON FUNCTION settleup.create_itemized_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_itemized_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- update_expense (expense_date preserved when the key is omitted)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.update_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id    UUID;
  v_category_id   UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_date  DATE;
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
  v_expense_id   := (p_input->>'expense_id')::UUID;
  v_category_id  := NULLIF(p_input->>'category_id', '')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';
  v_expense_date := NULLIF(p_input->>'expense_date', '')::DATE;
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

  SELECT COALESCE(SUM((payer->>'paid_cents')::BIGINT), 0)
  INTO v_payer_sum
  FROM jsonb_array_elements(p_input->'payers') AS payer;

  IF v_payer_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Payer total (%) must equal amount_cents (%)', v_payer_sum, v_amount_cents;
  END IF;

  IF v_split_mode = 'custom' THEN
    SELECT COALESCE(SUM((s->>'share_cents')::BIGINT), 0)
    INTO v_custom_sum
    FROM jsonb_array_elements(p_input->'custom_splits') AS s;

    IF v_custom_sum <> v_amount_cents THEN
      RAISE EXCEPTION 'Custom split total (%) must equal amount_cents (%)', v_custom_sum, v_amount_cents;
    END IF;
  END IF;

  UPDATE expenses
  SET category_id  = v_category_id,
      item_name    = v_item_name,
      amount_cents = v_amount_cents,
      notes        = v_notes,
      expense_date = COALESCE(v_expense_date, expense_date)
  WHERE id = v_expense_id;

  DELETE FROM expense_items WHERE expense_id = v_expense_id;
  DELETE FROM expense_participants WHERE expense_id = v_expense_id;
  DELETE FROM expense_payers WHERE expense_id = v_expense_id;

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

  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

REVOKE ALL ON FUNCTION settleup.update_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.update_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- update_itemized_expense (expense_date preserved when the key is omitted)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.update_itemized_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id    UUID;
  v_category_id   UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_date  DATE;
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
  v_expense_id   := (p_input->>'expense_id')::UUID;
  v_category_id  := NULLIF(p_input->>'category_id', '')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';
  v_expense_date := NULLIF(p_input->>'expense_date', '')::DATE;

  IF v_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_id is required';
  END IF;
  IF v_item_name IS NULL OR length(v_item_name) = 0 THEN
    RAISE EXCEPTION 'item_name is required';
  END IF;
  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

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

  SELECT COALESCE(SUM((payer->>'paid_cents')::BIGINT), 0)
  INTO v_payer_sum
  FROM jsonb_array_elements(p_input->'payers') AS payer;

  IF v_payer_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Payer total (%) must equal amount_cents (%)', v_payer_sum, v_amount_cents;
  END IF;

  SELECT COALESCE(SUM((li->>'amount_cents')::BIGINT), 0)
  INTO v_item_sum
  FROM jsonb_array_elements(p_input->'line_items') AS li;

  IF v_item_sum <> v_amount_cents THEN
    RAISE EXCEPTION 'Line items total (%) must equal amount_cents (%)', v_item_sum, v_amount_cents;
  END IF;

  UPDATE expenses
  SET category_id  = v_category_id,
      item_name    = v_item_name,
      amount_cents = v_amount_cents,
      notes        = v_notes,
      expense_date = COALESCE(v_expense_date, expense_date)
  WHERE id = v_expense_id;

  DELETE FROM expense_items WHERE expense_id = v_expense_id;
  DELETE FROM expense_participants WHERE expense_id = v_expense_id;
  DELETE FROM expense_payers WHERE expense_id = v_expense_id;

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

  FOR v_member_id, v_share_cents IN
    SELECT key::UUID, value::BIGINT
    FROM jsonb_each_text(v_rollup)
  LOOP
    INSERT INTO expense_participants (expense_id, member_id, share_cents)
    VALUES (v_expense_id, v_member_id, v_share_cents);
  END LOOP;

  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

REVOKE ALL ON FUNCTION settleup.update_itemized_expense(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.update_itemized_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- materialize_recurring_expenses — stamp the scheduled run date
-- ---------------------------------------------------------------------------

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

    -- Everything below is per-template fault isolation: `payers` JSONB is
    -- member-writable via the API, so malformed content (bad UUIDs, null
    -- amounts, duplicate members hitting the expense_payers PK) must
    -- deactivate that one template — never abort the whole cron run.
    BEGIN
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
          (p->>'paid_cents')::BIGINT IS NOT NULL
          AND (p->>'paid_cents')::BIGINT > 0
          AND EXISTS (
            SELECT 1 FROM group_members gm
            WHERE gm.id = (p->>'member_id')::UUID
              AND gm.group_id = v_template.group_id
          )
        ), FALSE)
        AND COUNT(*) <= 20
        AND COUNT(*) = COUNT(DISTINCT p->>'member_id')
      INTO v_payer_sum, v_payers_valid
      FROM jsonb_array_elements(v_payers) p;

      IF array_length(v_member_ids, 1) IS NULL
         OR NOT v_payers_valid
         OR v_payer_sum <> v_template.amount_cents
      THEN
        UPDATE recurring_expenses SET active = FALSE WHERE id = v_template.id;
        CONTINUE;
      END IF;

      -- expense_date = the scheduled run date (honest under cron catch-up)
      INSERT INTO expenses (group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
      VALUES (
        v_template.group_id,
        v_template.category_id,
        v_template.item_name,
        v_template.amount_cents,
        'Auto · ' || v_template.cadence,
        v_template.next_run_at::date,
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
    EXCEPTION WHEN OTHERS THEN
      UPDATE recurring_expenses SET active = FALSE WHERE id = v_template.id;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION settleup.materialize_recurring_expenses() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_friend_view — expenses carry expense_date, ordered by it
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.get_friend_view(p_share_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_member_id    UUID;
  v_group_id     UUID;
  v_display_name TEXT;
  v_group_name   TEXT;
  v_owner_id     UUID;
  v_net_cents    BIGINT;
  v_profile      JSONB;
  v_expenses     JSONB;
  v_all_balances JSONB;
  v_creditor_profiles JSONB;
BEGIN
  SELECT gm.id, gm.group_id, gm.display_name, g.name, g.owner_user_id
  INTO v_member_id, v_group_id, v_display_name, v_group_name, v_owner_id
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.share_token = p_share_token
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  SELECT (
    COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = v_member_id AND p.status = 'PAID'), 0)
    + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = v_member_id AND p.status = 'PAID'), 0)
  ) INTO v_net_cents;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id', gm.id,
      'display_name', gm.display_name,
      'net_cents', (
        COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
      )
    )
  ), '[]'::jsonb)
  INTO v_all_balances
  FROM group_members gm
  WHERE gm.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id', gm.id,
      'display_name', gm.display_name,
      'gcash_name', up.gcash_name,
      'gcash_number', settleup.mask_account(up.gcash_number),
      'gcash_qr_url', up.gcash_qr_url,
      'bank_name', up.bank_name,
      'bank_account_name', up.bank_account_name,
      'bank_account_number', settleup.mask_account(up.bank_account_number),
      'bank_qr_url', up.bank_qr_url,
      'notes', up.notes
    )
  ), '[]'::jsonb)
  INTO v_creditor_profiles
  FROM group_members gm
  JOIN user_payment_profiles up ON up.user_id = gm.user_id
  WHERE gm.group_id = v_group_id
    AND gm.user_id IS NOT NULL
    AND (
      COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  SELECT jsonb_build_object(
    'payer_display_name', up.payer_display_name,
    'gcash_name', up.gcash_name,
    'gcash_number', settleup.mask_account(up.gcash_number),
    'bank_name', up.bank_name,
    'bank_account_name', up.bank_account_name,
    'bank_account_number', settleup.mask_account(up.bank_account_number),
    'notes', up.notes,
    'gcash_qr_url', up.gcash_qr_url,
    'bank_qr_url', up.bank_qr_url
  )
  INTO v_profile
  FROM user_payment_profiles up
  WHERE up.user_id = v_owner_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_name', e.item_name,
      'share_cents', ep.share_cents,
      'created_at', e.created_at,
      'expense_date', e.expense_date,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('name', ei.name, 'share_cents', eip.share_cents)
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM expense_item_participants eip
        JOIN expense_items ei ON ei.id = eip.item_id
        WHERE ei.expense_id = e.id AND eip.member_id = v_member_id
      )
    ) ORDER BY e.expense_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expense_participants ep
  JOIN expenses e ON e.id = ep.expense_id
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE ep.member_id = v_member_id;

  RETURN jsonb_build_object(
    'group', jsonb_build_object('id', v_group_id, 'name', v_group_name),
    'member', jsonb_build_object('id', v_member_id, 'display_name', v_display_name),
    'net_cents', v_net_cents,
    'owed_cents', GREATEST(0, -v_net_cents),
    'payment_profile', v_profile,
    'all_balances', v_all_balances,
    'creditor_profiles', v_creditor_profiles,
    'expenses', v_expenses
  );
END;
$$;

REVOKE ALL ON FUNCTION settleup.get_friend_view(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_group_overview — expenses carry expense_date, ordered by it
-- (QR behavior deliberately unchanged: accepted-by-design, July 2026)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.get_group_overview(p_share_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id   UUID;
  v_group_name TEXT;
  v_owner_id   UUID;
  v_members    JSONB;
  v_expenses   JSONB;
  v_payments   JSONB;
  v_profile    JSONB;
  v_creditor_profiles JSONB;
BEGIN
  SELECT id, name, owner_user_id
  INTO v_group_id, v_group_name, v_owner_id
  FROM groups WHERE share_token = p_share_token LIMIT 1;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id', gm.id,
      'display_name', gm.display_name,
      'net_cents', bal.net_cents,
      'owed_cents', GREATEST(0, -bal.net_cents)
    ) ORDER BY bal.net_cents ASC
  ), '[]'::jsonb)
  INTO v_members
  FROM group_members gm
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', e.id,
      'item_name', e.item_name,
      'amount_cents', e.amount_cents,
      'created_at', e.created_at,
      'expense_date', e.expense_date,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'payers', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('member_id', ep3.member_id, 'display_name', gm3.display_name, 'paid_cents', ep3.paid_cents)
          ORDER BY ep3.paid_cents DESC
        ), '[]'::jsonb)
        FROM expense_payers ep3
        JOIN group_members gm3 ON gm3.id = ep3.member_id
        WHERE ep3.expense_id = e.id
      ),
      'participants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('member_id', ep2.member_id, 'display_name', gm2.display_name, 'share_cents', ep2.share_cents)
        ), '[]'::jsonb)
        FROM expense_participants ep2
        JOIN group_members gm2 ON gm2.id = ep2.member_id
        WHERE ep2.expense_id = e.id
      ),
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'name', ei.name,
            'amount_cents', ei.amount_cents,
            'participants', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object('member_id', eip.member_id, 'display_name', gm4.display_name, 'share_cents', eip.share_cents)
              ), '[]'::jsonb)
              FROM expense_item_participants eip
              JOIN group_members gm4 ON gm4.id = eip.member_id
              WHERE eip.item_id = ei.id
            )
          )
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM expense_items ei WHERE ei.expense_id = e.id
      )
    ) ORDER BY e.expense_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'from_member_id', p.from_member_id,
      'from_display_name', gmf.display_name,
      'to_member_id', p.to_member_id,
      'to_display_name', gmt.display_name,
      'amount_cents', p.amount_cents,
      'created_at', p.created_at
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_payments
  FROM payments p
  JOIN group_members gmf ON gmf.id = p.from_member_id
  JOIN group_members gmt ON gmt.id = p.to_member_id
  WHERE p.group_id = v_group_id AND p.status = 'PAID';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id', gm.id,
      'display_name', gm.display_name,
      'gcash_name', up.gcash_name,
      'gcash_number', settleup.mask_account(up.gcash_number),
      'gcash_qr_url', up.gcash_qr_url,
      'bank_name', up.bank_name,
      'bank_account_name', up.bank_account_name,
      'bank_account_number', settleup.mask_account(up.bank_account_number),
      'bank_qr_url', up.bank_qr_url,
      'notes', up.notes
    )
  ), '[]'::jsonb)
  INTO v_creditor_profiles
  FROM group_members gm
  JOIN user_payment_profiles up ON up.user_id = gm.user_id
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id
    AND gm.user_id IS NOT NULL
    AND bal.net_cents > 0;

  SELECT jsonb_build_object(
    'payer_display_name', up.payer_display_name,
    'gcash_name', up.gcash_name,
    'gcash_number', settleup.mask_account(up.gcash_number),
    'bank_name', up.bank_name,
    'bank_account_name', up.bank_account_name,
    'bank_account_number', settleup.mask_account(up.bank_account_number),
    'notes', up.notes,
    'gcash_qr_url', up.gcash_qr_url,
    'bank_qr_url', up.bank_qr_url
  ) INTO v_profile
  FROM user_payment_profiles up WHERE up.user_id = v_owner_id;

  RETURN jsonb_build_object(
    'group', jsonb_build_object('id', v_group_id, 'name', v_group_name),
    'members', v_members,
    'expenses', v_expenses,
    'payments', v_payments,
    'payment_profile', v_profile,
    'creditor_profiles', v_creditor_profiles
  );
END;
$$;

REVOKE ALL ON FUNCTION settleup.get_group_overview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_user_activity — expense rows carry expense_date (feed order stays
-- created_at: it is a recency feed mixed with payments)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.get_user_activity(p_limit integer DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = settleup
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_result JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  WITH accessible_groups AS (
    SELECT g.id, g.name
    FROM groups g
    WHERE g.is_archived = FALSE
      AND (
        g.owner_user_id = v_user_id
        OR g.id IN (SELECT user_group_ids())
      )
  ),
  activity_rows AS (
    SELECT
      e.id,
      'expense'::TEXT AS activity_type,
      e.group_id,
      ag.name AS group_name,
      e.item_name,
      e.amount_cents,
      e.created_at,
      e.expense_date,
      CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END AS category,
      COALESCE((
        SELECT jsonb_agg(gm.display_name ORDER BY gm.display_name)
        FROM expense_payers ep
        JOIN group_members gm ON gm.id = ep.member_id
        WHERE ep.expense_id = e.id
      ), '[]'::JSONB) AS payer_names,
      NULL::TEXT AS from_name,
      NULL::TEXT AS to_name,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM expense_payers ep
          JOIN group_members gm ON gm.id = ep.member_id
          WHERE ep.expense_id = e.id AND gm.user_id = v_user_id
        ) THEN 'paid_by_you'
        WHEN EXISTS (
          SELECT 1 FROM expense_participants epa
          JOIN group_members gm ON gm.id = epa.member_id
          WHERE epa.expense_id = e.id AND gm.user_id = v_user_id
        ) THEN 'shared_with_you'
        ELSE 'group'
      END::TEXT AS relationship
    FROM expenses e
    JOIN accessible_groups ag ON ag.id = e.group_id
    LEFT JOIN expense_categories ec ON ec.id = e.category_id

    UNION ALL

    SELECT
      p.id,
      'payment'::TEXT AS activity_type,
      p.group_id,
      ag.name AS group_name,
      NULL::TEXT AS item_name,
      p.amount_cents,
      p.created_at,
      NULL::DATE AS expense_date,
      NULL::JSONB AS category,
      '[]'::JSONB AS payer_names,
      from_member.display_name AS from_name,
      to_member.display_name AS to_name,
      CASE
        WHEN from_member.user_id = v_user_id THEN 'paid_by_you'
        WHEN to_member.user_id = v_user_id THEN 'paid_you'
        ELSE 'group'
      END::TEXT AS relationship
    FROM payments p
    JOIN accessible_groups ag ON ag.id = p.group_id
    JOIN group_members from_member ON from_member.id = p.from_member_id
    JOIN group_members to_member ON to_member.id = p.to_member_id
    WHERE p.status = 'PAID'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', limited.id,
    'type', limited.activity_type,
    'group_id', limited.group_id,
    'group_name', limited.group_name,
    'item_name', limited.item_name,
    'amount_cents', limited.amount_cents,
    'created_at', limited.created_at,
    'expense_date', limited.expense_date,
    'category', limited.category,
    'payer_names', limited.payer_names,
    'from_name', limited.from_name,
    'to_name', limited.to_name,
    'relationship', limited.relationship
  ) ORDER BY limited.created_at DESC), '[]'::JSONB)
  INTO v_result
  FROM (
    SELECT * FROM activity_rows
    ORDER BY created_at DESC
    LIMIT v_limit
  ) AS limited;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION settleup.get_user_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_user_activity(integer) TO authenticated;
