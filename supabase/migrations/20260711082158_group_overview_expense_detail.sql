-- Enrich the public group overview payload so link viewers can understand
-- their balance: expense payers, participant member ids, per-item
-- participants, and the group's recorded (PAID) settlements.
-- Baseline copied from 20260612000000_pending_payments.sql (keeps the
-- status = 'PAID' filters and settleup.mask_account() masking).
-- Still excluded from the anonymous payload: expense notes, payment notes,
-- member share tokens, and user ids.

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
    ) ORDER BY e.created_at DESC
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
