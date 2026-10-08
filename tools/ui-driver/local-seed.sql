-- Realistic data for the LOCAL stack only: Ben owns two groups with members
-- who have no account, several currencies, payments, a budget, personal
-- expenses, payment details and a friend (Carla). Run after Ben and Carla
-- signed up (local-fixtures.sh signup). Not a test: it commits.
DO $$
DECLARE
  ben uuid := (SELECT id FROM auth.users WHERE email = 'ben@talli.test');
  carla uuid := (SELECT id FROM auth.users WHERE email = 'carla@talli.test');
  g uuid; g2 uuid; invite text; m_ben uuid; m_carla uuid; m_dina uuid := gen_random_uuid(); m_eli uuid := gen_random_uuid();
  m2_ben uuid; tok text;
BEGIN
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', ben::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ben, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('Bali trip', gen_random_uuid(), 'PHP', 'Ben')->'group'->>'id')::uuid;
  g2 := (settleup.create_group_v2('NYC weekend', gen_random_uuid(), 'USD', 'Ben')->'group'->>'id')::uuid;
  SELECT invite_code INTO invite FROM settleup.groups WHERE id = g;
  PERFORM set_config('request.jwt.claim.sub', carla::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', carla, 'role', 'authenticated')::text, true);
  PERFORM settleup.join_group_by_invite(invite);
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token) VALUES
    (m_dina, g, 'Dina', 'seed-dina-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex')),
    (m_eli, g, 'Eli', 'seed-eli-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  SELECT id INTO m_ben FROM settleup.group_members WHERE group_id = g AND user_id = ben;
  SELECT id INTO m_carla FROM settleup.group_members WHERE group_id = g AND user_id = carla;
  SELECT id INTO m2_ben FROM settleup.group_members WHERE group_id = g2 AND user_id = ben;
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', ben::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ben, 'role', 'authenticated')::text, true);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Villa', 'amount_cents', 300000,
    'currency_code', 'PHP', 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m_ben, m_carla, m_dina, m_eli),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_ben, 'paid_cents', 300000))));
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Surf lesson', 'amount_cents', 4500,
    'currency_code', 'USD', 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m_ben, m_carla),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_ben, 'paid_cents', 4500))));
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Water', 'amount_cents', 1001,
    'currency_code', 'PHP', 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m_ben, m_carla, m_dina),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_ben, 'paid_cents', 1001))));
  PERFORM settleup.record_payment_v2(g, m_dina, m_ben, 30000, gen_random_uuid(), 'PHP');
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g2, 'item_name', 'Pizza', 'amount_cents', 3200,
    'currency_code', 'USD', 'split_mode', 'equal', 'participant_ids', jsonb_build_array(m2_ben),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m2_ben, 'paid_cents', 3200))));
  PERFORM settleup.set_group_budget_v2(g, 1000000, 'PHP');
  -- Friend: Carla invites Ben.
  PERFORM set_config('request.jwt.claim.sub', carla::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', carla, 'role', 'authenticated')::text, true);
  tok := settleup.create_friend_invite('Carla', 'PHP')->>'token';
  PERFORM set_config('request.jwt.claim.sub', ben::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', ben, 'role', 'authenticated')::text, true);
  PERFORM settleup.accept_friend_invite(tok, 'Ben');
END $$;
