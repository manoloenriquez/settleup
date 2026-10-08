-- Removing a member must never rewrite the ledger (migration 20261009120000).
-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid();
  g uuid; m_alice uuid; m_bob uuid := gen_random_uuid(); m_cara uuid := gen_random_uuid(); m_dan uuid := gen_random_uuid();
  e uuid := gen_random_uuid(); blocked boolean;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES (alice, 'history-a@' || alice || '.example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('History', gen_random_uuid(), 'PHP', 'Alice')->'group'->>'id')::uuid;
  SELECT id INTO m_alice FROM settleup.group_members WHERE group_id = g AND user_id = alice;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token) VALUES
    (m_bob, g, 'Bob', 'history-bob-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (m_cara, g, 'Cara', 'history-cara-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (m_dan, g, 'Dan', 'history-dan-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  PERFORM set_config('role', 'authenticated', true);
  PERFORM settleup.create_expense(jsonb_build_object('id', e, 'group_id', g, 'item_name', 'Taxi', 'amount_cents', 30000,
    'currency_code', 'PHP', 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m_alice, m_bob),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_alice, 'paid_cents', 30000))));
  PERFORM settleup.record_payment_v2(g, m_cara, m_alice, 500, gen_random_uuid(), 'PHP');

  -- Bob is in an expense: the owner (an admin) cannot delete him.
  blocked := false;
  BEGIN
    DELETE FROM settleup.group_members WHERE id = m_bob;
  EXCEPTION WHEN foreign_key_violation THEN blocked := true;
  END;
  ASSERT blocked, 'A member in an expense cannot be deleted';
  ASSERT (SELECT sum(share_cents) FROM settleup.expense_participants WHERE expense_id = e) = 30000, 'Shares still sum to the total';

  -- Cara only made a payment: also kept.
  blocked := false;
  BEGIN
    DELETE FROM settleup.group_members WHERE id = m_cara;
  EXCEPTION WHEN foreign_key_violation THEN blocked := true;
  END;
  ASSERT blocked, 'A member with a payment cannot be deleted';

  -- Dan has no history: removing him is fine.
  DELETE FROM settleup.group_members WHERE id = m_dan;
  ASSERT NOT EXISTS (SELECT 1 FROM settleup.group_members WHERE id = m_dan), 'A member without history can be removed';

  -- Deleting the whole group still removes everything.
  PERFORM set_config('role', 'postgres', true);
  DELETE FROM settleup.groups WHERE id = g;
  ASSERT NOT EXISTS (SELECT 1 FROM settleup.group_members WHERE group_id = g), 'Group delete cascades to members';
  ASSERT NOT EXISTS (SELECT 1 FROM settleup.expenses WHERE id = e), 'Group delete cascades to expenses';
  RAISE NOTICE 'member_history: all assertions passed';
END $$;
ROLLBACK;
