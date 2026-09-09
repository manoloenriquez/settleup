-- Amount columns retain their legacy names for compatibility; they now hold
-- integer minor units of the adjacent currency_code, never converted values.
CREATE DOMAIN settleup.currency_code AS text CHECK (VALUE IS NOT NULL AND VALUE IN ('PHP','USD','EUR','GBP','CAD','AUD','NZD','JPY','CNY','HKD','SGD','TWD','KRW','INR','THB','VND','IDR','MYR','CHF','NOK','SEK','DKK','PLN','CZK','HUF','RON','BRL','MXN','ARS','CLP','COP','PEN','ZAR','AED','SAR','QAR','KWD','BHD','OMR','JOD','EGP','ILS','TRY','ISK','PKR','BDT','LKR','NPR','KES','NGN','UAH','MAD'));
ALTER TABLE settleup.groups ADD COLUMN default_currency_code settleup.currency_code NOT NULL DEFAULT 'PHP';
ALTER TABLE settleup.groups ADD COLUMN budget_currency_code settleup.currency_code NOT NULL DEFAULT 'PHP';
ALTER TABLE settleup.expenses ADD COLUMN currency_code settleup.currency_code NOT NULL DEFAULT 'PHP';
ALTER TABLE settleup.payments ADD COLUMN currency_code settleup.currency_code NOT NULL DEFAULT 'PHP';
ALTER TABLE settleup.recurring_expenses ADD COLUMN currency_code settleup.currency_code NOT NULL DEFAULT 'PHP';
CREATE INDEX expenses_group_currency_idx ON settleup.expenses(group_id,currency_code,expense_date);
CREATE INDEX payments_group_currency_idx ON settleup.payments(group_id,currency_code,status);

-- Compatibility boundary: older clients must never interpret foreign minor
-- units as pesos. Versioned RPCs below filter every money source explicitly.
CREATE FUNCTION settleup.has_currency_client()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(nullif(current_setting('request.headers',true),'')::jsonb->>'x-ledger-version','1')='2';
$$;
REVOKE ALL ON FUNCTION settleup.has_currency_client() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.has_currency_client() TO anon,authenticated;
CREATE POLICY expenses_currency_compatibility ON settleup.expenses AS RESTRICTIVE FOR SELECT TO authenticated
  USING (currency_code='PHP' OR settleup.has_currency_client());
CREATE POLICY payments_currency_compatibility ON settleup.payments AS RESTRICTIVE FOR SELECT TO authenticated
  USING (currency_code='PHP' OR settleup.has_currency_client());
CREATE POLICY recurring_expenses_currency_compatibility ON settleup.recurring_expenses AS RESTRICTIVE FOR SELECT TO authenticated
  USING (currency_code='PHP' OR settleup.has_currency_client());



CREATE OR REPLACE FUNCTION settleup.get_member_balances_v2(p_group_id uuid, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'member_id',    gm.id,
      'role', gm.role, 'departed_at', gm.departed_at, 'currency_code', p_currency_code,
      'display_name', gm.display_name,
      'slug',         gm.slug,
      'share_token',  gm.share_token,
      'user_id',      gm.user_id,
      'net_cents', (
        COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
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
$function$;

REVOKE ALL ON FUNCTION settleup.get_member_balances_v2(uuid,settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_member_balances_v2(uuid,settleup.currency_code) TO authenticated;



CREATE OR REPLACE FUNCTION settleup.get_creditor_profiles_v2(p_group_id uuid, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
    jsonb_build_object('currency_code', p_currency_code, 
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
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = p_group_id
    AND gm.user_id IS NOT NULL
    AND bal.net_cents > 0;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION settleup.get_creditor_profiles_v2(uuid,settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_creditor_profiles_v2(uuid,settleup.currency_code) TO authenticated;



CREATE OR REPLACE FUNCTION settleup.get_groups_with_stats_v2(p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'id',               g.id,
      'name',             g.name,
      'default_currency_code', g.default_currency_code, 'budget_currency_code', g.budget_currency_code, 'owner_user_id',    g.owner_user_id,
      'invite_code',      g.invite_code,
      'is_archived',      g.is_archived,
      'share_token',      g.share_token,
      'created_at',       g.created_at,
      'budget_cents',     g.budget_cents,
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
          COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
          - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
          - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
          + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
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
$function$;

REVOKE ALL ON FUNCTION settleup.get_groups_with_stats_v2(settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_groups_with_stats_v2(settleup.currency_code) TO authenticated;



CREATE OR REPLACE FUNCTION settleup.get_user_activity_v2(p_limit integer DEFAULT 30, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'settleup'
AS $function$
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
      CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object('currency_code', p_currency_code, 
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END AS category,
      COALESCE((
        SELECT jsonb_agg(gm.display_name ORDER BY gm.display_name)
        FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep
        JOIN group_members gm ON gm.id = ep.member_id
        WHERE ep.expense_id = e.id
      ), '[]'::JSONB) AS payer_names,
      NULL::TEXT AS from_name,
      NULL::TEXT AS to_name,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep
          JOIN group_members gm ON gm.id = ep.member_id
          WHERE ep.expense_id = e.id AND gm.user_id = v_user_id
        ) THEN 'paid_by_you'
        WHEN EXISTS (
          SELECT 1 FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa
          JOIN group_members gm ON gm.id = epa.member_id
          WHERE epa.expense_id = e.id AND gm.user_id = v_user_id
        ) THEN 'shared_with_you'
        ELSE 'group'
      END::TEXT AS relationship
    FROM (SELECT * FROM settleup.expenses WHERE currency_code=p_currency_code) e
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
    FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p
    JOIN accessible_groups ag ON ag.id = p.group_id
    JOIN group_members from_member ON from_member.id = p.from_member_id
    JOIN group_members to_member ON to_member.id = p.to_member_id
    WHERE p.status = 'PAID'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('currency_code', p_currency_code, 
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
$function$;

REVOKE ALL ON FUNCTION settleup.get_user_activity_v2(integer,settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_user_activity_v2(integer,settleup.currency_code) TO authenticated;



CREATE OR REPLACE FUNCTION settleup.get_dashboard_summary_v2(p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
    FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep
    GROUP BY ep.member_id
  ),
  share_totals AS (
    SELECT
      epa.member_id,
      SUM(epa.share_cents)::BIGINT AS share_cents
    FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa
    GROUP BY epa.member_id
  ),
  incoming_payment_totals AS (
    SELECT
      p.to_member_id AS member_id,
      SUM(p.amount_cents)::BIGINT AS amount_cents
    FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p
    WHERE p.status = 'PAID'
    GROUP BY p.to_member_id
  ),
  outgoing_payment_totals AS (
    SELECT
      p.from_member_id AS member_id,
      SUM(p.amount_cents)::BIGINT AS amount_cents
    FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p
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
  my_nets AS (
    SELECT
      mn.group_id,
      SUM(mn.net_cents)::BIGINT AS my_net_cents
    FROM member_nets mn
    WHERE mn.user_id = auth.uid()
    GROUP BY mn.group_id
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
  ),
  -- Counterparties are members on the opposite balance sign in groups where I
  -- have a non-zero net. Net-sign approximation (not simplified-debt edges) —
  -- good enough for "from N people" labels.
  counterparties AS (
    SELECT
      COUNT(DISTINCT mn.member_id) FILTER (
        WHERE mn.net_cents < 0 AND myn.my_net_cents > 0
      )::INT AS owed_counterparty_count,
      COUNT(DISTINCT mn.member_id) FILTER (
        WHERE mn.net_cents > 0 AND myn.my_net_cents < 0
      )::INT AS owe_counterparty_count
    FROM member_nets mn
    JOIN my_nets myn ON myn.group_id = mn.group_id
    WHERE mn.user_id IS DISTINCT FROM auth.uid()
  ),
  -- v4: the user's own daily expense share over the last 30 days (zero-filled)
  spend_series AS (
    SELECT
      d.day::date AS day,
      COALESCE(s.amount_cents, 0)::BIGINT AS amount_cents
    FROM generate_series(
      (CURRENT_DATE - 29)::timestamp,
      CURRENT_DATE::timestamp,
      INTERVAL '1 day'
    ) AS d(day)
    LEFT JOIN (
      SELECT
        e.expense_date AS day,
        SUM(epa.share_cents)::BIGINT AS amount_cents
      FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa
      JOIN group_members gm ON gm.id = epa.member_id AND gm.user_id = auth.uid()
      JOIN (SELECT * FROM settleup.expenses WHERE currency_code=p_currency_code) e ON e.id = epa.expense_id
      JOIN accessible_groups ag ON ag.id = e.group_id
      WHERE e.expense_date >= CURRENT_DATE - 29
      GROUP BY e.expense_date
    ) s ON s.day = d.day::date
  )
  SELECT jsonb_build_object('currency_code', p_currency_code, 
    'net_balance_cents', (
      SELECT COALESCE(SUM(mn.net_cents) FILTER (WHERE mn.user_id = auth.uid()), 0)::BIGINT
      FROM member_nets mn
    ),
    -- Keys from 20260713175129_emerald_dashboard_activity (exact formulas preserved)
    'total_owed_to_user_cents', (
      SELECT COALESCE(SUM(GREATEST(mn.net_cents, 0)) FILTER (WHERE mn.user_id = auth.uid()), 0)::BIGINT
      FROM member_nets mn
    ),
    'total_user_owes_cents', (
      SELECT COALESCE(SUM(GREATEST(-mn.net_cents, 0)) FILTER (WHERE mn.user_id = auth.uid()), 0)::BIGINT
      FROM member_nets mn
    ),
    'recent_activity', settleup.get_user_activity_v2(5, p_currency_code),
    -- Keys from the worktree redesign
    'owed_to_me_cents', (
      SELECT COALESCE(SUM(GREATEST(0, myn.my_net_cents)), 0)::BIGINT
      FROM my_nets myn
    ),
    'i_owe_cents', (
      SELECT COALESCE(SUM(GREATEST(0, -myn.my_net_cents)), 0)::BIGINT
      FROM my_nets myn
    ),
    'owed_counterparty_count', (
      SELECT COALESCE(cp.owed_counterparty_count, 0)::INT FROM counterparties cp
    ),
    'owe_counterparty_count', (
      SELECT COALESCE(cp.owe_counterparty_count, 0)::INT FROM counterparties cp
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
    -- v4 key
    'spend_series', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('currency_code', p_currency_code, 'date', ss.day, 'amount_cents', ss.amount_cents)
        ORDER BY ss.day
      )
      FROM spend_series ss
    ), '[]'::JSONB),
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('currency_code', p_currency_code, 
          'id', gs.id,
          'name', gs.name,
          'member_count', gs.member_count,
          'pending_count', gs.pending_count,
          'total_owed_cents', gs.total_owed_cents,
          'my_net_cents', COALESCE(myn.my_net_cents, 0),
          'created_at', gs.created_at
        )
        ORDER BY gs.created_at DESC
      )
      FROM group_summaries gs
      LEFT JOIN my_nets myn ON myn.group_id = gs.id
    ), '[]'::JSONB)
  );
$function$;

REVOKE ALL ON FUNCTION settleup.get_dashboard_summary_v2(settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_dashboard_summary_v2(settleup.currency_code) TO authenticated;



CREATE OR REPLACE FUNCTION settleup.get_friend_view_v2(p_share_token text, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
    RETURN jsonb_build_object('currency_code', p_currency_code, 'error', 'Not found');
  END IF;

  SELECT (
    COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = v_member_id AND p.status = 'PAID'), 0)
    + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = v_member_id AND p.status = 'PAID'), 0)
  ) INTO v_net_cents;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'member_id', gm.id,
      'display_name', gm.display_name,
      'net_cents', (
        COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
      )
    )
  ), '[]'::jsonb)
  INTO v_all_balances
  FROM group_members gm
  WHERE gm.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
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
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  SELECT jsonb_build_object('currency_code', p_currency_code, 
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
    jsonb_build_object('currency_code', p_currency_code, 
      'item_name', e.item_name,
      'share_cents', ep.share_cents,
      'created_at', e.created_at,
      'expense_date', e.expense_date,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object('currency_code', p_currency_code, 
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 'name', ei.name, 'share_cents', eip.share_cents)
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_item_participants x JOIN settleup.expense_items xi ON xi.id=x.item_id JOIN settleup.expenses xe ON xe.id=xi.expense_id WHERE xe.currency_code=p_currency_code) eip
        JOIN (SELECT x.* FROM settleup.expense_items x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ei ON ei.id = eip.item_id
        WHERE ei.expense_id = e.id AND eip.member_id = v_member_id
      )
    ) ORDER BY e.expense_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep
  JOIN (SELECT * FROM settleup.expenses WHERE currency_code=p_currency_code) e ON e.id = ep.expense_id
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE ep.member_id = v_member_id;

  RETURN jsonb_build_object('currency_code', p_currency_code, 
    'group', jsonb_build_object('currency_code', p_currency_code, 'id', v_group_id, 'name', v_group_name),
    'member', jsonb_build_object('currency_code', p_currency_code, 'id', v_member_id, 'display_name', v_display_name),
    'net_cents', v_net_cents,
    'owed_cents', GREATEST(0, -v_net_cents),
    'payment_profile', v_profile,
    'all_balances', v_all_balances,
    'creditor_profiles', v_creditor_profiles,
    'expenses', v_expenses
  );
END;
$function$;

REVOKE ALL ON FUNCTION settleup.get_friend_view_v2(text,settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view_v2(text,settleup.currency_code) TO anon,authenticated;



CREATE OR REPLACE FUNCTION settleup.get_group_overview_v2(p_share_token text, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
    RETURN jsonb_build_object('currency_code', p_currency_code, 'error', 'Not found');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
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
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'id', e.id,
      'item_name', e.item_name,
      'amount_cents', e.amount_cents,
      'created_at', e.created_at,
      'expense_date', e.expense_date,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object('currency_code', p_currency_code, 
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'payers', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 'member_id', ep3.member_id, 'display_name', gm3.display_name, 'paid_cents', ep3.paid_cents)
          ORDER BY ep3.paid_cents DESC
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep3
        JOIN group_members gm3 ON gm3.id = ep3.member_id
        WHERE ep3.expense_id = e.id
      ),
      'participants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 'member_id', ep2.member_id, 'display_name', gm2.display_name, 'share_cents', ep2.share_cents)
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep2
        JOIN group_members gm2 ON gm2.id = ep2.member_id
        WHERE ep2.expense_id = e.id
      ),
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 
            'name', ei.name,
            'amount_cents', ei.amount_cents,
            'participants', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object('currency_code', p_currency_code, 'member_id', eip.member_id, 'display_name', gm4.display_name, 'share_cents', eip.share_cents)
              ), '[]'::jsonb)
              FROM (SELECT x.* FROM settleup.expense_item_participants x JOIN settleup.expense_items xi ON xi.id=x.item_id JOIN settleup.expenses xe ON xe.id=xi.expense_id WHERE xe.currency_code=p_currency_code) eip
              JOIN group_members gm4 ON gm4.id = eip.member_id
              WHERE eip.item_id = ei.id
            )
          )
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_items x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ei WHERE ei.expense_id = e.id
      )
    ) ORDER BY e.expense_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM (SELECT * FROM settleup.expenses WHERE currency_code=p_currency_code) e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'from_member_id', p.from_member_id,
      'from_display_name', gmf.display_name,
      'to_member_id', p.to_member_id,
      'to_display_name', gmt.display_name,
      'amount_cents', p.amount_cents,
      'created_at', p.created_at
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_payments
  FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p
  JOIN group_members gmf ON gmf.id = p.from_member_id
  JOIN group_members gmt ON gmt.id = p.to_member_id
  WHERE p.group_id = v_group_id AND p.status = 'PAID';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
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
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id
    AND gm.user_id IS NOT NULL
    AND bal.net_cents > 0;

  SELECT jsonb_build_object('currency_code', p_currency_code, 
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

  RETURN jsonb_build_object('currency_code', p_currency_code, 
    'group', jsonb_build_object('currency_code', p_currency_code, 'id', v_group_id, 'name', v_group_name),
    'members', v_members,
    'expenses', v_expenses,
    'payments', v_payments,
    'payment_profile', v_profile,
    'creditor_profiles', v_creditor_profiles
  );
END;
$function$;

REVOKE ALL ON FUNCTION settleup.get_group_overview_v2(text,settleup.currency_code) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview_v2(text,settleup.currency_code) TO anon,authenticated;

CREATE OR REPLACE FUNCTION settleup.create_expense(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
      IF v_replayed.currency_code IS DISTINCT FROM COALESCE(p_input->>'currency_code','PHP') OR v_replayed.amount_cents IS DISTINCT FROM v_amount_cents OR v_replayed.item_name IS DISTINCT FROM v_item_name OR v_replayed.group_id IS DISTINCT FROM v_group_id
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

  INSERT INTO expenses (currency_code, id, group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
  VALUES (COALESCE(p_input->>'currency_code','PHP')::settleup.currency_code, COALESCE(v_id, gen_random_uuid()), v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, v_expense_date, auth.uid())
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
$function$;


CREATE OR REPLACE FUNCTION settleup.create_itemized_expense(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
      IF v_replayed.currency_code IS DISTINCT FROM COALESCE(p_input->>'currency_code','PHP') OR v_replayed.amount_cents IS DISTINCT FROM v_amount_cents OR v_replayed.item_name IS DISTINCT FROM v_item_name OR v_replayed.group_id IS DISTINCT FROM v_group_id
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

  INSERT INTO expenses (currency_code, id, group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
  VALUES (COALESCE(p_input->>'currency_code','PHP')::settleup.currency_code, COALESCE(v_id, gen_random_uuid()), v_group_id, v_category_id, v_item_name, v_amount_cents, v_notes, v_expense_date, auth.uid())
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
$function$;


CREATE OR REPLACE FUNCTION settleup.materialize_recurring_expenses()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
      INSERT INTO expenses (currency_code, group_id, category_id, item_name, amount_cents, notes, expense_date, created_by_user_id)
      VALUES (
        v_template.currency_code,
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
$function$;


CREATE FUNCTION settleup.submit_friend_payment_v2(p_share_token text,p_to_member_id uuid,p_amount_cents bigint,p_request_id uuid,p_note text DEFAULT NULL,p_currency_code settleup.currency_code DEFAULT 'PHP')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m settleup.group_members%ROWTYPE; previous settleup.payments%ROWTYPE; payment_id uuid; attempts integer;
BEGIN
  IF p_share_token IS NULL OR length(p_share_token)>128 OR p_request_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0 OR p_amount_cents>100000000 OR length(p_note)>280 THEN RAISE EXCEPTION 'Invalid payment report'; END IF;
  -- Serialize reports for the member, including retries with the same id.
  SELECT * INTO m FROM settleup.group_members WHERE share_token=p_share_token FOR UPDATE;
  IF m.id IS NULL OR m.departed_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid share link'; END IF;
  IF NOT EXISTS(SELECT 1 FROM settleup.groups WHERE id=m.group_id AND NOT is_archived AND owner_user_id IS NOT NULL) THEN RAISE EXCEPTION 'This group is read-only'; END IF;
  SELECT * INTO previous FROM settleup.payments WHERE from_member_id=m.id AND report_request_id=p_request_id;
  IF previous.id IS NOT NULL THEN
    IF previous.currency_code<>p_currency_code OR previous.to_member_id<>p_to_member_id OR previous.amount_cents<>p_amount_cents OR previous.note IS DISTINCT FROM nullif(trim(p_note),'') THEN RAISE EXCEPTION 'Payment report differs from the original submission' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('currency_code',p_currency_code,'payment_id',previous.id,'status',previous.status);
  END IF;
  IF p_to_member_id=m.id OR NOT EXISTS(SELECT 1 FROM settleup.group_members WHERE id=p_to_member_id AND group_id=m.group_id AND departed_at IS NULL) THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  INSERT INTO settleup.public_write_limits AS limits(member_id,window_start,attempts) VALUES(m.id,now(),1)
  ON CONFLICT(member_id) DO UPDATE SET
    attempts=CASE WHEN limits.window_start<=now()-interval '5 minutes' THEN 1 ELSE limits.attempts+1 END,
    window_start=CASE WHEN limits.window_start<=now()-interval '5 minutes' THEN now() ELSE limits.window_start END
  RETURNING limits.attempts INTO attempts;
  IF attempts>5 THEN RAISE EXCEPTION 'Too many reports. Try again in five minutes.' USING ERRCODE='PT429'; END IF;
  INSERT INTO settleup.payments(currency_code,group_id,from_member_id,to_member_id,amount_cents,status,note,report_request_id)
  VALUES(p_currency_code,m.group_id,m.id,p_to_member_id,p_amount_cents,'PENDING',nullif(trim(p_note),''),p_request_id) RETURNING id INTO payment_id;
  RETURN jsonb_build_object('currency_code',p_currency_code,'payment_id',payment_id,'status','PENDING');
END; $$;

REVOKE ALL ON FUNCTION settleup.submit_friend_payment_v2(text,uuid,bigint,uuid,text,settleup.currency_code) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.submit_friend_payment_v2(text,uuid,bigint,uuid,text,settleup.currency_code) TO anon,authenticated;

CREATE FUNCTION settleup.guard_currency_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.currency_code IS DISTINCT FROM OLD.currency_code THEN RAISE EXCEPTION 'Currency cannot change on a recorded amount. Delete and re-enter the expense or payment with the correct currency.' USING ERRCODE='PT409'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION settleup.guard_currency_change() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_currency_change BEFORE UPDATE ON settleup.expenses FOR EACH ROW EXECUTE FUNCTION settleup.guard_currency_change();
CREATE TRIGGER guard_currency_change BEFORE UPDATE ON settleup.payments FOR EACH ROW EXECUTE FUNCTION settleup.guard_currency_change();

CREATE FUNCTION settleup.record_payment_v2(p_group_id uuid,p_from_member_id uuid,p_to_member_id uuid,p_amount_cents bigint,p_id uuid,p_currency_code settleup.currency_code)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE previous settleup.payments%ROWTYPE; payment settleup.payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM settleup.group_members WHERE group_id=p_group_id AND user_id=auth.uid() AND departed_at IS NULL) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0 OR p_amount_cents>100000000 OR p_from_member_id=p_to_member_id THEN RAISE EXCEPTION 'Invalid payment'; END IF;
  IF (SELECT count(*) FROM settleup.group_members WHERE group_id=p_group_id AND id IN (p_from_member_id,p_to_member_id))<>2 THEN RAISE EXCEPTION 'Payment members must belong to this group'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,712));
  SELECT * INTO previous FROM settleup.payments WHERE id=p_id;
  IF previous.id IS NOT NULL THEN
    IF previous.group_id<>p_group_id OR previous.from_member_id<>p_from_member_id OR previous.to_member_id<>p_to_member_id OR previous.amount_cents<>p_amount_cents OR previous.currency_code<>p_currency_code OR previous.created_by_user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Payment differs from the original submission' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('payment',to_jsonb(previous),'replayed',true);
  END IF;
  INSERT INTO settleup.payments(id,group_id,from_member_id,to_member_id,amount_cents,currency_code,status,created_by_user_id)
    VALUES(p_id,p_group_id,p_from_member_id,p_to_member_id,p_amount_cents,p_currency_code,'PAID',auth.uid()) RETURNING * INTO payment;
  RETURN jsonb_build_object('payment',to_jsonb(payment));
END; $$;
REVOKE ALL ON FUNCTION settleup.record_payment_v2(uuid,uuid,uuid,bigint,uuid,settleup.currency_code) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.record_payment_v2(uuid,uuid,uuid,bigint,uuid,settleup.currency_code) TO authenticated;

CREATE FUNCTION settleup.create_group_v2(p_name text,p_id uuid,p_currency_code settleup.currency_code,p_display_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g settleup.groups%ROWTYPE; member_name text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_name IS NULL OR length(trim(p_name)) NOT BETWEEN 1 AND 100 OR p_display_name IS NULL OR length(trim(p_display_name)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Enter your name and a group name'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_id::text,713));
  SELECT * INTO g FROM settleup.groups WHERE id=p_id;
  IF g.id IS NOT NULL THEN
    SELECT display_name INTO member_name FROM settleup.group_members WHERE group_id=p_id AND user_id=auth.uid();
    IF g.owner_user_id IS DISTINCT FROM auth.uid() OR g.name<>trim(p_name) OR g.default_currency_code<>p_currency_code OR member_name IS DISTINCT FROM trim(p_display_name) THEN RAISE EXCEPTION 'Group differs from original submission' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('group',to_jsonb(g),'replayed',true);
  END IF;
  PERFORM settleup.create_group_with_owner(p_name,p_id);
  UPDATE settleup.groups SET default_currency_code=p_currency_code,budget_currency_code=p_currency_code WHERE id=p_id RETURNING * INTO g;
  UPDATE settleup.group_members SET display_name=trim(p_display_name),slug=settleup.generate_unique_slug(p_display_name,p_id) WHERE group_id=p_id AND user_id=auth.uid();
  RETURN jsonb_build_object('group',to_jsonb(g));
END; $$;
REVOKE ALL ON FUNCTION settleup.create_group_v2(text,uuid,settleup.currency_code,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.create_group_v2(text,uuid,settleup.currency_code,text) TO authenticated;

CREATE FUNCTION settleup.set_group_budget_v2(p_group_id uuid,p_budget_cents bigint,p_currency_code settleup.currency_code)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT settleup.is_group_admin_or_owner(p_group_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF p_budget_cents IS NOT NULL AND (p_budget_cents<=0 OR p_budget_cents>100000000000) THEN RAISE EXCEPTION 'Invalid budget'; END IF;
  UPDATE settleup.groups SET budget_cents=p_budget_cents,budget_currency_code=p_currency_code WHERE id=p_group_id;
  RETURN jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION settleup.set_group_budget_v2(uuid,bigint,settleup.currency_code) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.set_group_budget_v2(uuid,bigint,settleup.currency_code) TO authenticated;

CREATE FUNCTION settleup.get_group_currencies(p_group_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(code ORDER BY code),'[]'::jsonb) FROM (
    SELECT default_currency_code code FROM settleup.groups WHERE id=p_group_id AND id IN (SELECT settleup.user_group_ids())
    UNION SELECT currency_code FROM settleup.expenses WHERE group_id=p_group_id AND group_id IN (SELECT settleup.user_group_ids())
    UNION SELECT currency_code FROM settleup.payments WHERE group_id=p_group_id AND group_id IN (SELECT settleup.user_group_ids())
  ) currencies;
$$;
REVOKE ALL ON FUNCTION settleup.get_group_currencies(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.get_group_currencies(uuid) TO authenticated;

CREATE FUNCTION settleup.get_friend_payment_reports_v2(p_share_token text,p_currency_code settleup.currency_code)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(reports) ORDER BY reports.created_at DESC),'[]'::jsonb)
  FROM (SELECT p.id,p.to_member_id,p.amount_cents,p.currency_code,p.status,p.created_at
    FROM settleup.payments p JOIN settleup.group_members m ON m.id=p.from_member_id
    WHERE m.share_token=p_share_token AND m.departed_at IS NULL AND p.report_request_id IS NOT NULL AND p.currency_code=p_currency_code
    ORDER BY p.created_at DESC LIMIT 50) reports;
$$;
REVOKE ALL ON FUNCTION settleup.get_friend_payment_reports_v2(text,settleup.currency_code) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_friend_payment_reports_v2(text,settleup.currency_code) TO anon,authenticated;

-- Legacy RPCs fail clearly for mixed/foreign ledgers, rather than show a
-- misleading zero balance or label foreign minor units as PHP.
CREATE FUNCTION settleup.assert_php_ledger(p_group_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM settleup.groups WHERE id=p_group_id AND (default_currency_code<>'PHP' OR (budget_cents IS NOT NULL AND budget_currency_code<>'PHP')))
    OR EXISTS (SELECT 1 FROM settleup.expenses WHERE group_id=p_group_id AND currency_code<>'PHP')
    OR EXISTS (SELECT 1 FROM settleup.payments WHERE group_id=p_group_id AND currency_code<>'PHP')
    OR EXISTS (SELECT 1 FROM settleup.recurring_expenses WHERE group_id=p_group_id AND currency_code<>'PHP') THEN
      RAISE EXCEPTION 'Update the app to view or change this multi-currency group.' USING ERRCODE='PT426';
  END IF;
END; $$;
REVOKE ALL ON FUNCTION settleup.assert_php_ledger(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION settleup.get_creditor_profiles(p_group_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$

BEGIN IF auth.uid() IS NULL OR p_group_id NOT IN (SELECT settleup.user_group_ids()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF; PERFORM settleup.assert_php_ledger(p_group_id);
RETURN settleup.get_creditor_profiles_v2(p_group_id,'PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.get_dashboard_summary() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE g uuid;
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF; FOR g IN SELECT settleup.user_group_ids() LOOP PERFORM settleup.assert_php_ledger(g); END LOOP;
RETURN settleup.get_dashboard_summary_v2('PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.get_friend_view(p_share_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$

BEGIN PERFORM settleup.assert_php_ledger((SELECT group_id FROM settleup.group_members WHERE share_token=p_share_token));
RETURN settleup.get_friend_view_v2(p_share_token,'PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.get_group_overview(p_share_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$

BEGIN PERFORM settleup.assert_php_ledger((SELECT id FROM settleup.groups WHERE share_token=p_share_token));
RETURN settleup.get_group_overview_v2(p_share_token,'PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.get_groups_with_stats() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE g uuid;
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF; FOR g IN SELECT settleup.user_group_ids() LOOP PERFORM settleup.assert_php_ledger(g); END LOOP;
RETURN settleup.get_groups_with_stats_v2('PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.get_member_balances(p_group_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$

BEGIN IF auth.uid() IS NULL OR p_group_id NOT IN (SELECT settleup.user_group_ids()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF; PERFORM settleup.assert_php_ledger(p_group_id);
RETURN settleup.get_member_balances_v2(p_group_id,'PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.get_user_activity(p_limit integer DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE g uuid;
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF; FOR g IN SELECT settleup.user_group_ids() LOOP PERFORM settleup.assert_php_ledger(g); END LOOP;
RETURN settleup.get_user_activity_v2(p_limit,'PHP'); END; $$;

CREATE OR REPLACE FUNCTION settleup.record_payment(p_group_id uuid,p_from_member_id uuid,p_to_member_id uuid,p_amount_cents bigint,p_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR p_group_id NOT IN (SELECT settleup.user_group_ids()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM settleup.assert_php_ledger(p_group_id);
  RETURN settleup.record_payment_v2(p_group_id,p_from_member_id,p_to_member_id,p_amount_cents,coalesce(p_id,gen_random_uuid()),'PHP');
END; $$;
CREATE OR REPLACE FUNCTION settleup.submit_friend_payment(p_share_token text,p_to_member_id uuid,p_amount_cents bigint,p_request_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM settleup.assert_php_ledger((SELECT group_id FROM settleup.group_members WHERE share_token=p_share_token));
  RETURN settleup.submit_friend_payment_v2(p_share_token,p_to_member_id,p_amount_cents,p_request_id,p_note,'PHP');
END; $$;
CREATE OR REPLACE FUNCTION settleup.set_group_budget(p_group_id uuid,p_budget_cents bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT settleup.is_group_admin_or_owner(p_group_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  PERFORM settleup.assert_php_ledger(p_group_id);
  RETURN settleup.set_group_budget_v2(p_group_id,p_budget_cents,'PHP');
END; $$;
CREATE OR REPLACE FUNCTION settleup.get_friend_payment_reports(p_share_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM settleup.assert_php_ledger((SELECT group_id FROM settleup.group_members WHERE share_token=p_share_token));
  RETURN settleup.get_friend_payment_reports_v2(p_share_token,'PHP');
END; $$;

-- Applied even to direct writes and privileged expense/update RPCs. Scheduled
-- recurring materialization has no user JWT and retains the template currency.
CREATE FUNCTION settleup.guard_legacy_currency_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT settleup.has_currency_client() THEN
    g:=CASE WHEN TG_OP='DELETE' THEN OLD.group_id ELSE NEW.group_id END;
    PERFORM settleup.assert_php_ledger(g);
    IF TG_OP<>'DELETE' AND NEW.currency_code<>'PHP' THEN RAISE EXCEPTION 'Update the app before using another currency.' USING ERRCODE='PT426'; END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION settleup.guard_legacy_currency_write() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_legacy_currency_write BEFORE INSERT OR UPDATE OR DELETE ON settleup.expenses FOR EACH ROW EXECUTE FUNCTION settleup.guard_legacy_currency_write();
CREATE TRIGGER guard_legacy_currency_write BEFORE INSERT OR UPDATE OR DELETE ON settleup.payments FOR EACH ROW EXECUTE FUNCTION settleup.guard_legacy_currency_write();
CREATE TRIGGER guard_legacy_currency_write BEFORE INSERT OR UPDATE OR DELETE ON settleup.recurring_expenses FOR EACH ROW EXECUTE FUNCTION settleup.guard_legacy_currency_write();
CREATE OR REPLACE FUNCTION settleup.undo_last_payment_v2(p_group_id uuid,p_currency_code settleup.currency_code)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
  WHERE group_id = p_group_id AND currency_code=p_currency_code AND status='PAID'
    AND created_by_user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1 FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'No payment found to undo';
  END IF;

  DELETE FROM payments
  WHERE id = v_payment_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$function$;
REVOKE ALL ON FUNCTION settleup.undo_last_payment_v2(uuid,settleup.currency_code) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.undo_last_payment_v2(uuid,settleup.currency_code) TO authenticated;
CREATE OR REPLACE FUNCTION settleup.undo_last_payment(p_group_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR p_group_id NOT IN (SELECT settleup.user_group_ids()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
PERFORM settleup.assert_php_ledger(p_group_id); RETURN settleup.undo_last_payment_v2(p_group_id,'PHP'); END; $$;
CREATE OR REPLACE FUNCTION settleup.undo_last_payment_for_member_v2(p_from_member_id uuid,p_currency_code settleup.currency_code)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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
  WHERE p.from_member_id = p_from_member_id AND p.currency_code=p_currency_code AND p.status='PAID'
    AND (
      p.created_by_user_id = v_user_id
      OR settleup.is_group_admin_or_owner(v_group_id)
    )
  ORDER BY p.created_at DESC
  LIMIT 1 FOR UPDATE;

  IF v_payment_id IS NULL THEN
    RAISE EXCEPTION 'No payment found to undo';
  END IF;

  DELETE FROM payments
  WHERE id = v_payment_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$function$;
REVOKE ALL ON FUNCTION settleup.undo_last_payment_for_member_v2(uuid,settleup.currency_code) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.undo_last_payment_for_member_v2(uuid,settleup.currency_code) TO authenticated;
CREATE OR REPLACE FUNCTION settleup.undo_last_payment_for_member(p_from_member_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
IF auth.uid() IS NULL OR (SELECT group_id FROM settleup.group_members WHERE id=p_from_member_id) NOT IN (SELECT settleup.user_group_ids()) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
PERFORM settleup.assert_php_ledger((SELECT group_id FROM settleup.group_members WHERE id=p_from_member_id)); RETURN settleup.undo_last_payment_for_member_v2(p_from_member_id,'PHP'); END; $$;
CREATE OR REPLACE FUNCTION settleup.update_expense(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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

  SELECT e.id, e.group_id, e.created_by_user_id, e.updated_at, e.currency_code
  INTO v_existing
  FROM expenses e
  WHERE e.id = v_expense_id FOR UPDATE OF e;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'PT404';
  END IF;

  IF v_existing.created_by_user_id IS DISTINCT FROM auth.uid()
     AND NOT settleup.is_group_admin_or_owner(v_existing.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to edit this expense';
  END IF;

  IF v_existing.currency_code IS DISTINCT FROM COALESCE(p_input->>'currency_code','PHP') THEN
    RAISE EXCEPTION 'Expense currency does not match this edit' USING ERRCODE='PT409';
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
$function$;
CREATE OR REPLACE FUNCTION settleup.update_itemized_expense(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
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

  SELECT e.id, e.group_id, e.created_by_user_id, e.updated_at, e.currency_code
  INTO v_existing
  FROM expenses e
  WHERE e.id = v_expense_id FOR UPDATE OF e;

  IF v_existing IS NULL THEN
    RAISE EXCEPTION 'Expense not found' USING ERRCODE = 'PT404';
  END IF;

  IF v_existing.created_by_user_id IS DISTINCT FROM auth.uid()
     AND NOT settleup.is_group_admin_or_owner(v_existing.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to edit this expense';
  END IF;

  IF v_existing.currency_code IS DISTINCT FROM COALESCE(p_input->>'currency_code','PHP') THEN
    RAISE EXCEPTION 'Expense currency does not match this edit' USING ERRCODE='PT409';
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
$function$;

