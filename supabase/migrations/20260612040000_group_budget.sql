-- Optional spending budget per group, shown as a progress bar against
-- total expenses. NULL means no budget set.

ALTER TABLE settleup.groups
  ADD COLUMN budget_cents BIGINT CHECK (budget_cents IS NULL OR budget_cents > 0);

CREATE OR REPLACE FUNCTION settleup.set_group_budget(
  p_group_id     UUID,
  p_budget_cents BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_budget_cents IS NOT NULL AND p_budget_cents <= 0 THEN
    RAISE EXCEPTION 'Budget must be positive (or null to remove)';
  END IF;

  IF NOT settleup.is_group_admin_or_owner(p_group_id) THEN
    RAISE EXCEPTION 'Only group admins can set the budget';
  END IF;

  UPDATE groups SET budget_cents = p_budget_cents WHERE id = p_group_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION settleup.set_group_budget(UUID, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.set_group_budget(UUID, BIGINT) TO authenticated;

-- Include budget_cents in the groups-with-stats payload
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

REVOKE ALL ON FUNCTION settleup.get_groups_with_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.get_groups_with_stats() TO authenticated;
