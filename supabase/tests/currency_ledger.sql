-- Run after the currency migration. Fixtures, including Auth users, roll back.
BEGIN;
DO $$
DECLARE
  owner_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid(); g uuid:=gen_random_uuid();
  owner_member uuid; guest_member uuid:=gen_random_uuid(); v_expense_id uuid; payment_id uuid:=gen_random_uuid();
  token text; group_token text; c text; result jsonb; amount bigint; balance bigint; denied boolean;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (owner_id,'currency-owner-'||owner_id||'@example.invalid','{}'),
    (outsider_id,'currency-outsider-'||outsider_id||'@example.invalid','{}');
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('request.headers','{"x-ledger-version":"2"}',true);
  PERFORM set_config('role','authenticated',true);
  result:=settleup.create_group_v2('Currency verification',g,'USD','Organizer');
  ASSERT (result->'group'->>'default_currency_code'='USD') IS TRUE, 'Default currency must persist';
  PERFORM settleup.create_group_v2('Currency verification',g,'USD','Organizer');
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_id=g AND user_id=owner_id;
  INSERT INTO settleup.group_members(id,group_id,display_name,slug,share_token) VALUES(guest_member,g,'Guest','currency-guest',encode(extensions.gen_random_bytes(16),'hex'));
  SELECT share_token INTO token FROM settleup.group_members WHERE id=guest_member;
  SELECT share_token INTO group_token FROM settleup.groups WHERE id=g;
  FOREACH c IN ARRAY ARRAY['PHP','USD','JPY','KWD'] LOOP
    amount:=CASE c WHEN 'PHP' THEN 10000 WHEN 'USD' THEN 1200 WHEN 'JPY' THEN 901 ELSE 1234 END;
    v_expense_id:=gen_random_uuid();
    result:=settleup.create_expense(jsonb_build_object('id',v_expense_id,'group_id',g,'item_name',c||' expense','amount_cents',amount,'currency_code',c,'split_mode','equal',
      'participant_ids',jsonb_build_array(owner_member,guest_member),'payers',jsonb_build_array(jsonb_build_object('member_id',owner_member,'paid_cents',amount))));
    ASSERT (result->'expense'->>'currency_code'=c) IS TRUE, 'Expense must return its currency';
    ASSERT ((SELECT sum(share_cents) FROM settleup.expense_participants WHERE expense_participants.expense_id=v_expense_id)=amount) IS TRUE;
  END LOOP;
  result:=settleup.get_member_balances_v2(g,'USD');
  SELECT (r->>'net_cents')::bigint INTO balance FROM jsonb_array_elements(result) r WHERE r->>'member_id'=owner_member::text;
  ASSERT (balance=600) IS TRUE, 'USD balance must exclude PHP, JPY and KWD';
  result:=settleup.record_payment_v2(g,guest_member,owner_member,100,payment_id,'USD');
  PERFORM settleup.record_payment_v2(g,guest_member,owner_member,100,payment_id,'USD');
  denied:=false;
  BEGIN PERFORM settleup.record_payment_v2(g,guest_member,owner_member,100,payment_id,'PHP'); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT (denied) IS TRUE, 'Replay cannot change currency';
  result:=settleup.get_member_balances_v2(g,'USD');
  SELECT (r->>'net_cents')::bigint INTO balance FROM jsonb_array_elements(result) r WHERE r->>'member_id'=owner_member::text;
  ASSERT (balance=500) IS TRUE, 'Only USD payment must reduce USD debt';
  result:=settleup.get_member_balances_v2(g,'PHP');
  SELECT (r->>'net_cents')::bigint INTO balance FROM jsonb_array_elements(result) r WHERE r->>'member_id'=owner_member::text;
  ASSERT (balance=5000) IS TRUE, 'Historical PHP minor units must remain unchanged';
  PERFORM settleup.set_group_budget_v2(g,3000,'USD');
  ASSERT ((SELECT budget_currency_code='USD' AND budget_cents=3000 FROM settleup.groups WHERE id=g)) IS TRUE;
  ASSERT (jsonb_array_length(settleup.get_group_currencies(g))=4) IS TRUE;
  PERFORM settleup.get_dashboard_summary_v2('USD');
  PERFORM settleup.get_groups_with_stats_v2('JPY');
  PERFORM settleup.get_user_activity_v2(30,'KWD');
  denied:=false;
  BEGIN PERFORM settleup.get_member_balances(g); EXCEPTION WHEN SQLSTATE 'PT426' THEN denied:=true; END;
  ASSERT (denied) IS TRUE, 'Legacy reads must require an update for mixed ledgers';
  denied:=false;
  BEGIN UPDATE settleup.expenses SET currency_code='EUR' WHERE id=v_expense_id; EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT (denied) IS TRUE, 'Recorded currency cannot be relabeled';
  PERFORM set_config('request.headers','{}',true);
  ASSERT ((SELECT count(*) FROM settleup.expenses WHERE group_id=g)=1) IS TRUE, 'Legacy direct reads see only PHP';
  denied:=false;
  BEGIN UPDATE settleup.expenses SET item_name='Old client edit' WHERE group_id=g; EXCEPTION WHEN SQLSTATE 'PT426' THEN denied:=true; END;
  ASSERT (denied) IS TRUE, 'Old client writes to mixed ledgers must fail';
  PERFORM set_config('request.headers','{"x-ledger-version":"2"}',true);
  PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
  ASSERT (settleup.get_member_balances_v2(g,'USD')='[]'::jsonb) IS TRUE, 'Outsiders must not read balances';
  ASSERT (NOT EXISTS(SELECT 1 FROM settleup.expenses WHERE group_id=g)) IS TRUE, 'Currency header grants no group access';
  denied:=false;
  BEGIN PERFORM settleup.record_payment_v2(g,guest_member,owner_member,100,payment_id,'USD'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT (denied) IS TRUE, 'Replay authorization must precede success';
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  result:=settleup.get_friend_view_v2(token,'USD');
  ASSERT (result->>'currency_code'='USD' AND (result->>'owed_cents')::bigint=500) IS TRUE, 'Guest view must show separate USD balance';
  result:=settleup.get_group_overview_v2(group_token,'KWD');
  ASSERT (jsonb_array_length(result->'expenses')=1 AND result->>'currency_code'='KWD') IS TRUE;
  result:=settleup.submit_friend_payment_v2(token,owner_member,100,gen_random_uuid(),NULL,'USD');
  ASSERT (result->>'currency_code'='USD' AND result->>'status'='PENDING') IS TRUE;
  ASSERT (jsonb_array_length(settleup.get_friend_payment_reports_v2(token,'USD'))=1) IS TRUE;
  ASSERT (jsonb_array_length(settleup.get_friend_payment_reports_v2(token,'PHP'))=0) IS TRUE;
  result:=settleup.get_friend_view_v2(token,'USD');
  ASSERT ((result->>'owed_cents')::bigint=500) IS TRUE, 'Pending reports must not settle debt';
  PERFORM set_config('role','none',true);
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
