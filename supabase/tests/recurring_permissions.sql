-- Audit M4: recurring templates can be changed only by their creator or a
-- group owner/admin; every member can still see them.
-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); carol uuid := gen_random_uuid();
  g uuid; invite text; m_bob uuid; t uuid := gen_random_uuid(); n integer;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (alice, 'rec-a@' || alice || '.example.invalid', '{}'),
    (bob, 'rec-b@' || bob || '.example.invalid', '{}'),
    (carol, 'rec-c@' || carol || '.example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);

  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('Rent', gen_random_uuid(), 'PHP', 'Alice')->'group'->>'id')::uuid;
  SELECT invite_code INTO invite FROM settleup.groups WHERE id = g;
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
  PERFORM settleup.join_group_by_invite(invite);
  PERFORM set_config('request.jwt.claim.sub', carol::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', carol, 'role', 'authenticated')::text, true);
  PERFORM settleup.join_group_by_invite(invite);
  PERFORM set_config('role', 'postgres', true);
  SELECT id INTO m_bob FROM settleup.group_members WHERE group_id = g AND user_id = bob;
  PERFORM set_config('role', 'authenticated', true);

  -- Bob creates a template; he cannot claim someone else made it.
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
  BEGIN
    INSERT INTO settleup.recurring_expenses(group_id, item_name, amount_cents, payer_member_id, participant_member_ids, cadence, next_run_at, created_by_user_id)
    VALUES (g, 'Forged', 1000, m_bob, ARRAY[m_bob], 'monthly', current_date + 30, alice);
    RAISE EXCEPTION 'forged creator was accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO settleup.recurring_expenses(id, group_id, item_name, amount_cents, payer_member_id, participant_member_ids, cadence, next_run_at, created_by_user_id)
  VALUES (t, g, 'Internet', 159900, m_bob, ARRAY[m_bob], 'monthly', current_date + 30, bob);

  -- Carol (a plain member) sees it but cannot pause or delete it.
  PERFORM set_config('request.jwt.claim.sub', carol::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', carol, 'role', 'authenticated')::text, true);
  ASSERT (SELECT count(*) FROM settleup.recurring_expenses WHERE id = t) = 1, 'Members still see templates';
  UPDATE settleup.recurring_expenses SET active = false WHERE id = t;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'A plain member cannot pause someone else''s template';
  DELETE FROM settleup.recurring_expenses WHERE id = t;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 0, 'A plain member cannot delete someone else''s template';

  -- The creator can pause it.
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
  UPDATE settleup.recurring_expenses SET active = false WHERE id = t;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'The creator can pause their template';

  -- The group owner can delete it.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
  DELETE FROM settleup.recurring_expenses WHERE id = t;
  GET DIAGNOSTICS n = ROW_COUNT;
  ASSERT n = 1, 'The group owner can delete any template';
END $$;
ROLLBACK;
