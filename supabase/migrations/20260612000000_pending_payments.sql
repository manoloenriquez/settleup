-- Pending payments: friends can submit "I've paid" from their share link;
-- group members confirm or reject. PENDING payments do not affect balances —
-- every balance RPC below is redefined to count only status = 'PAID'.

-- ---------------------------------------------------------------------------
-- 1. Widen payments.status and add a note for payment references
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE settleup.payments
  ADD CONSTRAINT payments_status_check CHECK (status IN ('PAID', 'PENDING', 'REJECTED'));

ALTER TABLE settleup.payments
  ADD COLUMN IF NOT EXISTS note TEXT CHECK (char_length(note) <= 280);

CREATE INDEX IF NOT EXISTS payments_group_status_idx
  ON settleup.payments (group_id, status);

-- ---------------------------------------------------------------------------
-- 2. submit_friend_payment — anon-callable via member share token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.submit_friend_payment(
  p_share_token TEXT,
  p_to_member_id UUID,
  p_amount_cents BIGINT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_from_member group_members%ROWTYPE;
  v_to_group_id UUID;
  v_payment_id  UUID;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents <= 0 OR p_amount_cents > 100000000 THEN
    RAISE EXCEPTION 'Invalid amount';
  END IF;

  SELECT * INTO v_from_member
  FROM group_members
  WHERE share_token = p_share_token;

  IF v_from_member.id IS NULL THEN
    RAISE EXCEPTION 'Invalid share token';
  END IF;

  SELECT group_id INTO v_to_group_id
  FROM group_members
  WHERE id = p_to_member_id;

  IF v_to_group_id IS NULL OR v_to_group_id <> v_from_member.group_id THEN
    RAISE EXCEPTION 'Recipient is not in this group';
  END IF;

  IF p_to_member_id = v_from_member.id THEN
    RAISE EXCEPTION 'Cannot pay yourself';
  END IF;

  INSERT INTO payments (group_id, from_member_id, to_member_id, amount_cents, status, note)
  VALUES (v_from_member.group_id, v_from_member.id, p_to_member_id, p_amount_cents, 'PENDING', NULLIF(TRIM(p_note), ''))
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object('payment_id', v_payment_id);
END;
$$;

REVOKE ALL ON FUNCTION settleup.submit_friend_payment(TEXT, UUID, BIGINT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.submit_friend_payment(TEXT, UUID, BIGINT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. confirm_payment / reject_payment — creditor or group admin/owner only
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
    RAISE EXCEPTION 'Payment not found';
  END IF;
  IF v_payment.status <> 'PENDING' THEN
    RAISE EXCEPTION 'Payment is not pending';
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

REVOKE ALL ON FUNCTION settleup.resolve_pending_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.resolve_pending_payment(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION settleup.confirm_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = settleup
AS $$
  SELECT settleup.resolve_pending_payment(p_payment_id, 'PAID');
$$;

CREATE OR REPLACE FUNCTION settleup.reject_payment(p_payment_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = settleup
AS $$
  SELECT settleup.resolve_pending_payment(p_payment_id, 'REJECTED');
$$;

REVOKE ALL ON FUNCTION settleup.confirm_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.confirm_payment(UUID) TO authenticated;
REVOKE ALL ON FUNCTION settleup.reject_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.reject_payment(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Redefine balance RPCs to count only PAID payments
--    (latest definitions copied forward with status filters added)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.get_member_balances(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id',    gm.id,
      'display_name', gm.display_name,
      'slug',         gm.slug,
      'share_token',  gm.share_token,
      'user_id',      gm.user_id,
      'net_cents', (
        COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
      )
    ) ORDER BY gm.created_at ASC
  ), '[]'::jsonb) INTO v_result
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.group_id = p_group_id
    AND (
      g.owner_user_id = auth.uid()
      OR gm.group_id IN (SELECT user_group_ids())
    );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION settleup.get_groups_with_stats()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',               g.id,
      'name',             g.name,
      'owner_user_id',    g.owner_user_id,
      'invite_code',      g.invite_code,
      'is_archived',      g.is_archived,
      'share_token',      g.share_token,
      'created_at',       g.created_at,
      'member_count',     COALESCE(stats.member_count, 0),
      'pending_count',    COALESCE(stats.pending_count, 0),
      'total_owed_cents', COALESCE(stats.total_owed_cents, 0)
    ) ORDER BY g.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM groups g
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*)::int AS member_count,
      COUNT(*) FILTER (WHERE net < 0)::int AS pending_count,
      COALESCE(SUM(GREATEST(0, -net)), 0)::bigint AS total_owed_cents
    FROM (
      SELECT
        gm.id AS member_id,
        (
          COALESCE((SELECT SUM(ep.paid_cents) FROM expense_payers ep WHERE ep.member_id = gm.id), 0)
          - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
          - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
          + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
        ) AS net
      FROM group_members gm
      WHERE gm.group_id = g.id
    ) member_nets
  ) stats ON TRUE
  WHERE g.is_archived = FALSE
    AND (
      g.owner_user_id = auth.uid()
      OR g.id IN (SELECT user_group_ids())
    );

  RETURN v_result;
END;
$$;

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
      - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
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
    'payment_profile', v_profile,
    'creditor_profiles', v_creditor_profiles
  );
END;
$$;

CREATE OR REPLACE FUNCTION settleup.get_dashboard_summary()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = settleup
STABLE
AS $$
  WITH accessible_groups AS (
    SELECT
      g.id,
      g.name,
      g.created_at
    FROM groups g
    WHERE g.is_archived = FALSE
      AND (
        g.owner_user_id = auth.uid()
        OR g.id IN (SELECT user_group_ids())
      )
  ),
  paid_totals AS (
    SELECT
      ep.member_id,
      SUM(ep.paid_cents)::BIGINT AS paid_cents
    FROM expense_payers ep
    GROUP BY ep.member_id
  ),
  share_totals AS (
    SELECT
      epa.member_id,
      SUM(epa.share_cents)::BIGINT AS share_cents
    FROM expense_participants epa
    GROUP BY epa.member_id
  ),
  incoming_payment_totals AS (
    SELECT
      p.to_member_id AS member_id,
      SUM(p.amount_cents)::BIGINT AS amount_cents
    FROM payments p
    WHERE p.status = 'PAID'
    GROUP BY p.to_member_id
  ),
  outgoing_payment_totals AS (
    SELECT
      p.from_member_id AS member_id,
      SUM(p.amount_cents)::BIGINT AS amount_cents
    FROM payments p
    WHERE p.status = 'PAID'
    GROUP BY p.from_member_id
  ),
  member_nets AS (
    SELECT
      gm.group_id,
      gm.id AS member_id,
      gm.user_id,
      (
        COALESCE(pt.paid_cents, 0)
        - COALESCE(st.share_cents, 0)
        - COALESCE(ipt.amount_cents, 0)
        + COALESCE(opt.amount_cents, 0)
      )::BIGINT AS net_cents
    FROM group_members gm
    JOIN accessible_groups ag ON ag.id = gm.group_id
    LEFT JOIN paid_totals pt ON pt.member_id = gm.id
    LEFT JOIN share_totals st ON st.member_id = gm.id
    LEFT JOIN incoming_payment_totals ipt ON ipt.member_id = gm.id
    LEFT JOIN outgoing_payment_totals opt ON opt.member_id = gm.id
  ),
  group_summaries AS (
    SELECT
      ag.id,
      ag.name,
      ag.created_at,
      COUNT(mn.member_id)::INT AS member_count,
      COUNT(*) FILTER (WHERE mn.net_cents < 0)::INT AS pending_count,
      COALESCE(SUM(GREATEST(0, -mn.net_cents)), 0)::BIGINT AS total_owed_cents
    FROM accessible_groups ag
    LEFT JOIN member_nets mn ON mn.group_id = ag.id
    GROUP BY ag.id, ag.name, ag.created_at
  )
  SELECT jsonb_build_object(
    'net_balance_cents', (
      SELECT COALESCE(SUM(mn.net_cents) FILTER (WHERE mn.user_id = auth.uid()), 0)::BIGINT
      FROM member_nets mn
    ),
    'total_groups', (
      SELECT COUNT(*)::INT
      FROM group_summaries gs
    ),
    'total_unsettled_cents', (
      SELECT COALESCE(SUM(gs.total_owed_cents), 0)::BIGINT
      FROM group_summaries gs
    ),
    'pending_members', (
      SELECT COALESCE(SUM(gs.pending_count), 0)::BIGINT
      FROM group_summaries gs
    ),
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', gs.id,
          'name', gs.name,
          'member_count', gs.member_count,
          'pending_count', gs.pending_count,
          'total_owed_cents', gs.total_owed_cents,
          'created_at', gs.created_at
        )
        ORDER BY gs.created_at DESC
      )
      FROM group_summaries gs
    ), '[]'::JSONB)
  );
$$;


-- Re-assert grants for the redefined functions (CREATE OR REPLACE preserves
-- privileges, but be explicit to match the hardening migration).
REVOKE ALL ON FUNCTION settleup.get_member_balances(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_member_balances(UUID) TO authenticated;
REVOKE ALL ON FUNCTION settleup.get_groups_with_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_groups_with_stats() TO authenticated;
REVOKE ALL ON FUNCTION settleup.get_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_dashboard_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO anon, authenticated;
