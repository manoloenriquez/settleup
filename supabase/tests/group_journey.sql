-- Journey D + external-member scenarios 1, 6, 7, 8 (audit phase 9).
-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); charlie uuid := gen_random_uuid(); sarah_user uuid := gen_random_uuid();
  g uuid; invite text; group_token text;
  m_alice uuid; m_bob uuid; m_charlie uuid; m_sarah uuid := gen_random_uuid(); m_james uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e3 uuid := gen_random_uuid();
  bal jsonb; net_sum bigint; n integer; claim text; e1_version text; view jsonb; sarah_before bigint;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (alice, 'journey-a@' || alice || '.example.invalid', '{}'),
    (bob, 'journey-b@' || bob || '.example.invalid', '{}'),
    (charlie, 'journey-c@' || charlie || '.example.invalid', '{}'),
    (sarah_user, 'journey-s@' || sarah_user || '.example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);

  -- Alice creates a PHP group; Bob and Charlie join with the invite code.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  g := (settleup.create_group_v2('Bali trip', gen_random_uuid(), 'PHP', 'Alice')->'group'->>'id')::uuid;
  SELECT invite_code, share_token INTO invite, group_token FROM settleup.groups WHERE id = g;
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM settleup.join_group_by_invite(invite);
  PERFORM set_config('request.jwt.claim.sub', charlie::text, true);
  PERFORM settleup.join_group_by_invite(invite);
  -- Two people without accounts.
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token) VALUES
    (m_sarah, g, 'Sarah', 'journey-sarah', encode(extensions.gen_random_bytes(16), 'hex')),
    (m_james, g, 'James', 'journey-james', encode(extensions.gen_random_bytes(16), 'hex'));
  SELECT id INTO m_alice FROM settleup.group_members WHERE group_id = g AND user_id = alice;
  SELECT id INTO m_bob FROM settleup.group_members WHERE group_id = g AND user_id = bob;
  SELECT id INTO m_charlie FROM settleup.group_members WHERE group_id = g AND user_id = charlie;
  PERFORM set_config('role', 'authenticated', true);

  -- E1: Alice pays ₱3,000 for all five, equally.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM settleup.create_expense(jsonb_build_object('id', e1, 'group_id', g, 'item_name', 'Villa', 'amount_cents', 300000,
    'currency_code', 'PHP', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(m_alice, m_bob, m_charlie, m_sarah, m_james),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_alice, 'paid_cents', 300000))));
  -- E2: Bob pays ₱1,000, custom split (Alice 200, Bob 300, Charlie 500).
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Scooters', 'amount_cents', 100000,
    'currency_code', 'PHP', 'split_mode', 'custom',
    'custom_splits', jsonb_build_array(
      jsonb_build_object('member_id', m_alice, 'share_cents', 20000),
      jsonb_build_object('member_id', m_bob, 'share_cents', 30000),
      jsonb_build_object('member_id', m_charlie, 'share_cents', 50000)),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_bob, 'paid_cents', 100000))));
  -- E3: Charlie pays ₱10.01 for three — the odd centavo must not vanish.
  PERFORM set_config('request.jwt.claim.sub', charlie::text, true);
  PERFORM settleup.create_expense(jsonb_build_object('id', e3, 'group_id', g, 'item_name', 'Water', 'amount_cents', 1001,
    'currency_code', 'PHP', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(m_alice, m_bob, m_charlie),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_charlie, 'paid_cents', 1001))));
  ASSERT (SELECT sum(share_cents) FROM settleup.expense_participants WHERE expense_id = e3) = 1001, '₱10.01 / 3 sums exactly';
  ASSERT (SELECT bool_and(share_cents IN (333, 334)) FROM settleup.expense_participants WHERE expense_id = e3), 'Rounding moves at most one centavo';

  -- Alice edits E1 to ₱2,500 (₱500 each).
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  SELECT updated_at::text INTO e1_version FROM settleup.expenses WHERE id = e1;
  PERFORM settleup.update_expense(jsonb_build_object('expense_id', e1, 'expected_updated_at', e1_version,
    'item_name', 'Villa', 'amount_cents', 250000, 'currency_code', 'PHP', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(m_alice, m_bob, m_charlie, m_sarah, m_james),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_alice, 'paid_cents', 250000))));

  -- Bob partly repays Alice ₱300.
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM settleup.record_payment_v2(g, m_bob, m_alice, 30000, gen_random_uuid(), 'PHP');

  -- Balances: they sum to zero and match the arithmetic by hand.
  bal := settleup.get_member_balances_v2(g, 'PHP');
  SELECT sum((b->>'net_cents')::bigint) INTO net_sum FROM jsonb_array_elements(bal) b;
  ASSERT net_sum = 0, 'Balances sum to zero';
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(bal) b WHERE b->>'member_id' = m_sarah::text) = -50000, 'Sarah (no account) owes ₱500';
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(bal) b WHERE b->>'member_id' = m_james::text) = -50000, 'James (no account) owes ₱500';
  -- Bob: paid 1,000 − shares (500 + 300 + 333/334) + paid out 300 → 167 or 166 cents short of... computed exactly:
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(bal) b WHERE b->>'member_id' = m_bob::text)
       = 100000 - 50000 - 30000 - (SELECT share_cents FROM settleup.expense_participants WHERE expense_id = e3 AND member_id = m_bob) + 30000,
    'Bob matches paid − shares + repaid';
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(bal) b WHERE b->>'member_id' = m_alice::text)
       = 250000 - 50000 - 20000 - (SELECT share_cents FROM settleup.expense_participants WHERE expense_id = e3 AND member_id = m_alice) - 30000,
    'Alice matches paid − shares − received';

  -- Scenario 8: a USD expense paid by James is kept in its own currency.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM settleup.create_expense(jsonb_build_object('group_id', g, 'item_name', 'Surf lesson', 'amount_cents', 6000,
    'currency_code', 'USD', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(m_alice, m_james),
    'payers', jsonb_build_array(jsonb_build_object('member_id', m_james, 'paid_cents', 6000))));
  ASSERT (SELECT sum((b->>'net_cents')::bigint) FROM jsonb_array_elements(settleup.get_member_balances_v2(g, 'PHP')) b) = 0, 'PHP still balances';
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(settleup.get_member_balances_v2(g, 'USD')) b WHERE b->>'member_id' = m_james::text) = 3000, 'James is owed $30 in USD only';
  ASSERT settleup.get_group_currencies(g) = '["PHP", "USD"]'::jsonb, 'Group currencies listed';

  -- Scenario 3 + 6: organizer-entered details for James show where he is owed, and stop when removed.
  PERFORM settleup.upsert_member_payment_details(m_james, '{"gcash_number":"09170001111"}');
  PERFORM set_config('role', 'anon', true);
  ASSERT settleup.get_share_currencies(group_token) = '["PHP", "USD"]'::jsonb, 'Shared link knows both currencies';
  view := settleup.get_group_overview_v2(group_token, 'USD');
  ASSERT (SELECT count(*) FROM jsonb_array_elements(view->'creditor_profiles') c WHERE c->>'member_id' = m_james::text AND c->>'source' = 'organizer') = 1,
    'James can be paid via the shared page';
  ASSERT (SELECT count(*) FROM jsonb_array_elements(settleup.get_group_overview_v2(group_token, 'PHP')->'creditor_profiles') c WHERE c->>'member_id' = m_james::text) = 0,
    'James is not shown as a payee in PHP, where he owes';
  PERFORM set_config('role', 'authenticated', true);
  PERFORM settleup.delete_member_payment_details(m_james);
  PERFORM set_config('role', 'anon', true);
  ASSERT (SELECT count(*) FROM jsonb_array_elements(settleup.get_group_overview_v2(group_token, 'USD')->'creditor_profiles') c WHERE c->>'member_id' = m_james::text) = 0,
    'Removed details disappear from the shared page';

  -- Scenario 7: Sarah claims her record with a new account; nothing duplicates or moves.
  PERFORM set_config('role', 'authenticated', true);
  sarah_before := (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(settleup.get_member_balances_v2(g, 'PHP')) b WHERE b->>'member_id' = m_sarah::text);
  claim := settleup.create_member_claim_invitation(m_sarah)->>'token';
  PERFORM set_config('request.jwt.claim.sub', sarah_user::text, true);
  PERFORM settleup.claim_member_with_token(claim);
  PERFORM set_config('role', 'postgres', true);
  SELECT count(*) INTO n FROM settleup.group_members WHERE group_id = g;
  ASSERT n = 5, 'No duplicate member after the claim';
  ASSERT (SELECT user_id FROM settleup.group_members WHERE id = m_sarah) = sarah_user, 'Sarah''s record is now hers';
  PERFORM set_config('role', 'authenticated', true);
  ASSERT (SELECT (b->>'net_cents')::bigint FROM jsonb_array_elements(settleup.get_member_balances_v2(g, 'PHP')) b WHERE b->>'member_id' = m_sarah::text) = sarah_before,
    'Sarah''s balance is unchanged by the claim';

  -- Charlie leaves: he can no longer read the group.
  PERFORM set_config('request.jwt.claim.sub', charlie::text, true);
  PERFORM settleup.leave_group(g);
  SELECT count(*) INTO n FROM settleup.expenses WHERE group_id = g;
  ASSERT n = 0, 'A member who left cannot read the group''s expenses';
END $$;
ROLLBACK;
