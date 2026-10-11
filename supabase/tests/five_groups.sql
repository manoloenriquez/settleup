-- Five representative groups (launch brief 2D), end to end through the real
-- RPCs and RLS. Every balance is asserted against arithmetic written out by
-- hand in the comments — never against the app's own output.
--   1 two-person · 2 multi-member with % and shares · 3 people without accounts
--   4 multi-currency travel · 5 history with partial settlements
-- Transactional fixtures: nothing survives this test.
BEGIN;

CREATE FUNCTION pg_temp.net(p_group uuid, p_member uuid, p_currency text DEFAULT 'PHP') RETURNS bigint
LANGUAGE sql AS $$
  SELECT (b->>'net_cents')::bigint
  FROM jsonb_array_elements(settleup.get_member_balances_v2(p_group, p_currency::settleup.currency_code)) b
  WHERE b->>'member_id' = p_member::text
$$;

CREATE FUNCTION pg_temp.as_user(p_user uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', p_user::text, true),
         set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;

DO $$
DECLARE
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  g1 uuid; g2 uuid; g3 uuid; g4 uuid; g5 uuid; inv text;
  a1 uuid; b1 uuid; a2 uuid; b2 uuid; c2 uuid; d2 uuid := gen_random_uuid();
  a3 uuid; x1 uuid := gen_random_uuid(); x2 uuid := gen_random_uuid(); x3 uuid := gen_random_uuid();
  a4 uuid; b4 uuid; c4 uuid; a5 uuid; b5 uuid; f5 uuid := gen_random_uuid();
  taxi uuid := gen_random_uuid(); shares_exp uuid := gen_random_uuid(); v text;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (a, 'five-a@' || a || '.example.invalid', '{}'),
    (b, 'five-b@' || b || '.example.invalid', '{}'),
    (c, 'five-c@' || c || '.example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- 1. Two people -----------------------------------------------------------
  PERFORM pg_temp.as_user(a);
  g1 := (settleup.create_group_v2('Ana & Ben', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  SELECT invite_code INTO inv FROM settleup.groups WHERE id = g1;
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.join_group_by_invite(inv);
  SELECT id INTO a1 FROM settleup.group_members WHERE group_id = g1 AND user_id = a;
  SELECT id INTO b1 FROM settleup.group_members WHERE group_id = g1 AND user_id = b;
  -- Ana pays ₱1,200 dinner, equal → Ana +600, Ben −600.
  PERFORM pg_temp.as_user(a);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g1, 'item_name', 'Dinner', 'amount_cents', 120000, 'currency_code', 'PHP',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a1, b1), 'payers', jsonb_build_array(jsonb_build_object('member_id', a1, 'paid_cents', 120000))));
  -- Ben pays ₱450 taxi, exact Ana 300 / Ben 150 → Ben +300, Ana −300.
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.create_expense(jsonb_build_object('id', taxi, 'group_id', g1, 'item_name', 'Taxi', 'amount_cents', 45000, 'currency_code', 'PHP',
    'split_mode', 'custom', 'custom_splits', jsonb_build_array(jsonb_build_object('member_id', a1, 'share_cents', 30000), jsonb_build_object('member_id', b1, 'share_cents', 15000)),
    'payers', jsonb_build_array(jsonb_build_object('member_id', b1, 'paid_cents', 45000))));
  ASSERT pg_temp.net(g1, a1) = 30000 AND pg_temp.net(g1, b1) = -30000, 'G1 after two expenses: Ana +300';
  -- Ben edits the taxi to ₱500, equal, and moves its date → Ben +250 on it; Ana −250. Nets: Ana +350, Ben −350.
  SELECT updated_at::text INTO v FROM settleup.expenses WHERE id = taxi;
  PERFORM settleup.update_expense(jsonb_build_object('expense_id', taxi, 'expected_updated_at', v, 'item_name', 'Taxi', 'amount_cents', 50000, 'currency_code', 'PHP',
    'expense_date', '2026-10-01', 'split_mode', 'equal', 'participant_ids', jsonb_build_array(a1, b1), 'payers', jsonb_build_array(jsonb_build_object('member_id', b1, 'paid_cents', 50000))));
  ASSERT (SELECT expense_date FROM settleup.expenses WHERE id = taxi) = DATE '2026-10-01', 'G1 edit moved the date';
  ASSERT pg_temp.net(g1, a1) = 35000 AND pg_temp.net(g1, b1) = -35000, 'G1 after edit: Ana +350';
  -- Ben settles ₱350 → both zero.
  PERFORM settleup.record_payment_v2(g1, b1, a1, 35000, gen_random_uuid(), 'PHP');
  ASSERT pg_temp.net(g1, a1) = 0 AND pg_temp.net(g1, b1) = 0, 'G1 settled';

  -- 2. Multi-member with percentages, shares and a delete -------------------
  PERFORM pg_temp.as_user(a);
  g2 := (settleup.create_group_v2('Barkada', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  SELECT invite_code INTO inv FROM settleup.groups WHERE id = g2;
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.join_group_by_invite(inv);
  PERFORM pg_temp.as_user(c);
  PERFORM settleup.join_group_by_invite(inv);
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token)
    VALUES (d2, g2, 'Dina', 'five-dina-' || left(g2::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  PERFORM set_config('role', 'authenticated', true);
  SELECT id INTO a2 FROM settleup.group_members WHERE group_id = g2 AND user_id = a;
  SELECT id INTO b2 FROM settleup.group_members WHERE group_id = g2 AND user_id = b;
  SELECT id INTO c2 FROM settleup.group_members WHERE group_id = g2 AND user_id = c;
  -- Ana pays ₱1,000 for all four equally: Ana +750, Ben −250, Cy −250, Dina −250.
  PERFORM pg_temp.as_user(a);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g2, 'item_name', 'Groceries', 'amount_cents', 100000, 'currency_code', 'PHP',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a2, b2, c2, d2), 'payers', jsonb_build_array(jsonb_build_object('member_id', a2, 'paid_cents', 100000))));
  -- Ben pays ₱2,000 split 50% Ana / 30% Ben / 20% Dina (resolved to 1000/600/400): Ana −1000, Ben +1400, Dina −400.
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g2, 'item_name', 'Boat', 'amount_cents', 200000, 'currency_code', 'PHP',
    'split_mode', 'custom', 'custom_splits', jsonb_build_array(jsonb_build_object('member_id', a2, 'share_cents', 100000),
      jsonb_build_object('member_id', b2, 'share_cents', 60000), jsonb_build_object('member_id', d2, 'share_cents', 40000)),
    'payers', jsonb_build_array(jsonb_build_object('member_id', b2, 'paid_cents', 200000))));
  -- Cy pays ₱900 by shares Ana 2 : Cy 1 (600/300), then deletes it — it must leave no trace.
  PERFORM pg_temp.as_user(c);
  PERFORM settleup.create_expense(jsonb_build_object('id', shares_exp, 'group_id', g2, 'item_name', 'Drinks', 'amount_cents', 90000, 'currency_code', 'PHP',
    'split_mode', 'custom', 'custom_splits', jsonb_build_array(jsonb_build_object('member_id', a2, 'share_cents', 60000), jsonb_build_object('member_id', c2, 'share_cents', 30000)),
    'payers', jsonb_build_array(jsonb_build_object('member_id', c2, 'paid_cents', 90000))));
  -- Before the delete: Cy −250 (groceries) + 900 paid − 300 share = +350.
  ASSERT pg_temp.net(g2, c2) = 35000, 'G2 Cy +350 before the delete';
  DELETE FROM settleup.expenses WHERE id = shares_exp;
  ASSERT NOT EXISTS (SELECT 1 FROM settleup.expense_participants WHERE expense_id = shares_exp), 'G2 delete removed the shares';
  -- Totals: Ana +750 −1000 = −250 · Ben −250 +1400 = +1150 · Cy −250 · Dina −250 −400 = −650.
  ASSERT pg_temp.net(g2, a2) = -25000, 'G2 Ana −250';
  ASSERT pg_temp.net(g2, b2) = 115000, 'G2 Ben +1150';
  ASSERT pg_temp.net(g2, c2) = -25000, 'G2 Cy −250';
  ASSERT pg_temp.net(g2, d2) = -65000, 'G2 Dina −650';
  -- Dina (no account) pays Ben ₱650, recorded by the owner → Dina 0, Ben +500.
  PERFORM pg_temp.as_user(a);
  PERFORM settleup.record_payment_v2(g2, d2, b2, 65000, gen_random_uuid(), 'PHP');
  ASSERT pg_temp.net(g2, d2) = 0 AND pg_temp.net(g2, b2) = 50000, 'G2 Dina settled, Ben +500';

  -- 3. People without accounts ----------------------------------------------
  g3 := (settleup.create_group_v2('Office lunch', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token) VALUES
    (x1, g3, 'Lia', 'five-lia-' || left(g3::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (x2, g3, 'Jun', 'five-jun-' || left(g3::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (x3, g3, 'Rey', 'five-rey-' || left(g3::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  PERFORM set_config('role', 'authenticated', true);
  SELECT id INTO a3 FROM settleup.group_members WHERE group_id = g3 AND user_id = a;
  -- Ana pays ₱3,000 for four (750 each) and ₱600 for Lia and Jun only (300 each).
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g3, 'item_name', 'Catering', 'amount_cents', 300000, 'currency_code', 'PHP',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a3, x1, x2, x3), 'payers', jsonb_build_array(jsonb_build_object('member_id', a3, 'paid_cents', 300000))));
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g3, 'item_name', 'Coffee', 'amount_cents', 60000, 'currency_code', 'PHP',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(x1, x2), 'payers', jsonb_build_array(jsonb_build_object('member_id', a3, 'paid_cents', 60000))));
  -- Ana +2250 +600 = +2850 · Lia −750 −300 = −1050 · Jun −1050 · Rey −750.
  ASSERT pg_temp.net(g3, a3) = 285000 AND pg_temp.net(g3, x1) = -105000 AND pg_temp.net(g3, x2) = -105000 AND pg_temp.net(g3, x3) = -75000, 'G3 balances';

  -- 4. Multi-currency travel -------------------------------------------------
  g4 := (settleup.create_group_v2('Asia trip', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  SELECT invite_code INTO inv FROM settleup.groups WHERE id = g4;
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.join_group_by_invite(inv);
  PERFORM pg_temp.as_user(c);
  PERFORM settleup.join_group_by_invite(inv);
  SELECT id INTO a4 FROM settleup.group_members WHERE group_id = g4 AND user_id = a;
  SELECT id INTO b4 FROM settleup.group_members WHERE group_id = g4 AND user_id = b;
  SELECT id INTO c4 FROM settleup.group_members WHERE group_id = g4 AND user_id = c;
  -- PHP: Ana pays ₱3,000 for three → Ana +2000, Ben −1000, Cy −1000.
  PERFORM pg_temp.as_user(a);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g4, 'item_name', 'Hotel', 'amount_cents', 300000, 'currency_code', 'PHP',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a4, b4, c4), 'payers', jsonb_build_array(jsonb_build_object('member_id', a4, 'paid_cents', 300000))));
  -- USD: Ben pays $90.00 → Ben +$60, Ana −$30, Cy −$30.
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g4, 'item_name', 'Tour', 'amount_cents', 9000, 'currency_code', 'USD',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a4, b4, c4), 'payers', jsonb_build_array(jsonb_build_object('member_id', b4, 'paid_cents', 9000))));
  -- JPY (no minor unit): Cy pays ¥4,500 → Cy +¥3,000, Ana −¥1,500, Ben −¥1,500.
  PERFORM pg_temp.as_user(c);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g4, 'item_name', 'Ramen', 'amount_cents', 4500, 'currency_code', 'JPY',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a4, b4, c4), 'payers', jsonb_build_array(jsonb_build_object('member_id', c4, 'paid_cents', 4500))));
  -- Cy pays Ana ₱1,000 → PHP: Ana +1000, Ben −1000, Cy 0.
  PERFORM settleup.record_payment_v2(g4, c4, a4, 100000, gen_random_uuid(), 'PHP');
  ASSERT pg_temp.net(g4, a4, 'PHP') = 100000 AND pg_temp.net(g4, b4, 'PHP') = -100000 AND pg_temp.net(g4, c4, 'PHP') = 0, 'G4 PHP';
  ASSERT pg_temp.net(g4, a4, 'USD') = -3000 AND pg_temp.net(g4, b4, 'USD') = 6000 AND pg_temp.net(g4, c4, 'USD') = -3000, 'G4 USD never mixed with PHP';
  ASSERT pg_temp.net(g4, a4, 'JPY') = -1500 AND pg_temp.net(g4, b4, 'JPY') = -1500 AND pg_temp.net(g4, c4, 'JPY') = 3000, 'G4 JPY';

  -- 5. History and partial settlements --------------------------------------
  PERFORM pg_temp.as_user(a);
  g5 := (settleup.create_group_v2('House 2026', gen_random_uuid(), 'PHP', 'Ana')->'group'->>'id')::uuid;
  SELECT invite_code INTO inv FROM settleup.groups WHERE id = g5;
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.join_group_by_invite(inv);
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token)
    VALUES (f5, g5, 'Fe', 'five-fe-' || left(g5::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  PERFORM set_config('role', 'authenticated', true);
  SELECT id INTO a5 FROM settleup.group_members WHERE group_id = g5 AND user_id = a;
  SELECT id INTO b5 FROM settleup.group_members WHERE group_id = g5 AND user_id = b;
  -- July: Ana pays ₱1,500 for three → Ana +1000, Ben −500, Fe −500.
  PERFORM pg_temp.as_user(a);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g5, 'item_name', 'Internet Jul', 'amount_cents', 150000, 'currency_code', 'PHP', 'expense_date', '2026-07-01',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a5, b5, f5), 'payers', jsonb_build_array(jsonb_build_object('member_id', a5, 'paid_cents', 150000))));
  -- August: Ben pays ₱900 for three → Ben +600, Ana −300, Fe −300.
  PERFORM pg_temp.as_user(b);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g5, 'item_name', 'Water Aug', 'amount_cents', 90000, 'currency_code', 'PHP', 'expense_date', '2026-08-15',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a5, b5, f5), 'payers', jsonb_build_array(jsonb_build_object('member_id', b5, 'paid_cents', 90000))));
  -- September: Fe (no account) paid ₱600 for herself and Ana → Fe +300, Ana −300.
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g5, 'item_name', 'Gas Sep', 'amount_cents', 60000, 'currency_code', 'PHP', 'expense_date', '2026-09-10',
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(a5, f5), 'payers', jsonb_build_array(jsonb_build_object('member_id', f5, 'paid_cents', 60000))));
  -- Ana +1000 −300 −300 = +400 · Ben −500 +600 = +100 · Fe −500 −300 +300 = −500.
  ASSERT pg_temp.net(g5, a5) = 40000 AND pg_temp.net(g5, b5) = 10000 AND pg_temp.net(g5, f5) = -50000, 'G5 before payments';
  -- Partial settlements: Fe → Ana 200, Fe → Ben 50, Fe → Ana 200.
  PERFORM pg_temp.as_user(a);
  PERFORM settleup.record_payment_v2(g5, f5, a5, 20000, gen_random_uuid(), 'PHP');
  PERFORM settleup.record_payment_v2(g5, f5, b5, 5000, gen_random_uuid(), 'PHP');
  PERFORM settleup.record_payment_v2(g5, f5, a5, 20000, gen_random_uuid(), 'PHP');
  -- Ana +400 −400 = 0 · Ben +100 −50 = +50 · Fe −500 +450 = −50.
  ASSERT pg_temp.net(g5, a5) = 0 AND pg_temp.net(g5, b5) = 5000 AND pg_temp.net(g5, f5) = -5000, 'G5 after partial settlements';
  ASSERT (SELECT count(*) FROM settleup.expenses WHERE group_id = g5 AND expense_date < DATE '2026-09-01') = 2, 'G5 history keeps its dates';

  -- Every group's balances sum to zero in every currency.
  ASSERT (SELECT bool_and(s = 0) FROM (
    SELECT sum((x->>'net_cents')::bigint) s FROM unnest(ARRAY[g1, g2, g3, g4, g5]) grp,
      LATERAL unnest(ARRAY['PHP', 'USD', 'JPY']) cur,
      LATERAL jsonb_array_elements(settleup.get_member_balances_v2(grp, cur::settleup.currency_code)) x
    GROUP BY grp, cur) t), 'All balances sum to zero';
  RAISE NOTICE 'five_groups: all assertions passed';
END $$;
ROLLBACK;
