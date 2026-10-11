-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid(); friend_id uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  g uuid; owner_member uuid; guest uuid := gen_random_uuid(); friend_member uuid := gen_random_uuid();
  old_token text; new_token text; guest_token text; result jsonb; view jsonb; denied boolean; claim text;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (owner_id, 'privacy-owner@' || owner_id || '.example.invalid', '{}'),
    (friend_id, 'privacy-friend@' || friend_id || '.example.invalid', '{}'),
    (stranger, 'privacy-stranger@' || stranger || '.example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.create_group_v2('Privacy trip', gen_random_uuid(), 'PHP', 'Owner');
  g := (result->'group'->>'id')::uuid;
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_id = g AND user_id = owner_id;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(id, group_id, display_name, slug, share_token)
    VALUES (guest, g, 'Sarah', 'privacy-sarah', encode(extensions.gen_random_bytes(16), 'hex'));
  SELECT share_token INTO guest_token FROM settleup.group_members WHERE id = guest;
  INSERT INTO settleup.user_payment_profiles(user_id, payer_display_name, gcash_name, gcash_number, bank_name, bank_account_number)
    VALUES (owner_id, 'Owner', 'Owner G', '09171234567', 'BDO', '001234567890');
  PERFORM set_config('role', 'authenticated', true);
  -- Owner paid 1,000 for both: Sarah owes the owner 500.
  PERFORM settleup.create_expense(jsonb_build_object(
    'group_id', g, 'item_name', 'Dinner', 'amount_cents', 100000, 'currency_code', 'PHP', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(owner_member, guest),
    'payers', jsonb_build_array(jsonb_build_object('member_id', owner_member, 'paid_cents', 100000))));
  SELECT share_token INTO old_token FROM settleup.groups WHERE id = g;

  -- B. New profiles are not shown on links until the owner opts in.
  PERFORM set_config('role', 'anon', true);
  view := settleup.get_group_overview_v2(old_token, 'PHP');
  ASSERT view->'payment_profile' = 'null'::jsonb OR view->'payment_profile' IS NULL, 'Not opted in: no organizer profile';
  ASSERT jsonb_array_length(view->'creditor_profiles') = 0, 'Not opted in: no creditor profiles';
  PERFORM set_config('role', 'postgres', true);
  UPDATE settleup.user_payment_profiles SET show_on_shared_links = true WHERE user_id = owner_id;
  PERFORM set_config('role', 'anon', true);
  view := settleup.get_group_overview_v2(old_token, 'PHP');
  ASSERT view->'creditor_profiles'->0->>'bank_account_number' = '****7890', 'Opted in: masked by default';
  ASSERT view->'creditor_profiles'->0->>'source' = 'self', 'Own profile is labelled self';
  ASSERT view::text NOT LIKE '%001234567890%', 'Full number never leaks while masked';
  -- Only people owed money in this currency: nobody is owed in USD.
  view := settleup.get_group_overview_v2(old_token, 'USD');
  ASSERT jsonb_array_length(view->'creditor_profiles') = 0, 'No creditor in USD';
  PERFORM set_config('role', 'postgres', true);
  UPDATE settleup.user_payment_profiles SET share_full_numbers = true WHERE user_id = owner_id;
  PERFORM set_config('role', 'anon', true);
  view := settleup.get_friend_view_v2(guest_token, 'PHP');
  ASSERT view->'creditor_profiles'->0->>'bank_account_number' = '001234567890', 'Full numbers when the owner chose to share them';
  -- Hiding in this group wins over the global opt-in.
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM settleup.set_hide_payment_details(g, true);
  PERFORM set_config('role', 'anon', true);
  view := settleup.get_group_overview_v2(old_token, 'PHP');
  ASSERT jsonb_array_length(view->'creditor_profiles') = 0 AND (view->'payment_profile' IS NULL OR view->'payment_profile' = 'null'::jsonb), 'Hidden in this group';
  PERFORM set_config('role', 'authenticated', true);
  PERFORM settleup.set_hide_payment_details(g, false);

  -- C. Organizer-entered details for a member without an account.
  -- Sarah pays 2,000 for both: now she is owed money.
  PERFORM settleup.create_expense(jsonb_build_object(
    'group_id', g, 'item_name', 'Hotel', 'amount_cents', 200000, 'currency_code', 'PHP', 'split_mode', 'equal',
    'participant_ids', jsonb_build_array(owner_member, guest),
    'payers', jsonb_build_array(jsonb_build_object('member_id', guest, 'paid_cents', 200000))));
  PERFORM settleup.upsert_member_payment_details(guest, '{"gcash_name":"Sarah","gcash_number":"09998887777","share_full_numbers":false}');
  PERFORM set_config('role', 'anon', true);
  view := settleup.get_group_overview_v2(old_token, 'PHP');
  ASSERT (SELECT count(*) FROM jsonb_array_elements(view->'creditor_profiles') c WHERE c->>'source' = 'organizer' AND c->>'gcash_number' = '****7777') = 1,
    'Organizer-entered details appear, labelled and masked';
  -- Signed-in members see the full number.
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.get_creditor_profiles_v2(g, 'PHP');
  ASSERT (SELECT count(*) FROM jsonb_array_elements(result) c WHERE c->>'gcash_number' = '09998887777') = 1, 'Members see full details';
  -- Strangers cannot write details.
  PERFORM set_config('request.jwt.claim.sub', stranger::text, true);
  denied := false;
  BEGIN PERFORM settleup.upsert_member_payment_details(guest, '{"gcash_number":"1"}'); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  ASSERT denied, 'Strangers cannot add details';
  denied := false;
  BEGIN PERFORM settleup.rotate_group_share_token(g); EXCEPTION WHEN insufficient_privilege THEN denied := true; END;
  ASSERT denied, 'Strangers cannot rotate the link';

  -- A. Rotate and disable.
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  new_token := settleup.rotate_group_share_token(g)->>'share_token';
  ASSERT length(new_token) = 64 AND new_token <> old_token, '256-bit token issued';
  PERFORM set_config('role', 'anon', true);
  ASSERT settleup.get_group_overview_v2(old_token, 'PHP') ? 'error', 'Old link stops working';
  ASSERT settleup.get_share_currencies(old_token) = '[]'::jsonb, 'Old link reveals nothing';
  ASSERT settleup.get_group_overview_v2(new_token, 'PHP') ? 'members', 'New link works';
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.set_group_share_enabled(g, false);
  ASSERT result->>'share_token' IS NULL, 'Turning off never returns a token';
  PERFORM set_config('role', 'anon', true);
  ASSERT settleup.get_group_overview_v2(new_token, 'PHP') ? 'error', 'Disabled link stops working';
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.set_group_share_enabled(g, true);
  ASSERT result->>'share_token' IS NOT NULL AND result->>'share_token' <> new_token, 'Turning on issues a new link';

  -- Claiming the member record hands control to the person's own profile.
  PERFORM set_config('role', 'authenticated', true);
  claim := settleup.create_member_claim_invitation(guest)->>'token';
  PERFORM set_config('request.jwt.claim.sub', friend_id::text, true);
  PERFORM settleup.claim_member_with_token(claim);
  PERFORM set_config('role', 'postgres', true);
  ASSERT NOT EXISTS (SELECT 1 FROM settleup.member_payment_details WHERE member_id = guest), 'Organizer details removed on claim';
END $$;
ROLLBACK;
