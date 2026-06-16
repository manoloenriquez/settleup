-- =============================================================================
-- get_creditor_profiles(p_group_id) — authenticated RPC
-- Returns unmasked payment profiles for linked members who are owed money.
-- =============================================================================

CREATE OR REPLACE FUNCTION settleup.get_creditor_profiles(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id UUID;
  v_result  JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Auth: caller must be a linked group member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id',           gm.id,
      'display_name',        gm.display_name,
      'gcash_name',          up.gcash_name,
      'gcash_number',        up.gcash_number,
      'gcash_qr_url',        up.gcash_qr_url,
      'bank_name',           up.bank_name,
      'bank_account_name',   up.bank_account_name,
      'bank_account_number', up.bank_account_number,
      'bank_qr_url',         up.bank_qr_url,
      'notes',               up.notes
    )
  ), '[]'::jsonb)
  INTO v_result
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
  WHERE gm.group_id = p_group_id
    AND gm.user_id IS NOT NULL
    AND bal.net_cents > 0;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_creditor_profiles(UUID) TO authenticated;
