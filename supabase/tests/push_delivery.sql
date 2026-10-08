-- Transactional fixtures: no users, groups, tokens or payments survive this test.
-- Exercises settleup.build_push_messages and settleup.prune_push_tokens without
-- pg_net: app_config stays unset here, so the trigger itself is a no-op.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid(); member_user uuid := gen_random_uuid(); departed_user uuid := gen_random_uuid();
  v_group_id uuid; owner_member uuid; guest_member uuid := gen_random_uuid(); linked_member uuid := gen_random_uuid();
  departed_member uuid := gen_random_uuid();
  result jsonb; messages jsonb; denied boolean; pruned integer; secret text;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (owner_id,'push-owner-'||owner_id||'@example.invalid','{}'),
    (member_user,'push-member-'||member_user||'@example.invalid','{}'),
    (departed_user,'push-departed-'||departed_user||'@example.invalid','{}');
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('role','authenticated',true);
  result := settleup.create_group_with_owner('Push verification',gen_random_uuid());
  v_group_id := (result->'group'->>'id')::uuid;
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_id=v_group_id AND user_id=owner_id;
  INSERT INTO settleup.group_members(id,group_id,display_name,slug,share_token,user_id) VALUES
    (guest_member,v_group_id,'Guest','push-guest',encode(extensions.gen_random_bytes(16),'hex'),NULL),
    (linked_member,v_group_id,'Linked','push-linked',encode(extensions.gen_random_bytes(16),'hex'),member_user),
    (departed_member,v_group_id,'Former member','push-departed',encode(extensions.gen_random_bytes(16),'hex'),departed_user);
  UPDATE settleup.group_members SET departed_at=now() WHERE id=departed_member;

  PERFORM set_config('role','postgres',true);
  INSERT INTO settleup.push_tokens(user_id,token,platform) VALUES
    (owner_id,'ExponentPushToken[owner-1]','ios'),
    (member_user,'ExponentPushToken[member-1]','android'),
    (member_user,'ExponentPushToken[member-2]','ios'),
    (departed_user,'ExponentPushToken[departed-1]','ios');

  -- Client roles cannot build messages or format amounts directly.
  ASSERT NOT has_function_privilege('authenticated','settleup.build_push_messages(text,jsonb)','EXECUTE'), 'build_push_messages must not be client callable';
  ASSERT NOT has_function_privilege('anon','settleup.build_push_messages(text,jsonb)','EXECUTE'), 'build_push_messages must not be anon callable';
  ASSERT NOT has_function_privilege('authenticated','settleup.prune_push_tokens(text,text[])','EXECUTE'), 'prune must not be callable by signed-in users';
  ASSERT has_function_privilege('anon','settleup.prune_push_tokens(text,text[])','EXECUTE'), 'prune must be callable by the edge function with the anon key';

  -- expense_added: every linked, present member except the creator; one message per token.
  messages := settleup.build_push_messages('expense_added', jsonb_build_object(
    'group_id', v_group_id, 'item_name', 'Dinner', 'amount_cents', 123456, 'created_by_user_id', owner_id));
  ASSERT jsonb_array_length(messages)=2, 'Expected two device messages for the linked member, got '||messages::text;
  ASSERT messages->0->>'title'='Push verification', 'Title must be the group name';
  ASSERT messages->0->>'body'='New expense: Dinner (₱1,234.56)', 'Body must carry item and PHP amount, got '||(messages->0->>'body');
  ASSERT messages->0->'data'->>'route'='/groups/'||v_group_id, 'Route must target the group screen';
  ASSERT messages->0->'data'->>'event'='expense_added', 'Event must be carried in data';
  ASSERT NOT (messages::text LIKE '%owner-1%'), 'Creator must not be notified';
  ASSERT NOT (messages::text LIKE '%departed-1%'), 'Departed members must not be notified';
  ASSERT NOT (messages::text LIKE '%created_by_user_id%'), 'Row columns must not leak into the payload';

  -- Recurring or system inserts without a creator notify every linked member.
  messages := settleup.build_push_messages('expense_added', jsonb_build_object(
    'group_id', v_group_id, 'item_name', 'Rent', 'amount_cents', 500000));
  ASSERT jsonb_array_length(messages)=3, 'Creator-less inserts notify all linked members';

  -- payment_pending: only the creditor's devices, named after the payer.
  messages := settleup.build_push_messages('payment_pending', jsonb_build_object(
    'group_id', v_group_id, 'from_member_id', guest_member, 'to_member_id', linked_member, 'amount_cents', 2500));
  ASSERT jsonb_array_length(messages)=2, 'Pending payment must reach the creditor devices only';
  ASSERT messages->0->>'body'='Guest says they paid you ₱25.00 — tap to confirm', 'Pending body mismatch: '||(messages->0->>'body');

  -- payment_confirmed: only the payer; a guest payer without an account gets nothing.
  messages := settleup.build_push_messages('payment_confirmed', jsonb_build_object(
    'group_id', v_group_id, 'from_member_id', guest_member, 'to_member_id', linked_member, 'amount_cents', 2500));
  ASSERT jsonb_array_length(messages)=0, 'Account-less payer has no device';
  messages := settleup.build_push_messages('payment_confirmed', jsonb_build_object(
    'group_id', v_group_id, 'from_member_id', linked_member, 'to_member_id', owner_member, 'amount_cents', 2500));
  ASSERT jsonb_array_length(messages)=2, 'Confirmed payment must reach the payer devices';
  ASSERT messages->0->>'body'='Owner confirmed your ₱25.00 payment' OR messages->0->>'body' LIKE '% confirmed your ₱25.00 payment', 'Confirmed body mismatch: '||(messages->0->>'body');

  -- Unknown events and foreign groups produce nothing.
  -- Amounts use the expense's own currency (multi-currency ledger).
  messages := settleup.build_push_messages('expense_added', jsonb_build_object(
    'group_id', v_group_id, 'item_name', 'Taxi', 'amount_cents', 4500, 'currency_code', 'USD', 'created_by_user_id', owner_id));
  ASSERT messages->0->>'body'='New expense: Taxi (USD 45.00)', 'USD body mismatch: '||(messages->0->>'body');
  messages := settleup.build_push_messages('expense_added', jsonb_build_object(
    'group_id', v_group_id, 'item_name', 'Ramen', 'amount_cents', 1500, 'currency_code', 'JPY', 'created_by_user_id', owner_id));
  ASSERT messages->0->>'body'='New expense: Ramen (JPY 1,500)', 'JPY body mismatch: '||(messages->0->>'body');

  ASSERT settleup.build_push_messages('something_else', jsonb_build_object('group_id', v_group_id))='[]'::jsonb, 'Unknown events are ignored';
  ASSERT settleup.build_push_messages('expense_added', jsonb_build_object('group_id', gen_random_uuid(), 'amount_cents', 1))='[]'::jsonb, 'Unknown groups are ignored';

  -- Pruning requires the shared secret and is a no-op when push is not configured.
  PERFORM set_config('role','anon',true);
  denied := false;
  BEGIN PERFORM settleup.prune_push_tokens('guess', ARRAY['ExponentPushToken[member-2]']); EXCEPTION WHEN OTHERS THEN denied := true; END;
  ASSERT denied, 'Pruning without the configured secret must fail';
  PERFORM set_config('role','postgres',true);
  secret := 'test-secret-'||gen_random_uuid();
  INSERT INTO settleup.app_config(key,value) VALUES ('push_webhook_secret',secret);
  PERFORM set_config('role','anon',true);
  denied := false;
  BEGIN PERFORM settleup.prune_push_tokens('wrong', ARRAY['ExponentPushToken[member-2]']); EXCEPTION WHEN OTHERS THEN denied := true; END;
  ASSERT denied, 'Pruning with the wrong secret must fail';
  pruned := settleup.prune_push_tokens(secret, ARRAY['ExponentPushToken[member-2]','ExponentPushToken[unknown]']);
  ASSERT pruned=1, 'Exactly the listed registered token is removed, got '||pruned;
  PERFORM set_config('role','postgres',true);
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.push_tokens WHERE token='ExponentPushToken[member-2]'), 'Pruned token must be gone';
  ASSERT EXISTS(SELECT 1 FROM settleup.push_tokens WHERE token='ExponentPushToken[member-1]'), 'Other tokens stay';

  RAISE NOTICE 'push_delivery: all assertions passed';
END $$;
ROLLBACK;
