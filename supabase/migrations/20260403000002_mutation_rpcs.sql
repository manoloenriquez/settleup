-- =============================================================================
-- Phase 1.3: Transactional mutation RPCs
--
-- Three SECURITY DEFINER functions that replace the multi-INSERT patterns
-- in the application layer with single atomic DB calls:
--
--   create_expense(p_input JSONB)          → replaces addExpense / addExpensesBatch
--   create_itemized_expense(p_input JSONB) → replaces addItemizedExpense
--   create_group_with_owner(p_name TEXT)   → replaces createGroup (web + mobile)
--
-- These functions run as the postgres role (SECURITY DEFINER) so they can
-- bypass RLS for their internal writes. They perform their own authorization
-- checks before doing any mutations.
--
-- The deferred constraint triggers from 20260403000001 validate sums and
-- group membership at COMMIT — within each function call, all inserts happen
-- inside the same implicit transaction.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper: SQL equivalent of the TypeScript equalSplit() utility
-- Divides total_cents evenly among n participants.
-- Distributes the remainder (total_cents % n) as one extra cent to the first
-- `remainder` participants — deterministically, ordered by their array position.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.equal_split(total_cents BIGINT, n INT)
RETURNS BIGINT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  base_amount BIGINT;
  remainder   INT;
  shares      BIGINT[];
  i           INT;
BEGIN
  IF n <= 0 THEN
    RAISE EXCEPTION 'n must be a positive integer, got %', n;
  END IF;
  base_amount := total_cents / n;
  remainder   := (total_cents % n)::INT;
  shares      := ARRAY[]::BIGINT[];
  FOR i IN 1..n LOOP
    IF i <= remainder THEN
      shares := array_append(shares, base_amount + 1);
    ELSE
      shares := array_append(shares, base_amount);
    END IF;
  END LOOP;
  RETURN shares;
END;
$$;

-- ---------------------------------------------------------------------------
-- Helper: generate a URL-safe slug unique within a group
-- Replicates the TypeScript generateSlug() utility
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.generate_unique_slug(
  p_display_name TEXT,
  p_group_id     UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix    INT := 2;
BEGIN
  base_slug := lower(regexp_replace(
    regexp_replace(trim(p_display_name), '\s+', '-', 'g'),
    '[^a-z0-9-]', '', 'g'
  ));

  candidate := base_slug;

  WHILE EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND slug = candidate
  ) LOOP
    candidate := base_slug || '-' || suffix;
    suffix    := suffix + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC 1: create_expense
--
-- Input JSONB shape:
-- {
--   "group_id":        "uuid",
--   "item_name":       "text",
--   "amount_cents":    1000,
--   "notes":           "optional text",  (optional)
--   "split_mode":      "equal" | "custom",
--   "participant_ids": ["uuid", ...],    (required if split_mode = "equal")
--   "custom_splits":   [{"member_id": "uuid", "share_cents": 500}, ...],
--                                        (required if split_mode = "custom")
--   "payers":          [{"member_id": "uuid", "paid_cents": 1000}]
-- }
--
-- Returns: { "expense": { ...expense row } }
-- Raises an exception on validation or integrity failure.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id      UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
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
  -- ---- Parse and validate input ----
  v_group_id     := (p_input->>'group_id')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';
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

  -- ---- Authorization: caller must be owner or linked member ----
  IF NOT EXISTS (
    SELECT 1 FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = auth.uid()
    WHERE g.id = v_group_id
      AND (g.owner_user_id = auth.uid() OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to add expenses to this group';
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

  -- ---- Insert expense ----
  INSERT INTO expenses (group_id, item_name, amount_cents, notes, created_by_user_id)
  VALUES (v_group_id, v_item_name, v_amount_cents, v_notes, auth.uid())
  RETURNING id INTO v_expense_id;

  -- ---- Insert participants ----
  IF v_split_mode = 'equal' THEN
    -- Collect participant IDs, sort for deterministic remainder distribution
    SELECT ARRAY(
      SELECT (val->>'')::UUID
      FROM jsonb_array_elements_text(p_input->'participant_ids') AS val
      ORDER BY val
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
    -- custom splits
    FOR v_participant IN SELECT * FROM jsonb_array_elements(p_input->'custom_splits') LOOP
      INSERT INTO expense_participants (expense_id, member_id, share_cents)
      VALUES (
        v_expense_id,
        (v_participant->>'member_id')::UUID,
        (v_participant->>'share_cents')::BIGINT
      );
    END LOOP;
  END IF;

  -- ---- Insert payers ----
  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  -- ---- Return created expense ----
  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.create_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC 2: create_itemized_expense
--
-- Input JSONB shape:
-- {
--   "group_id":    "uuid",
--   "item_name":   "text",
--   "amount_cents": 1000,
--   "notes":       "optional",
--   "payers":      [{"member_id": "uuid", "paid_cents": 1000}],
--   "line_items":  [
--     {"name": "text", "amount_cents": 500, "participant_ids": ["uuid", ...]},
--     ...
--   ]
-- }
--
-- Returns: { "expense": { ...expense row } }
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_itemized_expense(p_input JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_group_id      UUID;
  v_item_name     TEXT;
  v_amount_cents  BIGINT;
  v_notes         TEXT;
  v_expense_id    UUID;
  v_expense       JSONB;
  v_line_item     JSONB;
  v_item_id       UUID;
  v_payer         JSONB;
  v_participant   TEXT;
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
  -- ---- Parse and validate input ----
  v_group_id     := (p_input->>'group_id')::UUID;
  v_item_name    := trim(p_input->>'item_name');
  v_amount_cents := (p_input->>'amount_cents')::BIGINT;
  v_notes        := p_input->>'notes';

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required';
  END IF;
  IF v_item_name IS NULL OR length(v_item_name) = 0 THEN
    RAISE EXCEPTION 'item_name is required';
  END IF;
  IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
    RAISE EXCEPTION 'amount_cents must be positive';
  END IF;

  -- ---- Authorization ----
  IF NOT EXISTS (
    SELECT 1 FROM groups g
    LEFT JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = auth.uid()
    WHERE g.id = v_group_id
      AND (g.owner_user_id = auth.uid() OR gm.user_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Not authorized to add expenses to this group';
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

  -- ---- Insert expense ----
  INSERT INTO expenses (group_id, item_name, amount_cents, notes, created_by_user_id)
  VALUES (v_group_id, v_item_name, v_amount_cents, v_notes, auth.uid())
  RETURNING id INTO v_expense_id;

  -- ---- Process line items ----
  FOR v_line_item IN SELECT * FROM jsonb_array_elements(p_input->'line_items') LOOP
    -- Insert line item
    INSERT INTO expense_items (expense_id, name, amount_cents)
    VALUES (
      v_expense_id,
      trim(v_line_item->>'name'),
      (v_line_item->>'amount_cents')::BIGINT
    )
    RETURNING id INTO v_item_id;

    -- Compute equal split for line item participants
    SELECT ARRAY(
      SELECT (val->>'')::UUID
      FROM jsonb_array_elements_text(v_line_item->'participant_ids') AS val
      ORDER BY val
    ) INTO v_member_ids;

    IF array_length(v_member_ids, 1) IS NULL OR array_length(v_member_ids, 1) = 0 THEN
      RAISE EXCEPTION 'Each line item requires at least one participant_id';
    END IF;

    v_shares := settleup.equal_split(
      (v_line_item->>'amount_cents')::BIGINT,
      array_length(v_member_ids, 1)
    );

    -- Insert item participants and accumulate rollup
    FOR i IN 1..array_length(v_member_ids, 1) LOOP
      INSERT INTO expense_item_participants (item_id, member_id, share_cents)
      VALUES (v_item_id, v_member_ids[i], v_shares[i]);

      -- Accumulate into rollup JSONB map keyed by member_id
      v_existing := COALESCE((v_rollup->>(v_member_ids[i]::TEXT))::BIGINT, 0);
      v_rollup   := jsonb_set(
        v_rollup,
        ARRAY[v_member_ids[i]::TEXT],
        to_jsonb(v_existing + v_shares[i])
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

  -- ---- Insert payers ----
  FOR v_payer IN SELECT * FROM jsonb_array_elements(p_input->'payers') LOOP
    INSERT INTO expense_payers (expense_id, member_id, paid_cents)
    VALUES (
      v_expense_id,
      (v_payer->>'member_id')::UUID,
      (v_payer->>'paid_cents')::BIGINT
    );
  END LOOP;

  -- ---- Return created expense ----
  SELECT row_to_json(e)::JSONB INTO v_expense
  FROM expenses e WHERE e.id = v_expense_id;

  RETURN jsonb_build_object('expense', v_expense);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.create_itemized_expense(JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC 3: create_group_with_owner
--
-- Creates a group and atomically adds the caller as the first member (owner).
-- Replaces the 2-INSERT + best-effort rollback pattern in createGroup().
--
-- Returns: { "group": { ...group row }, "member": { ...member row } }
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_group_with_owner(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id     UUID;
  v_group_id    UUID;
  v_member_id   UUID;
  v_owner_name  TEXT;
  v_slug        TEXT;
  v_share_token TEXT;
  v_group       JSONB;
  v_member      JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate name
  IF trim(p_name) IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Group name is required';
  END IF;
  IF length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'Group name must be at most 100 characters';
  END IF;

  -- Fetch owner display name from profiles
  SELECT COALESCE(full_name, split_part(email, '@', 1), 'Me')
  INTO v_owner_name
  FROM public.profiles
  WHERE id = v_user_id;

  v_owner_name := COALESCE(v_owner_name, 'Me');

  -- Insert group (share_token auto-set by trigger set_group_share_token)
  INSERT INTO groups (name, owner_user_id)
  VALUES (trim(p_name), v_user_id)
  RETURNING id INTO v_group_id;

  -- Generate unique slug and share token for owner member
  v_slug        := settleup.generate_unique_slug(v_owner_name, v_group_id);
  v_share_token := encode(gen_random_bytes(16), 'base64');
  -- Use URL-safe base64 (replace +/ with -_) and strip padding
  v_share_token := replace(replace(replace(v_share_token, '+', '-'), '/', '_'), '=', '');

  -- Insert owner as first group member
  INSERT INTO group_members (group_id, display_name, slug, share_token, user_id)
  VALUES (v_group_id, v_owner_name, v_slug, v_share_token, v_user_id)
  RETURNING id INTO v_member_id;

  -- Return created group and member
  SELECT row_to_json(g)::JSONB INTO v_group FROM groups g WHERE g.id = v_group_id;
  SELECT row_to_json(m)::JSONB INTO v_member FROM group_members m WHERE m.id = v_member_id;

  RETURN jsonb_build_object('group', v_group, 'member', v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.create_group_with_owner(TEXT) TO authenticated;
