-- =============================================================================
-- Expense categories: global defaults + group custom categories
-- =============================================================================

CREATE TABLE IF NOT EXISTS settleup.expense_categories (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id           UUID        REFERENCES settleup.groups(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  slug               TEXT        NOT NULL,
  icon               TEXT        NOT NULL DEFAULT 'circle-ellipsis',
  color              TEXT        NOT NULL DEFAULT '#6b7280',
  sort_order         INT         NOT NULL DEFAULT 0,
  is_default         BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_categories_name_check CHECK (length(trim(name)) BETWEEN 1 AND 80),
  CONSTRAINT expense_categories_slug_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT expense_categories_color_check CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  CONSTRAINT expense_categories_default_global_check CHECK (
    (is_default = FALSE) OR (group_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_global_slug_idx
  ON settleup.expense_categories (slug)
  WHERE group_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS expense_categories_group_slug_idx
  ON settleup.expense_categories (group_id, slug)
  WHERE group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS expense_categories_group_sort_idx
  ON settleup.expense_categories (group_id, sort_order, name);

ALTER TABLE settleup.expense_categories ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON settleup.expense_categories TO authenticated;

GRANT SELECT
  ON settleup.expense_categories TO anon;

DROP POLICY IF EXISTS "expense_categories_global_select" ON settleup.expense_categories;
CREATE POLICY "expense_categories_global_select"
  ON settleup.expense_categories FOR SELECT
  TO anon, authenticated
  USING (group_id IS NULL);

DROP POLICY IF EXISTS "expense_categories_member_select" ON settleup.expense_categories;
CREATE POLICY "expense_categories_member_select"
  ON settleup.expense_categories FOR SELECT
  TO authenticated
  USING (
    group_id IS NOT NULL
    AND group_id IN (SELECT settleup.user_group_ids())
  );

INSERT INTO settleup.expense_categories (name, slug, icon, color, sort_order, is_default)
VALUES
  ('Food & Drinks', 'food-drinks', 'utensils', '#ef4444', 10, TRUE),
  ('Groceries', 'groceries', 'shopping-basket', '#10b981', 20, TRUE),
  ('Transport', 'transport', 'car', '#3b82f6', 30, TRUE),
  ('Lodging', 'lodging', 'bed', '#8b5cf6', 40, TRUE),
  ('Activities', 'activities', 'ticket', '#f59e0b', 50, TRUE),
  ('Shopping', 'shopping', 'shopping-bag', '#ec4899', 60, TRUE),
  ('Supplies', 'supplies', 'package', '#14b8a6', 70, TRUE),
  ('Fees', 'fees', 'receipt', '#64748b', 80, TRUE),
  ('Other', 'other', 'circle-ellipsis', '#6b7280', 90, TRUE)
ON CONFLICT DO NOTHING;

ALTER TABLE settleup.expenses
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES settleup.expense_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS expenses_category_idx
  ON settleup.expenses (category_id);

UPDATE settleup.expenses
SET category_id = (
  SELECT id FROM settleup.expense_categories
  WHERE group_id IS NULL AND slug = 'other'
  LIMIT 1
)
WHERE category_id IS NULL;

CREATE OR REPLACE FUNCTION settleup.touch_expense_category_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = settleup
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_expense_category_updated_at
  ON settleup.expense_categories;

CREATE TRIGGER touch_expense_category_updated_at
  BEFORE UPDATE ON settleup.expense_categories
  FOR EACH ROW
  EXECUTE FUNCTION settleup.touch_expense_category_updated_at();

CREATE OR REPLACE FUNCTION settleup.apply_expense_category_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_category RECORD;
BEGIN
  IF NEW.category_id IS NULL THEN
    SELECT id INTO NEW.category_id
    FROM expense_categories
    WHERE group_id IS NULL AND slug = 'other'
    LIMIT 1;
  END IF;

  SELECT id, group_id
  INTO v_category
  FROM expense_categories
  WHERE id = NEW.category_id;

  IF v_category.id IS NULL THEN
    RAISE EXCEPTION 'Expense category not found';
  END IF;

  IF v_category.group_id IS NOT NULL AND v_category.group_id <> NEW.group_id THEN
    RAISE EXCEPTION 'Expense category does not belong to this group';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_expense_category_default
  ON settleup.expenses;

CREATE TRIGGER apply_expense_category_default
  BEFORE INSERT OR UPDATE OF group_id, category_id ON settleup.expenses
  FOR EACH ROW
  EXECUTE FUNCTION settleup.apply_expense_category_default();

CREATE OR REPLACE FUNCTION settleup.slugify_category_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = settleup
AS $$
  SELECT COALESCE(NULLIF(trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g')), ''), 'category');
$$;

CREATE OR REPLACE FUNCTION settleup.create_expense_category(
  p_group_id UUID,
  p_name     TEXT,
  p_icon     TEXT DEFAULT 'circle-ellipsis',
  p_color    TEXT DEFAULT '#6b7280'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_name       TEXT;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     INT := 1;
  v_category   JSONB;
  v_sort_order INT;
BEGIN
  v_name := trim(p_name);

  IF p_group_id IS NULL THEN
    RAISE EXCEPTION 'group_id is required';
  END IF;
  IF NOT settleup.is_group_admin_or_owner(p_group_id) THEN
    RAISE EXCEPTION 'Only group owners and admins can manage categories';
  END IF;
  IF v_name IS NULL OR length(v_name) = 0 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Category name must be 1-80 characters';
  END IF;
  IF COALESCE(p_color, '') !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Category color must be a 6-digit hex color';
  END IF;

  v_base_slug := settleup.slugify_category_name(v_name);
  v_slug := v_base_slug;

  WHILE EXISTS (
    SELECT 1 FROM expense_categories
    WHERE group_id = p_group_id AND slug = v_slug
  ) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::TEXT;
  END LOOP;

  SELECT COALESCE(MAX(sort_order), 90) + 10
  INTO v_sort_order
  FROM expense_categories
  WHERE group_id = p_group_id;

  INSERT INTO expense_categories (
    group_id, name, slug, icon, color, sort_order, is_default, created_by_user_id
  )
  VALUES (
    p_group_id,
    v_name,
    v_slug,
    COALESCE(NULLIF(trim(p_icon), ''), 'circle-ellipsis'),
    lower(p_color),
    v_sort_order,
    FALSE,
    auth.uid()
  )
  RETURNING row_to_json(expense_categories)::JSONB INTO v_category;

  RETURN jsonb_build_object('category', v_category);
END;
$$;

CREATE OR REPLACE FUNCTION settleup.update_expense_category(
  p_category_id UUID,
  p_name        TEXT,
  p_icon        TEXT,
  p_color       TEXT,
  p_sort_order  INT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_existing  expense_categories%ROWTYPE;
  v_name      TEXT;
  v_category  JSONB;
BEGIN
  SELECT * INTO v_existing
  FROM expense_categories
  WHERE id = p_category_id;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;
  IF v_existing.is_default THEN
    RAISE EXCEPTION 'Default categories cannot be changed';
  END IF;
  IF NOT settleup.is_group_admin_or_owner(v_existing.group_id) THEN
    RAISE EXCEPTION 'Only group owners and admins can manage categories';
  END IF;

  v_name := trim(p_name);
  IF v_name IS NULL OR length(v_name) = 0 OR length(v_name) > 80 THEN
    RAISE EXCEPTION 'Category name must be 1-80 characters';
  END IF;
  IF COALESCE(p_color, '') !~ '^#[0-9a-fA-F]{6}$' THEN
    RAISE EXCEPTION 'Category color must be a 6-digit hex color';
  END IF;

  UPDATE expense_categories
  SET name = v_name,
      icon = COALESCE(NULLIF(trim(p_icon), ''), icon),
      color = lower(p_color),
      sort_order = COALESCE(p_sort_order, sort_order)
  WHERE id = p_category_id
  RETURNING row_to_json(expense_categories)::JSONB INTO v_category;

  RETURN jsonb_build_object('category', v_category);
END;
$$;

CREATE OR REPLACE FUNCTION settleup.delete_expense_category(p_category_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_existing expense_categories%ROWTYPE;
  v_other_id UUID;
BEGIN
  SELECT * INTO v_existing
  FROM expense_categories
  WHERE id = p_category_id;

  IF v_existing.id IS NULL THEN
    RAISE EXCEPTION 'Category not found';
  END IF;
  IF v_existing.is_default THEN
    RAISE EXCEPTION 'Default categories cannot be deleted';
  END IF;
  IF NOT settleup.is_group_admin_or_owner(v_existing.group_id) THEN
    RAISE EXCEPTION 'Only group owners and admins can manage categories';
  END IF;

  SELECT id INTO v_other_id
  FROM expense_categories
  WHERE group_id IS NULL AND slug = 'other'
  LIMIT 1;

  UPDATE expenses
  SET category_id = v_other_id
  WHERE group_id = v_existing.group_id
    AND category_id = p_category_id;

  DELETE FROM expense_categories
  WHERE id = p_category_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.create_expense_category(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION settleup.update_expense_category(UUID, TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION settleup.delete_expense_category(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Expense mutation RPCs now accept optional category_id.
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

  INSERT INTO expenses (group_id, category_id, item_name, amount_cents, notes, created_by_user_id)
  VALUES (v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, auth.uid())
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

  INSERT INTO expenses (group_id, category_id, item_name, amount_cents, notes, created_by_user_id)
  VALUES (v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, auth.uid())
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
      notes        = v_notes
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
      notes        = v_notes
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

-- ---------------------------------------------------------------------------
-- Public share RPCs include category metadata without adding private data.
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
    - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = v_member_id), 0)
    + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = v_member_id), 0)
  ) INTO v_net_cents;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id', gm.id,
      'display_name', gm.display_name,
      'net_cents', (
        COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
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
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
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
    ) ORDER BY e.created_at DESC
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
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_name', e.item_name,
      'amount_cents', e.amount_cents,
      'created_at', e.created_at,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'participants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('display_name', gm2.display_name, 'share_cents', ep2.share_cents)
        ), '[]'::jsonb)
        FROM expense_participants ep2
        JOIN group_members gm2 ON gm2.id = ep2.member_id
        WHERE ep2.expense_id = e.id
      ),
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('name', ei.name, 'amount_cents', ei.amount_cents)
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM expense_items ei WHERE ei.expense_id = e.id
      )
    ) ORDER BY e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expenses e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.group_id = v_group_id;

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
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
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
    'payment_profile', v_profile,
    'creditor_profiles', v_creditor_profiles
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO authenticated;
