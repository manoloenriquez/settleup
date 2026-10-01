-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  manolo uuid := gen_random_uuid(); alex uuid := gen_random_uuid(); eve uuid := gen_random_uuid();
  token text; token2 text; result jsonb; g uuid; denied boolean; preview jsonb; n integer;
  m_manolo uuid; m_alex uuid; invite text;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (manolo, 'friends-a@' || manolo || '.example.invalid', '{}'),
    (alex, 'friends-b@' || alex || '.example.invalid', '{}'),
    (eve, 'friends-c@' || eve || '.example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Manolo creates an invite; the preview shows only his chosen name.
  PERFORM set_config('request.jwt.claim.sub', manolo::text, true);
  token := settleup.create_friend_invite('Manolo', 'PHP')->>'token';
  ASSERT token ~ '^[0-9a-f]{64}$', 'Invite token is 256-bit hex';
  PERFORM set_config('role', 'anon', true);
  preview := settleup.get_friend_invite_preview(token);
  ASSERT preview->>'inviter_name' = 'Manolo' AND preview->>'status' = 'open', 'Preview shows name and status';
  ASSERT preview::text NOT LIKE '%' || manolo::text || '%', 'Preview reveals no user id';
  ASSERT settleup.get_friend_invite_preview('nope')->>'status' = 'invalid', 'Bad token reveals nothing';
  PERFORM set_config('role', 'authenticated', true);

  -- Self-accept is refused.
  denied := false;
  BEGIN PERFORM settleup.accept_friend_invite(token, 'Me'); EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  ASSERT denied, 'Cannot befriend yourself';

  -- Alex accepts: a two-person direct ledger appears for both, once.
  PERFORM set_config('request.jwt.claim.sub', alex::text, true);
  result := settleup.accept_friend_invite(token, 'Alex');
  g := (result->>'direct_group_id')::uuid;
  ASSERT g IS NOT NULL, 'Ledger created';
  ASSERT (SELECT kind FROM settleup.groups WHERE id = g) = 'direct', 'Ledger is a direct group';
  ASSERT (settleup.accept_friend_invite(token, 'Alex')->>'direct_group_id')::uuid = g, 'Accept is idempotent';
  SELECT count(*) INTO n FROM settleup.group_members WHERE group_id = g;
  ASSERT n = 2, 'Exactly two members';
  ASSERT (settleup.list_friends()->0->>'display_name') = 'Manolo', 'Alex sees Manolo by chosen name';
  ASSERT settleup.list_friends()::text NOT LIKE '%example.invalid%', 'No emails in the friend list';

  -- Eve cannot reuse the invite, see the friendship, or join the ledger.
  PERFORM set_config('role', 'postgres', true);
  SELECT invite_code INTO invite FROM settleup.groups WHERE id = g;
  denied := false;
  BEGIN
    INSERT INTO settleup.group_members(group_id, display_name, slug, share_token) VALUES (g, 'Third', 'third', 'x');
  EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  ASSERT denied, 'Database refuses a third member';
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', eve::text, true);
  denied := false;
  BEGIN PERFORM settleup.accept_friend_invite(token, 'Eve'); EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  ASSERT denied, 'Used invite cannot be reused';
  ASSERT settleup.list_friends() = '[]'::jsonb, 'Others see no friendships';
  SELECT count(*) INTO n FROM settleup.friendships;
  ASSERT n = 0, 'RLS hides friendships from others';
  denied := false;
  BEGIN PERFORM settleup.join_group_by_invite(invite); EXCEPTION WHEN invalid_parameter_value THEN denied := true; END;
  ASSERT denied, 'No third person can join a friend ledger';

  -- A ₱2,000 dinner paid by Manolo, split equally: Alex owes Manolo ₱1,000.
  PERFORM set_config('request.jwt.claim.sub', manolo::text, true);
  SELECT id INTO m_manolo FROM settleup.group_members WHERE group_id = g AND user_id = manolo;
  SELECT id INTO m_alex FROM settleup.group_members WHERE group_id = g AND user_id = alex;
  PERFORM settleup.create_expense(jsonb_build_object(
    'group_id', g, 'item_name', 'Dinner', 'amount_cents', 200000, 'currency_code', 'PHP', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(m_manolo, m_alex),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_manolo, 'paid_cents', 200000))));
  result := settleup.get_member_balances_v2(g, 'PHP');
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(result) b WHERE b->>'member_id' = m_alex::text) = -100000, 'Alex owes ₱1,000';
  -- Alex settles: balance returns to zero.
  PERFORM set_config('request.jwt.claim.sub', alex::text, true);
  PERFORM settleup.record_payment_v2(g, m_alex, m_manolo, 100000, gen_random_uuid(), 'PHP');
  result := settleup.get_member_balances_v2(g, 'PHP');
  ASSERT (SELECT bool_and((b->>'net_cents')::bigint = 0) FROM jsonb_array_elements(result) b), 'Settled to zero';

  -- A second invite between the same pair returns the same ledger.
  PERFORM set_config('request.jwt.claim.sub', manolo::text, true);
  token2 := settleup.create_friend_invite('Manolo', 'USD')->>'token';
  PERFORM set_config('request.jwt.claim.sub', alex::text, true);
  ASSERT (settleup.accept_friend_invite(token2, 'Alex')->>'direct_group_id')::uuid = g, 'Pair keeps one ledger';

  -- Removing the friend keeps the ledger as an ordinary group.
  result := settleup.remove_friend(manolo);
  ASSERT (result->>'removed')::boolean, 'Friend removed';
  ASSERT (SELECT kind FROM settleup.groups WHERE id = g) = 'shared', 'Ledger kept as a normal group';
  ASSERT EXISTS (SELECT 1 FROM settleup.expenses WHERE group_id = g), 'Expenses kept';
  ASSERT settleup.list_friends() = '[]'::jsonb, 'No longer listed as a friend';
END $$;
ROLLBACK;
