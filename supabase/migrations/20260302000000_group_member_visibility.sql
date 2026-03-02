-- =============================================================================
-- Fix group visibility: users see groups they own OR groups where they are
-- a linked member (group_members.user_id = auth.uid()).
--
-- Uses a SECURITY DEFINER helper (user_group_ids) to avoid circular RLS
-- recursion between groups ↔ group_members policies.
--
-- Also replaces get_groups_with_stats() and get_member_balances() with
-- versions that apply the same owner-OR-member filter.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: returns the set of group_ids the current user belongs to.
--    SECURITY DEFINER bypasses RLS on group_members, so policies that call
--    this function cannot trigger recursion.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.user_group_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = settleup
STABLE
AS $$
  SELECT group_id FROM group_members WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION settleup.user_group_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- 1. groups — add SELECT policy for linked members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "groups_member_select" ON settleup.groups;

CREATE POLICY "groups_member_select"
  ON settleup.groups FOR SELECT
  TO authenticated
  USING (
    id IN (SELECT settleup.user_group_ids())
  );

-- ---------------------------------------------------------------------------
-- 2. group_members — add SELECT policy for linked members
--    Uses the helper to avoid self-referential recursion.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "group_members_member_select" ON settleup.group_members;

CREATE POLICY "group_members_member_select"
  ON settleup.group_members FOR SELECT
  TO authenticated
  USING (
    group_id IN (SELECT settleup.user_group_ids())
  );

-- ---------------------------------------------------------------------------
-- 3. expenses — add SELECT policy for linked members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expenses_member_select" ON settleup.expenses;

CREATE POLICY "expenses_member_select"
  ON settleup.expenses FOR SELECT
  TO authenticated
  USING (
    group_id IN (SELECT settleup.user_group_ids())
  );

-- ---------------------------------------------------------------------------
-- 4. expense_participants — add SELECT policy for linked members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expense_participants_member_select" ON settleup.expense_participants;

CREATE POLICY "expense_participants_member_select"
  ON settleup.expense_participants FOR SELECT
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. expense_payers — add SELECT policy for linked members (was missing)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "expense_payers_member_select" ON settleup.expense_payers;

CREATE POLICY "expense_payers_member_select"
  ON settleup.expense_payers FOR SELECT
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      WHERE e.group_id IN (SELECT settleup.user_group_ids())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. payments — add SELECT policy for linked members
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "payments_member_select" ON settleup.payments;

CREATE POLICY "payments_member_select"
  ON settleup.payments FOR SELECT
  TO authenticated
  USING (
    group_id IN (SELECT settleup.user_group_ids())
  );

-- ---------------------------------------------------------------------------
-- 7. Replace get_member_balances() — owner OR member access via helper
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
        - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
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

GRANT EXECUTE ON FUNCTION settleup.get_member_balances(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Replace get_groups_with_stats() — owner OR member access via helper
-- ---------------------------------------------------------------------------

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
          - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
          + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
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

GRANT EXECUTE ON FUNCTION settleup.get_groups_with_stats() TO authenticated;
