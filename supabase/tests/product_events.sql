-- Transactional fixtures: no users, groups, events or payments survive this test.
-- Covers the product_events allowlist, RLS/grants, the anonymous RPC and its
-- limiter, closure detachment, and the server-derived account_created and
-- group_settled events.
BEGIN;
DO $$
DECLARE
  owner_id uuid := gen_random_uuid(); member_user uuid := gen_random_uuid(); admin_id uuid := gen_random_uuid();
  v_group_id uuid; owner_member uuid; linked_member uuid := gen_random_uuid(); guest_member uuid := gen_random_uuid();
  member_token text; group_token text; result jsonb; denied boolean; i integer; n integer; expense_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (owner_id,'events-owner-'||owner_id||'@example.invalid','{}'),
    (member_user,'events-member-'||member_user||'@example.invalid','{}'),
    (admin_id,'events-admin-'||admin_id||'@example.invalid','{}');
  -- Sign-up already created the profile, and promoting it with an UPDATE trips
  -- the role-escalation trigger (correctly: nobody is an admin yet). The
  -- trigger guards updates only, so recreate this fixture's profile as admin.
  DELETE FROM public.profiles WHERE id = admin_id;
  INSERT INTO public.profiles(id,email,role) VALUES (admin_id,'events-admin@example.invalid','admin');

  -- account_created is recorded by the auth trigger for every sign-up path.
  SELECT count(*) INTO n FROM settleup.product_events WHERE event_name='account_created' AND user_id IN (owner_id,member_user,admin_id);
  ASSERT n=3, 'auth.users inserts must record account_created, got '||n;

  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('role','authenticated',true);
  result := settleup.create_group_with_owner('Events verification',gen_random_uuid());
  v_group_id := (result->'group'->>'id')::uuid;
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_id=v_group_id AND user_id=owner_id;
  INSERT INTO settleup.group_members(id,group_id,display_name,slug,share_token,user_id) VALUES
    (linked_member,v_group_id,'Linked','events-linked',encode(extensions.gen_random_bytes(16),'hex'),member_user),
    (guest_member,v_group_id,'Guest','events-guest',encode(extensions.gen_random_bytes(16),'hex'),NULL);
  SELECT share_token INTO member_token FROM settleup.group_members WHERE id=guest_member;
  SELECT share_token INTO group_token FROM settleup.groups WHERE id=v_group_id;

  -- Signed-in insert of an allowlisted event succeeds; the row is invisible to its author.
  INSERT INTO settleup.product_events(event_name,user_id,platform,properties)
    VALUES ('expense_saved',owner_id,'web','{"entry_mode":"quick","participant_bucket":"2"}');
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.product_events WHERE user_id=owner_id AND event_name='expense_saved'), 'Non-admins must not read events';

  -- Rejected: another user's id, server platform, free text, extra keys, unknown names, chosen timestamps.
  denied:=false; BEGIN INSERT INTO settleup.product_events(event_name,user_id,platform,properties) VALUES ('group_created',member_user,'web','{}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Cannot attribute an event to another user';
  denied:=false; BEGIN INSERT INTO settleup.product_events(event_name,user_id,platform,properties) VALUES ('group_created',owner_id,'server','{}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Clients cannot claim the server platform';
  denied:=false; BEGIN INSERT INTO settleup.product_events(event_name,user_id,platform,properties) VALUES ('group_created',owner_id,'web','{"group_name":"Trip"}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Free-text properties must be rejected';
  denied:=false; BEGIN INSERT INTO settleup.product_events(event_name,user_id,platform,properties) VALUES ('expense_saved',owner_id,'web','{"entry_mode":"Dinner","participant_bucket":"2"}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Values outside the enumeration must be rejected';
  denied:=false; BEGIN INSERT INTO settleup.product_events(event_name,user_id,platform,properties) VALUES ('page_viewed',owner_id,'web','{}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Unknown event names must be rejected';
  denied:=false; BEGIN INSERT INTO settleup.product_events(event_name,user_id,platform,properties,occurred_at) VALUES ('group_created',owner_id,'web','{}',now()-interval '1 year'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Clients cannot choose occurred_at';
  denied:=false; BEGIN UPDATE settleup.product_events SET platform='ios' WHERE user_id=owner_id; IF NOT FOUND THEN denied:=true; END IF; EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Clients cannot update events';

  -- Anonymous public events: attributed by token, limited per token, invalid opens bounded by a sentinel.
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('role','anon',true);
  ASSERT settleup.track_public_event(member_token,'public_link_opened','{"link_type":"member","status":"valid"}'), 'Member token records an open';
  ASSERT settleup.track_public_event(group_token,'payment_details_actioned','{"action":"qr"}'), 'Group token records a detail action';
  ASSERT NOT settleup.track_public_event('not-a-token','public_link_opened','{"link_type":"member","status":"valid"}'), 'Unknown tokens record nothing';
  ASSERT settleup.track_public_event(NULL,'public_link_opened','{"link_type":"group","status":"invalid"}'), 'Invalid opens may be recorded without a token';
  ASSERT NOT settleup.track_public_event(NULL,'payment_claim_submitted','{}'), 'Only invalid opens may omit the token';
  denied:=false; BEGIN PERFORM settleup.track_public_event(member_token,'group_created','{}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Private events cannot be recorded anonymously';
  denied:=false; BEGIN PERFORM settleup.track_public_event(member_token,'public_link_opened','{"status":"valid"}'); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Incomplete properties are rejected';
  FOR i IN 1..70 LOOP PERFORM settleup.track_public_event(member_token,'payment_claim_submitted','{}'); END LOOP;
  ASSERT NOT settleup.track_public_event(member_token,'payment_claim_submitted','{}'), 'Per-token limit must stop recording';
  ASSERT settleup.track_public_event(group_token,'payment_claim_submitted','{}'), 'Other tokens keep their own budget';

  -- Admin reads; author-less public rows carry no user.
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  PERFORM set_config('role','authenticated',true);
  SELECT count(*) INTO n FROM settleup.product_events WHERE user_id=owner_id AND event_name='expense_saved';
  ASSERT n=1, 'Admins read events';
  SELECT count(*) INTO n FROM settleup.product_events WHERE event_name='payment_claim_submitted' AND user_id IS NULL;
  ASSERT n=60, 'Exactly the allowed anonymous claims were stored (59 under the member token, 1 under the group token), got '||n;

  -- group_settled: one expense split two ways, then a PAID payment that zeroes every balance.
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM settleup.create_expense(jsonb_build_object(
    'id',expense_id,'group_id',v_group_id,'item_name','Dinner','amount_cents',1000,'split_mode','equal',
    'participant_ids',jsonb_build_array(owner_member,linked_member),
    'payers',jsonb_build_array(jsonb_build_object('member_id',owner_member,'paid_cents',1000))));
  SELECT count(*) INTO n FROM settleup.product_events WHERE event_name='group_settled' AND user_id=owner_id;
  ASSERT n=0, 'Nothing is settled before a payment';
  PERFORM settleup.record_payment(v_group_id,linked_member,owner_member,500::bigint,gen_random_uuid());
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SELECT count(*) INTO n FROM settleup.product_events WHERE event_name='group_settled' AND platform='server' AND user_id=owner_id;
  ASSERT n=1, 'A payment that clears all balances records group_settled, got '||n;
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM settleup.record_payment(v_group_id,owner_member,linked_member,100::bigint,gen_random_uuid());
  PERFORM settleup.record_payment(v_group_id,linked_member,owner_member,100::bigint,gen_random_uuid());
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  SELECT count(*) INTO n FROM settleup.product_events WHERE event_name='group_settled' AND user_id=owner_id;
  ASSERT n=1, 'Re-settling the same ledger state must not record again, got '||n;

  -- Closing the app account detaches its events.
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM settleup.close_account();
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.product_events WHERE user_id=owner_id), 'Closed accounts keep no attributed events';
  SELECT count(*) INTO n FROM settleup.product_events WHERE event_name='expense_saved' AND user_id IS NULL;
  ASSERT n>=1, 'Detached events remain for aggregates';

  RAISE NOTICE 'product_events: all assertions passed';
END $$;
ROLLBACK;
