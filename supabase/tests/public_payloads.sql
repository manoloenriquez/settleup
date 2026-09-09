-- Transactional fixtures: no users, groups, profiles or tokens survive this test.
-- PRD 14 access matrix: anonymous callers on private RPCs, unrelated
-- authenticated users, public payload field allowlists for both link types,
-- masked account numbers on the group link, and share-token rotation with no
-- existence leak for invalid tokens.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid(); outsider_id uuid := gen_random_uuid();
  v_group_id uuid; owner_member uuid; guest_member uuid := gen_random_uuid();
  member_token text; new_token text; group_token text; invite text;
  result jsonb; bogus jsonb; stale jsonb; denied boolean; n integer;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (owner_id,'payload-owner-'||owner_id||'@example.invalid','{}'),
    (outsider_id,'payload-outsider-'||outsider_id||'@example.invalid','{}');
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('role','authenticated',true);
  result := settleup.create_group_with_owner('Payload verification',gen_random_uuid());
  v_group_id := (result->'group'->>'id')::uuid;
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_id=v_group_id AND user_id=owner_id;
  INSERT INTO settleup.group_members(id,group_id,display_name,slug,share_token)
    VALUES (guest_member,v_group_id,'Guest','payload-guest',encode(extensions.gen_random_bytes(16),'hex'));
  SELECT share_token INTO member_token FROM settleup.group_members WHERE id=guest_member;
  SELECT share_token, invite_code INTO group_token, invite FROM settleup.groups WHERE id=v_group_id;
  PERFORM settleup.create_expense(jsonb_build_object(
    'id',gen_random_uuid(),'group_id',v_group_id,'item_name','Dinner','amount_cents',1000,'split_mode','equal',
    'participant_ids',jsonb_build_array(owner_member,guest_member),
    'payers',jsonb_build_array(jsonb_build_object('member_id',owner_member,'paid_cents',1000))));
  PERFORM set_config('role','postgres',true);
  INSERT INTO settleup.user_payment_profiles(user_id,payer_display_name,gcash_name,gcash_number,bank_name,bank_account_name,bank_account_number)
    VALUES (owner_id,'Owner','Owner G','09171234567','BPI','Owner B','001234567890');

  -- Anonymous callers cannot reach private RPCs.
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('role','anon',true);
  denied := false; BEGIN PERFORM settleup.get_member_balances(v_group_id); EXCEPTION WHEN OTHERS THEN denied := true; END;
  ASSERT denied, 'Anonymous callers must not read balances';
  denied := false; BEGIN PERFORM settleup.get_groups_with_stats(); EXCEPTION WHEN OTHERS THEN denied := true; END;
  ASSERT denied, 'Anonymous callers must not list groups';
  denied := false; BEGIN PERFORM settleup.rotate_member_share_token(guest_member); EXCEPTION WHEN OTHERS THEN denied := true; END;
  ASSERT denied, 'Anonymous callers must not rotate tokens';

  -- An unrelated signed-in user sees nothing of the group.
  PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
  PERFORM set_config('role','authenticated',true);
  BEGIN result := settleup.get_member_balances(v_group_id); EXCEPTION WHEN OTHERS THEN result := '[]'::jsonb; END;
  ASSERT coalesce(jsonb_array_length(result),0)=0, 'Outsider must not read balances';
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.expenses WHERE group_id=v_group_id), 'Outsider must not read expenses';
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.group_members WHERE group_id=v_group_id), 'Outsider must not read members';
  denied := false; BEGIN PERFORM settleup.rotate_member_share_token(guest_member); EXCEPTION WHEN OTHERS THEN denied := true; END;
  ASSERT denied, 'Outsider must not rotate another group''s token';

  -- Member link: only the approved fields, never tokens, user ids or emails.
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('role','anon',true);
  result := settleup.get_friend_view(member_token);
  ASSERT result ? 'member' AND result ? 'group', 'Valid member token returns the view';
  SELECT count(*) INTO n FROM jsonb_object_keys(result) k
   WHERE k NOT IN ('group','member','net_cents','owed_cents','payment_profile','all_balances','creditor_profiles','expenses','currency_code');
  ASSERT n=0, 'Member view exposes an unapproved top-level field';
  SELECT count(*) INTO n FROM jsonb_object_keys(result->'member') k WHERE k NOT IN ('id','display_name','currency_code');
  ASSERT n=0, 'Member object must carry only id and display name';
  SELECT count(*) INTO n FROM jsonb_object_keys(result->'group') k WHERE k NOT IN ('id','name','currency_code');
  ASSERT n=0, 'Group object must carry only id and name';
  SELECT count(*) INTO n FROM jsonb_array_elements(coalesce(result->'all_balances','[]'::jsonb)) b, jsonb_object_keys(b) k
   WHERE k NOT IN ('member_id','display_name','net_cents','currency_code');
  ASSERT n=0, 'Other balances must not carry tokens or user ids';
  ASSERT result::text NOT LIKE '%'||member_token||'%', 'Member view must not echo the member token';
  ASSERT result::text NOT LIKE '%'||group_token||'%', 'Member view must not expose the group token';
  ASSERT result::text NOT LIKE '%'||invite||'%', 'Member view must not expose the invite code';
  ASSERT result::text NOT LIKE '%'||owner_id::text||'%', 'Member view must not expose user ids';
  ASSERT result::text NOT LIKE '%example.invalid%', 'Member view must not expose emails';

  -- Group link: approved fields only, account numbers masked.
  result := settleup.get_group_overview(group_token);
  ASSERT result ? 'members' AND result ? 'expenses', 'Valid group token returns the overview';
  SELECT count(*) INTO n FROM jsonb_object_keys(result) k
   WHERE k NOT IN ('group','members','expenses','payments','payment_profile','creditor_profiles','currency_code');
  ASSERT n=0, 'Group overview exposes an unapproved top-level field';
  SELECT count(*) INTO n FROM jsonb_array_elements(result->'members') m, jsonb_object_keys(m) k
   WHERE k NOT IN ('member_id','display_name','net_cents','owed_cents','currency_code');
  ASSERT n=0, 'Overview members must carry only ids, names and balances';
  ASSERT result::text NOT LIKE '%'||member_token||'%', 'Group overview must not expose member tokens';
  ASSERT result::text NOT LIKE '%'||group_token||'%', 'Group overview must not echo the group token';
  ASSERT result::text NOT LIKE '%'||invite||'%', 'Group overview must not expose the invite code';
  ASSERT result::text NOT LIKE '%'||owner_id::text||'%', 'Group overview must not expose user ids';
  ASSERT result::text NOT LIKE '%example.invalid%', 'Group overview must not expose emails';
  ASSERT result::text NOT LIKE '%09171234567%' AND result::text NOT LIKE '%001234567890%', 'Group overview must mask full account numbers';
  ASSERT result->'payment_profile'->>'gcash_number' LIKE '%4567', 'Masked numbers keep the last four digits';

  -- Invalid tokens fail identically whether they never existed or were rotated.
  bogus := settleup.get_friend_view('no-such-token-'||gen_random_uuid());
  ASSERT bogus IS NULL OR NOT (bogus ? 'group'), 'Unknown member token must not return a view';
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('role','authenticated',true);
  PERFORM settleup.rotate_member_share_token(guest_member);
  SELECT share_token INTO new_token FROM settleup.group_members WHERE id=guest_member;
  ASSERT new_token IS NOT NULL AND new_token<>member_token, 'Rotation must issue a new token';
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('role','anon',true);
  stale := settleup.get_friend_view(member_token);
  ASSERT stale IS NULL OR NOT (stale ? 'group'), 'Rotated token must stop working';
  ASSERT coalesce(stale::text,'null')=coalesce(bogus::text,'null'), 'Rotated and unknown tokens must be indistinguishable';
  ASSERT settleup.get_friend_view(new_token) ? 'group', 'New token must work';

  RAISE NOTICE 'public_payloads: all assertions passed';
END $$;
ROLLBACK;
