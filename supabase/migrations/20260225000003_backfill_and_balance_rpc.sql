-- Backfill expense_payers: first member of each group as payer for all existing expenses
INSERT INTO settleup.expense_payers (expense_id, member_id, paid_cents)
SELECT e.id, gm.id, e.amount_cents
FROM settleup.expenses e
JOIN settleup.groups g ON g.id = e.group_id
JOIN LATERAL (
  SELECT id FROM settleup.group_members
  WHERE group_id = g.id
  ORDER BY created_at ASC
  LIMIT 1
) gm ON TRUE
WHERE e.amount_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM settleup.expense_payers ep WHERE ep.expense_id = e.id
  );

-- Balance RPC: 4-source formula
-- net = paid_as_payer - shares + received_payments - sent_payments
CREATE OR REPLACE FUNCTION settleup.get_member_balances(p_group_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = settleup AS $$
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
        + COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.to_member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.from_member_id = gm.id), 0)
      )
    ) ORDER BY gm.created_at ASC
  ), '[]'::jsonb) INTO v_result
  FROM group_members gm WHERE gm.group_id = p_group_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_member_balances(UUID) TO authenticated;
