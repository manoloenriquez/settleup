-- ---------------------------------------------------------------------------
-- Offline replay-safety for group create, category CRUD, and pending-payment
-- resolution, extending the contract from 20260716090000:
--
--   * create_group_with_owner / create_expense_category accept an optional
--     client-generated id; a replay with a matching row returns it with
--     "replayed": true, a mismatched replay raises SQLSTATE 'PT409'.
--   * update_expense_category accepts an optional expected_updated_at CAS
--     token (PT409 on mismatch) and raises PT404 when the row is gone.
--   * delete_expense_category treats a missing row as an already-applied
--     delete (success), mirroring expense deletes.
--   * resolve_pending_payment is idempotent per target status: resolving to
--     the status the payment already has returns "replayed": true; resolving
--     a payment that was resolved to the *other* status raises PT409;
--     a missing payment raises PT404.
--
-- All new parameters are optional — pre-offline clients keep working.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. create_group_with_owner(p_name, p_id DEFAULT NULL)
--    (body carried forward from 20260403000004; adds idempotent client id)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS settleup.create_group_with_owner(TEXT);

CREATE FUNCTION settleup.create_group_with_owner(p_name TEXT, p_id UUID DEFAULT NULL)
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
  v_existing    groups%ROWTYPE;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(p_name) IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Group name is required';
  END IF;
  IF length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'Group name must be at most 100 characters';
  END IF;

  -- Idempotent replay: the client id doubles as the group id.
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM groups WHERE id = p_id;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.owner_user_id = v_user_id AND v_existing.name = trim(p_name) THEN
        SELECT row_to_json(g)::JSONB INTO v_group FROM groups g WHERE g.id = p_id;
        SELECT row_to_json(m)::JSONB INTO v_member
        FROM group_members m
        WHERE m.group_id = p_id AND m.user_id = v_user_id
        ORDER BY m.created_at
        LIMIT 1;
        RETURN jsonb_build_object('group', v_group, 'member', v_member, 'replayed', TRUE);
      END IF;
      RAISE EXCEPTION 'Client id conflict' USING ERRCODE = 'PT409';
    END IF;
  END IF;

  SELECT COALESCE(full_name, split_part(email, '@', 1), 'Me')
  INTO v_owner_name
  FROM public.profiles
  WHERE id = v_user_id;

  v_owner_name := COALESCE(v_owner_name, 'Me');

  INSERT INTO groups (id, name, owner_user_id)
  VALUES (COALESCE(p_id, gen_random_uuid()), trim(p_name), v_user_id)
  RETURNING id INTO v_group_id;

  v_slug        := settleup.generate_unique_slug(v_owner_name, v_group_id);
  v_share_token := replace(replace(replace(
    encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '');

  INSERT INTO group_members (group_id, display_name, slug, share_token, user_id, role)
  VALUES (v_group_id, v_owner_name, v_slug, v_share_token, v_user_id, 'owner')
  RETURNING id INTO v_member_id;

  SELECT row_to_json(g)::JSONB INTO v_group FROM groups g WHERE g.id = v_group_id;
  SELECT row_to_json(m)::JSONB INTO v_member FROM group_members m WHERE m.id = v_member_id;

  RETURN jsonb_build_object('group', v_group, 'member', v_member);
END;
$$;

REVOKE ALL ON FUNCTION settleup.create_group_with_owner(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_group_with_owner(TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. create_expense_category(..., p_id DEFAULT NULL)
--    (body carried forward from 20260601000001; adds idempotent client id)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS settleup.create_expense_category(UUID, TEXT, TEXT, TEXT);

CREATE FUNCTION settleup.create_expense_category(
  p_group_id UUID,
  p_name     TEXT,
  p_icon     TEXT DEFAULT 'circle-ellipsis',
  p_color    TEXT DEFAULT '#6b7280',
  p_id       UUID DEFAULT NULL
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
  v_existing   expense_categories%ROWTYPE;
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

  -- Idempotent replay: the client id doubles as the category id.
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_existing FROM expense_categories WHERE id = p_id;
    IF v_existing.id IS NOT NULL THEN
      IF v_existing.group_id = p_group_id THEN
        SELECT row_to_json(c)::JSONB INTO v_category FROM expense_categories c WHERE c.id = p_id;
        RETURN jsonb_build_object('category', v_category, 'replayed', TRUE);
      END IF;
      RAISE EXCEPTION 'Client id conflict' USING ERRCODE = 'PT409';
    END IF;
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
    id, group_id, name, slug, icon, color, sort_order, is_default, created_by_user_id
  )
  VALUES (
    COALESCE(p_id, gen_random_uuid()),
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

REVOKE ALL ON FUNCTION settleup.create_expense_category(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_expense_category(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_expense_category(..., p_expected_updated_at DEFAULT NULL)
--    (body carried forward; adds CAS guard + PT404 on missing row)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS settleup.update_expense_category(UUID, TEXT, TEXT, TEXT, INT);

CREATE FUNCTION settleup.update_expense_category(
  p_category_id         UUID,
  p_name                TEXT,
  p_icon                TEXT,
  p_color               TEXT,
  p_sort_order          INT DEFAULT NULL,
  p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
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
    RAISE EXCEPTION 'Category not found' USING ERRCODE = 'PT404';
  END IF;
  IF v_existing.is_default THEN
    RAISE EXCEPTION 'Default categories cannot be changed';
  END IF;
  IF NOT settleup.is_group_admin_or_owner(v_existing.group_id) THEN
    RAISE EXCEPTION 'Only group owners and admins can manage categories';
  END IF;
  IF p_expected_updated_at IS NOT NULL
     AND v_existing.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'Category was modified by someone else' USING ERRCODE = 'PT409';
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

REVOKE ALL ON FUNCTION settleup.update_expense_category(UUID, TEXT, TEXT, TEXT, INT, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.update_expense_category(UUID, TEXT, TEXT, TEXT, INT, TIMESTAMPTZ) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. delete_expense_category — missing row now means "already deleted"
--    (same signature; body carried forward from 20260601000001)
-- ---------------------------------------------------------------------------

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

  -- A replayed delete finds nothing — that is success, not an error.
  IF v_existing.id IS NULL THEN
    RETURN jsonb_build_object('success', TRUE, 'replayed', TRUE);
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

-- ---------------------------------------------------------------------------
-- 5. resolve_pending_payment — idempotent per target status
--    (same signature; body carried forward from 20260612000000)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.resolve_pending_payment(
  p_payment_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id UUID;
  v_payment payments%ROWTYPE;
  v_is_creditor BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_new_status NOT IN ('PAID', 'REJECTED') THEN
    RAISE EXCEPTION 'Invalid status';
  END IF;

  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'Payment not found' USING ERRCODE = 'PT404';
  END IF;

  -- Replay of an already-applied resolution is success; a resolution that
  -- raced to the opposite status is a conflict the user must see.
  IF v_payment.status = p_new_status THEN
    RETURN jsonb_build_object('success', TRUE, 'replayed', TRUE);
  END IF;
  IF v_payment.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Payment was resolved differently elsewhere' USING ERRCODE = 'PT409';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM group_members gm
    WHERE gm.id = v_payment.to_member_id AND gm.user_id = v_user_id
  ) INTO v_is_creditor;

  IF NOT v_is_creditor AND NOT settleup.is_group_admin_or_owner(v_payment.group_id) THEN
    RAISE EXCEPTION 'Only the recipient or a group admin can resolve this payment';
  END IF;

  UPDATE payments SET status = p_new_status WHERE id = p_payment_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;
