-- RPC: returns non-archived groups for the current user with computed stats
-- (member_count, pending_count, total_owed_cents) in a single query.
CREATE OR REPLACE FUNCTION settleup.get_groups_with_stats()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = settleup AS $$
DECLARE v_result JSONB;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              g.id,
      'name',            g.name,
      'owner_user_id',   g.owner_user_id,
      'invite_code',     g.invite_code,
      'is_archived',     g.is_archived,
      'share_token',     g.share_token,
      'created_at',      g.created_at,
      'member_count',    COALESCE(stats.member_count, 0),
      'pending_count',   COALESCE(stats.pending_count, 0),
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
          + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
          - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
        ) AS net
      FROM group_members gm
      WHERE gm.group_id = g.id
    ) member_nets
  ) stats ON TRUE
  WHERE g.is_archived = FALSE;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_groups_with_stats() TO authenticated;
