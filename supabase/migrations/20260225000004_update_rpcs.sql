-- Update get_friend_view to use 4-source balance formula
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

  -- 4-source balance: paid_as_payer - shares + received_payments - sent_payments
  SELECT (
    COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = v_member_id), 0)
    + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = v_member_id), 0)
  ) INTO v_net_cents;

  -- Payment profile from user_payment_profiles
  SELECT jsonb_build_object(
    'payer_display_name',  up.payer_display_name,
    'gcash_name',          up.gcash_name,
    'gcash_number',        up.gcash_number,
    'bank_name',           up.bank_name,
    'bank_account_name',   up.bank_account_name,
    'bank_account_number', up.bank_account_number,
    'notes',               up.notes,
    'gcash_qr_url',        up.gcash_qr_url,
    'bank_qr_url',         up.bank_qr_url
  )
  INTO v_profile
  FROM user_payment_profiles up
  WHERE up.user_id = v_owner_id;

  -- Expense items for this member
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_name',   e.item_name,
      'share_cents', ep.share_cents,
      'created_at',  e.created_at
    ) ORDER BY e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expense_participants ep
  JOIN expenses e ON e.id = ep.expense_id
  WHERE ep.member_id = v_member_id;

  RETURN jsonb_build_object(
    'group',           jsonb_build_object('id', v_group_id, 'name', v_group_name),
    'member',          jsonb_build_object('id', v_member_id, 'display_name', v_display_name),
    'net_cents',       v_net_cents,
    'owed_cents',      GREATEST(0, -v_net_cents),
    'payment_profile', v_profile,
    'expenses',        v_expenses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO authenticated;

-- Update get_group_overview to use 4-source balance formula
CREATE OR REPLACE FUNCTION settleup.get_group_overview(p_share_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = settleup AS $$
DECLARE
  v_group_id   UUID;
  v_group_name TEXT;
  v_owner_id   UUID;
  v_members    JSONB;
  v_expenses   JSONB;
  v_profile    JSONB;
BEGIN
  SELECT id, name, owner_user_id
  INTO v_group_id, v_group_name, v_owner_id
  FROM groups WHERE share_token = p_share_token LIMIT 1;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  -- 4-source balance per member
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id',    gm.id,
      'display_name', gm.display_name,
      'net_cents',    bal.net_cents,
      'owed_cents',   GREATEST(0, -bal.net_cents)
    ) ORDER BY bal.net_cents ASC
  ), '[]'::jsonb)
  INTO v_members
  FROM group_members gm
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id;

  -- All expenses with per-participant breakdown
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_name',    e.item_name,
      'amount_cents', e.amount_cents,
      'created_at',   e.created_at,
      'participants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('display_name', gm2.display_name, 'share_cents', ep2.share_cents)
        ), '[]'::jsonb)
        FROM expense_participants ep2
        JOIN group_members gm2 ON gm2.id = ep2.member_id
        WHERE ep2.expense_id = e.id
      )
    ) ORDER BY e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expenses e WHERE e.group_id = v_group_id;

  -- Payment profile from user_payment_profiles
  SELECT jsonb_build_object(
    'payer_display_name',  up.payer_display_name,
    'gcash_name',          up.gcash_name,
    'gcash_number',        up.gcash_number,
    'bank_name',           up.bank_name,
    'bank_account_name',   up.bank_account_name,
    'bank_account_number', up.bank_account_number,
    'notes',               up.notes,
    'gcash_qr_url',        up.gcash_qr_url,
    'bank_qr_url',         up.bank_qr_url
  ) INTO v_profile
  FROM user_payment_profiles up WHERE up.user_id = v_owner_id;

  RETURN jsonb_build_object(
    'group',           jsonb_build_object('id', v_group_id, 'name', v_group_name),
    'members',         v_members,
    'expenses',        v_expenses,
    'payment_profile', v_profile
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO authenticated;
