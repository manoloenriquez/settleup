-- =============================================================================
-- Private beta payment RPCs
--
-- Centralizes payment creation/undo so web and mobile both set
-- created_by_user_id correctly and undo only payments the caller is allowed
-- to undo.
-- =============================================================================

CREATE OR REPLACE FUNCTION settleup.record_payment(
  p_group_id       UUID,
  p_from_member_id UUID,
  p_to_member_id   UUID,
  p_amount_cents   BIGINT
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

  INSERT INTO payments (
    group_id,
    from_member_id,
    to_member_id,
    amount_cents,
    created_by_user_id
  )
  VALUES (
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

GRANT EXECUTE ON FUNCTION settleup.record_payment(UUID, UUID, UUID, BIGINT) TO authenticated;

CREATE OR REPLACE FUNCTION settleup.undo_last_payment(
  p_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id    UUID;
  v_payment_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id INTO v_payment_id
  FROM payments
  WHERE group_id = p_group_id
    AND created_by_user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'No payment found to undo';
  END IF;

  DELETE FROM payments
  WHERE id = v_payment_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.undo_last_payment(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION settleup.undo_last_payment_for_member(
  p_from_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id    UUID;
  v_group_id   UUID;
  v_payment_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT group_id INTO v_group_id
  FROM group_members
  WHERE id = p_from_member_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  SELECT p.id INTO v_payment_id
  FROM payments p
  WHERE p.from_member_id = p_from_member_id
    AND (
      p.created_by_user_id = v_user_id
      OR settleup.is_group_admin_or_owner(v_group_id)
    )
  ORDER BY p.created_at DESC
  LIMIT 1;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'No payment found to undo';
  END IF;

  DELETE FROM payments
  WHERE id = v_payment_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.undo_last_payment_for_member(UUID) TO authenticated;
