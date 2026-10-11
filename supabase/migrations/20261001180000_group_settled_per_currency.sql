-- group_settled summed every member's balance across currencies, so a group
-- owing US$45 one way and ₱45 the other could read as settled. Balances in
-- different currencies never net against each other: a group is settled only
-- when, in every currency, every member's net balance is zero.

CREATE OR REPLACE FUNCTION settleup.record_group_settled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_unsettled integer;
  v_last_expense timestamptz;
BEGIN
  IF NEW.status <> 'PAID' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'PAID' THEN RETURN NULL; END IF;

  SELECT max(created_at) INTO v_last_expense FROM expenses WHERE group_id = NEW.group_id;
  IF v_last_expense IS NULL THEN RETURN NULL; END IF;

  WITH movements AS (
    SELECT ep.member_id, e.currency_code, ep.paid_cents AS amount
      FROM expense_payers ep JOIN expenses e ON e.id = ep.expense_id
     WHERE e.group_id = NEW.group_id
    UNION ALL
    SELECT epa.member_id, e.currency_code, -epa.share_cents
      FROM expense_participants epa JOIN expenses e ON e.id = epa.expense_id
     WHERE e.group_id = NEW.group_id
    UNION ALL
    SELECT p.to_member_id, p.currency_code, -p.amount_cents
      FROM payments p WHERE p.group_id = NEW.group_id AND p.status = 'PAID'
    UNION ALL
    SELECT p.from_member_id, p.currency_code, p.amount_cents
      FROM payments p WHERE p.group_id = NEW.group_id AND p.status = 'PAID'
  )
  SELECT count(*) INTO v_unsettled
    FROM (
      SELECT member_id, currency_code
        FROM movements
       GROUP BY member_id, currency_code
      HAVING SUM(amount) <> 0
    ) open_balances;
  IF v_unsettled > 0 THEN RETURN NULL; END IF;

  IF EXISTS (
    SELECT 1 FROM group_settlements
     WHERE group_id = NEW.group_id AND settled_at >= v_last_expense
  ) THEN
    RETURN NULL; -- already recorded for this ledger state
  END IF;

  INSERT INTO group_settlements (group_id) VALUES (NEW.group_id);
  INSERT INTO product_events (event_name, user_id, platform, properties)
    VALUES ('group_settled', NEW.created_by_user_id, 'server', '{}'::jsonb);
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- telemetry never blocks a payment
END;
$$;
REVOKE ALL ON FUNCTION settleup.record_group_settled() FROM PUBLIC, anon, authenticated;
