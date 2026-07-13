-- Dashboard summary v3 (superset): merges two parallel redesigns of
-- get_dashboard_summary so both clients keep working.
--
-- Keeps the keys added remotely by 20260713175129_emerald_dashboard_activity
-- (total_owed_to_user_cents, total_user_owes_cents, recent_activity via
-- settleup.get_user_activity) and adds owed_to_me_cents / i_owe_cents,
-- counterparty counts, and per-group my_net_cents. Balance CTEs are copied
-- verbatim from 20260612000000_pending_payments.sql — only additive
-- aggregates are new.
--
-- get_user_activity is re-declared here (identical to the remotely-applied
-- 20260713175129 version, which has no file in this repo) so a local
-- `supabase db reset` produces the same schema as the remote.

CREATE OR REPLACE FUNCTION settleup.get_user_activity(p_limit integer DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = settleup
AS $$
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
      CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END AS category,
      COALESCE((
        SELECT jsonb_agg(gm.display_name ORDER BY gm.display_name)
        FROM expense_payers ep
        JOIN group_members gm ON gm.id = ep.member_id
        WHERE ep.expense_id = e.id
      ), '[]'::JSONB) AS payer_names,
      NULL::TEXT AS from_name,
      NULL::TEXT AS to_name,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM expense_payers ep
          JOIN group_members gm ON gm.id = ep.member_id
          WHERE ep.expense_id = e.id AND gm.user_id = v_user_id
        ) THEN 'paid_by_you'
        WHEN EXISTS (
          SELECT 1 FROM expense_participants epa
          JOIN group_members gm ON gm.id = epa.member_id
          WHERE epa.expense_id = e.id AND gm.user_id = v_user_id
        ) THEN 'shared_with_you'
        ELSE 'group'
      END::TEXT AS relationship
    FROM expenses e
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
      NULL::JSONB AS category,
      '[]'::JSONB AS payer_names,
      from_member.display_name AS from_name,
      to_member.display_name AS to_name,
      CASE
        WHEN from_member.user_id = v_user_id THEN 'paid_by_you'
        WHEN to_member.user_id = v_user_id THEN 'paid_you'
        ELSE 'group'
      END::TEXT AS relationship
    FROM payments p
    JOIN accessible_groups ag ON ag.id = p.group_id
    JOIN group_members from_member ON from_member.id = p.from_member_id
    JOIN group_members to_member ON to_member.id = p.to_member_id
    WHERE p.status = 'PAID'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', limited.id,
    'type', limited.activity_type,
    'group_id', limited.group_id,
    'group_name', limited.group_name,
    'item_name', limited.item_name,
    'amount_cents', limited.amount_cents,
    'created_at', limited.created_at,
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
  )
  SELECT jsonb_build_object(
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
    'recent_activity', settleup.get_user_activity(5),
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
    'groups', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
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
$$;

REVOKE ALL ON FUNCTION settleup.get_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_dashboard_summary() TO authenticated;
REVOKE ALL ON FUNCTION settleup.get_user_activity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_user_activity(integer) TO authenticated;
