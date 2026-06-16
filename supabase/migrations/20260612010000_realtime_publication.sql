-- Enable Realtime change feeds for group data so clients can refresh
-- automatically when another member adds an expense, records a payment,
-- or changes membership. Realtime postgres_changes respects RLS, so
-- subscribers only receive rows their SELECT policies allow.

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settleup.expenses;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settleup.payments;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE settleup.group_members;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
