-- Dashboard summary v2: adds the caller's owed/owe split totals, counterparty
-- counts, and a per-group `my_net_cents` for perspective-aware group cards.
-- The balance CTEs are copied verbatim from 20260612000000_pending_payments.sql
-- (the latest definition); only additive aggregates are new.

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
