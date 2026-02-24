-- Fix get_member_balances: payment signs were inverted.
-- Receiving a payment reduces what you are owed (negative to net).
-- Sending a payment reduces what you owe (positive to net).
-- Correct formula: net = paid_as_payer - shares - received_payments + sent_payments
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
        COALESCE((SELECT SUM(ep.paid_cents)   FROM expense_payers ep    WHERE ep.member_id     = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM expense_participants epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents)  FROM payments p          WHERE p.to_member_id   = gm.id), 0)
        + COALESCE((SELECT SUM(p.amount_cents)  FROM payments p          WHERE p.from_member_id = gm.id), 0)
      )
    ) ORDER BY gm.created_at ASC
  ), '[]'::jsonb) INTO v_result
  FROM group_members gm WHERE gm.group_id = p_group_id;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_member_balances(UUID) TO authenticated;
