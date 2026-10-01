BEGIN;
DO $$
DECLARE owner_id uuid := gen_random_uuid(); stranger uuid := gen_random_uuid();
  g uuid; owner_member uuid; member_token text; group_token text; result jsonb; codes jsonb;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (owner_id, 'currency-helpers-' || owner_id || '@example.invalid', '{}'),
    (stranger, 'currency-stranger-' || stranger || '@example.invalid', '{}');
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config('role', 'authenticated', true);
  result := settleup.create_group_v2('Tokyo trip', gen_random_uuid(), 'JPY', 'Owner');
  g := (result->'group'->>'id')::uuid;
  group_token := result->'group'->>'share_token';
  SELECT id, share_token INTO owner_member, member_token FROM settleup.group_members WHERE group_id = g AND user_id = owner_id;
  PERFORM settleup.create_expense(jsonb_build_object(
    'group_id', g, 'item_name', 'Airport bus', 'amount_cents', 1200, 'currency_code', 'USD',
    'payers', jsonb_build_array(jsonb_build_object('member_id', owner_member, 'paid_cents', 1200)),
    'split_mode', 'equal', 'participant_ids', jsonb_build_array(owner_member)));

  codes := settleup.get_my_currencies();
  ASSERT codes ? 'JPY' AND codes ? 'USD', 'My currencies include default and used';

  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  ASSERT settleup.get_share_currencies(group_token) = '["JPY", "USD"]'::jsonb, 'Group link: default first';
  ASSERT settleup.get_share_currencies(member_token) = '["JPY", "USD"]'::jsonb, 'Member link resolves the same group';
  ASSERT settleup.get_share_currencies('not-a-token') = '[]'::jsonb, 'Unknown token reveals nothing';
  ASSERT settleup.get_share_currencies(NULL) = '[]'::jsonb, 'Null token reveals nothing';

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', stranger::text, true);
  ASSERT settleup.get_my_currencies() = '[]'::jsonb, 'Strangers see no currencies';
END $$;
ROLLBACK;
