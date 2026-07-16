-- Offline-sync foundation: idempotent replays + edit conflict detection.
--
-- Both apps are gaining an offline outbox that replays queued writes when
-- connectivity returns. A replay must never duplicate a row (the request may
-- have committed before the response was lost) and a queued edit must not
-- silently clobber a change made from another device. This migration adds the
-- minimal server-side contract for that — fully backward compatible, every
-- new input key/parameter is optional so existing clients are unaffected:
--
-- 1. `updated_at` on settleup.expenses / settleup.payments (+ touch triggers),
--    backfilled from created_at.
-- 2. create_expense / create_itemized_expense accept an optional client-
--    generated `p_input->>'id'`. If a row with that id already exists and
--    belongs to the same group/creator, the existing row is returned with
--    `"replayed": true` instead of inserting a duplicate. A mismatched
--    owner/group raises SQLSTATE 'PT409' (PostgREST maps PTxxx → HTTP xxx).
--    create_expenses_batch needs no change: it delegates each item to
--    create_expense, so per-item ids flow through in one transaction.
-- 3. update_expense / update_itemized_expense accept an optional
--    `p_input->>'expected_updated_at'` compare-and-swap guard: a mismatch
--    raises 'PT409' ("modified by someone else"); a missing row now raises
--    with SQLSTATE 'PT404' so clients can distinguish deleted-elsewhere.
-- 4. record_payment gains an optional `p_id` idempotency key with the same
--    replay semantics (the old 4-arg overload is dropped to avoid ambiguity).
--
-- Function bodies are copied in full from their latest definitions:
--   create_expense / create_itemized_expense / update_expense /
--   update_itemized_expense → 20260715090000_expense_date.sql
--   record_payment           → 20260601000000_beta_payment_rpcs.sql
-- Only the idempotency/CAS lines are new; grants are re-stated verbatim.
--
-- Manual smoke test (documented for supabase db reset verification):
--   SELECT settleup.create_expense('{"id":"<uuid>", ...}');  -- twice:
--     first call inserts, second returns the same row + "replayed": true.
--   SELECT settleup.update_expense('{"expected_updated_at":"<stale>", ...}');
--     raises SQLSTATE PT409.
--   Calls without the new keys behave exactly as before.

-- ---------------------------------------------------------------------------
-- 1. updated_at columns + touch triggers
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.expenses
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE settleup.expenses SET updated_at = created_at;

ALTER TABLE settleup.payments
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE settleup.payments SET updated_at = created_at;

CREATE OR REPLACE FUNCTION settleup.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER expenses_touch_updated_at
  BEFORE UPDATE ON settleup.expenses
  FOR EACH ROW EXECUTE FUNCTION settleup.touch_updated_at();

CREATE TRIGGER payments_touch_updated_at
  BEFORE UPDATE ON settleup.payments
  FOR EACH ROW EXECUTE FUNCTION settleup.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2a. create_expense — optional client id (idempotent replay)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_id            UUID;
  v_group_id      UUID;
  v_category_id   UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_date  DATE;
  v_split_mode    TEXT;
  v_expense_id    UUID;
  v_expense       JSONB;
  v_replayed      expenses%ROWTYPE;
  v_participant   JSONB;
  v_payer         JSONB;
  v_member_ids    UUID[];
  v_shares        BIGINT[];
  v_payer_sum     BIGINT := 0;
  v_custom_sum    BIGINT := 0;
  i               INT;
BEGIN
  v_id           := NULLIF(p_input->>'id', '')::UUID;
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

  -- Idempotent replay: the client already created this row in an earlier
  -- attempt whose response was lost. Return it instead of duplicating.
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_replayed FROM expenses WHERE id = v_id;
    IF FOUND THEN
      IF v_replayed.group_id IS DISTINCT FROM v_group_id
         OR v_replayed.created_by_user_id IS DISTINCT FROM auth.uid()
      THEN
        RAISE EXCEPTION 'Client id conflict' USING ERRCODE = 'PT409';
      END IF;
      RETURN jsonb_build_object('expense', row_to_json(v_replayed)::JSONB, 'replayed', true);
    END IF;
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

  INSERT INTO expenses (id, group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
  VALUES (COALESCE(v_id, gen_random_uuid()), v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, v_expense_date, auth.uid())
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
-- 2b. create_itemized_expense — optional client id (idempotent replay)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_itemized_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_id            UUID;
  v_group_id      UUID;
  v_category_id   UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_date  DATE;
  v_expense_id    UUID;
  v_expense       JSONB;
  v_replayed      expenses%ROWTYPE;
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
  v_id           := NULLIF(p_input->>'id', '')::UUID;
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

  -- Idempotent replay (see create_expense).
  IF v_id IS NOT NULL THEN
    SELECT * INTO v_replayed FROM expenses WHERE id = v_id;
    IF FOUND THEN
      IF v_replayed.group_id IS DISTINCT FROM v_group_id
         OR v_replayed.created_by_user_id IS DISTINCT FROM auth.uid()
      THEN
        RAISE EXCEPTION 'Client id conflict' USING ERRCODE = 'PT409';
      END IF;
      RETURN jsonb_build_object('expense', row_to_json(v_replayed)::JSONB, 'replayed', true);
    END IF;
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

  INSERT INTO expenses (id, group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
  VALUES (COALESCE(v_id, gen_random_uuid()), v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, v_expense_date, auth.uid())
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
-- 3a. update_expense — optional expected_updated_at CAS; PT404 on missing row
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
  v_expected      TIMESTAMPTZ;
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
  v_expected     := NULLIF(p_input->>'expected_updated_at', '')::TIMESTAMPTZ;

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

  SELECT e.id, e.group_id, e.created_by_user_id, e.updated_at
  INTO v_existing
  FROM expenses e
  WHERE e.id = v_expense_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'PT404';
  END IF;

  IF v_existing.created_by_user_id IS DISTINCT FROM auth.uid()
     AND NOT settleup.is_group_admin_or_owner(v_existing.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to edit this expense';
  END IF;

  -- Compare-and-swap: reject an edit based on a stale snapshot so an offline
  -- replay can't silently clobber a change made from another device.
  IF v_expected IS NOT NULL AND v_existing.updated_at IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Expense was modified by someone else' USING ERRCODE = 'PT409';
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
-- 3b. update_itemized_expense — same CAS guard and PT404
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
  v_expected      TIMESTAMPTZ;
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
  v_expected     := NULLIF(p_input->>'expected_updated_at', '')::TIMESTAMPTZ;

  IF v_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_id is required';
  END IF;
  IF v_item_name IS NULL OR length(v_item_name) = 0 THEN
    RAISE EXCEPTION 'item_name is required';
  END IF;
  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  SELECT e.id, e.group_id, e.created_by_user_id, e.updated_at
  INTO v_existing
  FROM expenses e
  WHERE e.id = v_expense_id;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'PT404';
  END IF;

  IF v_existing.created_by_user_id IS DISTINCT FROM auth.uid()
     AND NOT settleup.is_group_admin_or_owner(v_existing.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to edit this expense';
  END IF;

  -- Compare-and-swap (see update_expense).
  IF v_expected IS NOT NULL AND v_existing.updated_at IS DISTINCT FROM v_expected THEN
    RAISE EXCEPTION 'Expense was modified by someone else' USING ERRCODE = 'PT409';
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
-- 4. record_payment — optional p_id idempotency key
--
-- The signature changes, so the old 4-arg overload must be dropped first:
-- keeping both would make 4-arg calls ambiguous once the new function's
-- p_id default exists. Old clients still call with 4 args — they resolve to
-- the new function with p_id = NULL and behave exactly as before.
-- ---------------------------------------------------------------------------

DROP FUNCTION settleup.record_payment(UUID, UUID, UUID, BIGINT);

CREATE FUNCTION settleup.record_payment(
  p_group_id       UUID,
  p_from_member_id UUID,
  p_to_member_id   UUID,
  p_amount_cents   BIGINT,
  p_id             UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id    UUID;
  v_from_group UUID;
  v_to_group   UUID;
  v_payment    JSONB;
  v_replayed   payments%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  IF p_from_member_id = p_to_member_id THEN
    RAISE EXCEPTION 'Cannot record a payment to the same member';
  END IF;

  SELECT group_id INTO v_from_group
  FROM group_members
  WHERE id = p_from_member_id;

  SELECT group_id INTO v_to_group
  FROM group_members
  WHERE id = p_to_member_id;

  IF v_from_group IS NULL OR v_to_group IS NULL THEN
    RAISE EXCEPTION 'Payment member not found';
  END IF;

  IF v_from_group IS DISTINCT FROM p_group_id OR v_to_group IS DISTINCT FROM p_group_id THEN
    RAISE EXCEPTION 'Payment members must belong to the payment group';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM groups g
    LEFT JOIN group_members gm
      ON gm.group_id = g.id
     AND gm.user_id = v_user_id
    WHERE g.id = p_group_id
      AND (g.owner_user_id = v_user_id OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to record payments in this group';
  END IF;

  -- Idempotent replay: the client already recorded this payment in an
  -- earlier attempt whose response was lost. Return it instead of
  -- double-counting; a mismatched replay is a conflict.
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_replayed FROM payments WHERE id = p_id;
    IF FOUND THEN
      IF v_replayed.group_id IS DISTINCT FROM p_group_id
         OR v_replayed.from_member_id IS DISTINCT FROM p_from_member_id
         OR v_replayed.to_member_id IS DISTINCT FROM p_to_member_id
         OR v_replayed.amount_cents IS DISTINCT FROM p_amount_cents
         OR v_replayed.created_by_user_id IS DISTINCT FROM v_user_id
      THEN
        RAISE EXCEPTION 'Client id conflict' USING ERRCODE = 'PT409';
      END IF;
      RETURN jsonb_build_object('payment', jsonb_build_object(
        'id', v_replayed.id,
        'group_id', v_replayed.group_id,
        'amount_cents', v_replayed.amount_cents,
        'status', v_replayed.status,
        'from_member_id', v_replayed.from_member_id,
        'to_member_id', v_replayed.to_member_id,
        'created_by_user_id', v_replayed.created_by_user_id,
        'created_at', v_replayed.created_at
      ), 'replayed', true);
    END IF;
  END IF;

  INSERT INTO payments (
    id,
    group_id,
    from_member_id,
    to_member_id,
    amount_cents,
    created_by_user_id
  )
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
    p_group_id,
    p_from_member_id,
    p_to_member_id,
    p_amount_cents,
    v_user_id
  )
  RETURNING jsonb_build_object(
    'id', payments.id,
    'group_id', payments.group_id,
    'amount_cents', payments.amount_cents,
    'status', payments.status,
    'from_member_id', payments.from_member_id,
    'to_member_id', payments.to_member_id,
    'created_by_user_id', payments.created_by_user_id,
    'created_at', payments.created_at
  )
  INTO v_payment;

  RETURN jsonb_build_object('payment', v_payment);
END;
$$;

REVOKE ALL ON FUNCTION settleup.record_payment(UUID, UUID, UUID, BIGINT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.record_payment(UUID, UUID, UUID, BIGINT, UUID) TO authenticated;
