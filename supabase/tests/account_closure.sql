BEGIN;
DO $$
DECLARE owner_id uuid:=gen_random_uuid(); other_id uuid:=gen_random_uuid();
  g uuid; transferred uuid; owner_member uuid; other_member uuid; exp uuid:=gen_random_uuid(); result jsonb; denied boolean; changed integer;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (owner_id,'closure-owner-'||owner_id||'@example.invalid','{}'),
    (other_id,'closure-member-'||other_id||'@example.invalid','{}');
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('role','authenticated',true);
  result:=settleup.create_group_with_owner('Preserve this group',gen_random_uuid());
  g:=(result->'group'->>'id')::uuid;
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_id=g AND user_id=owner_id;
  INSERT INTO settleup.group_members(group_id,display_name,slug,share_token,user_id,role)
    VALUES(g,'Other member','other',gen_random_uuid()::text,other_id,'admin') RETURNING id INTO other_member;
  INSERT INTO settleup.expenses(id,group_id,item_name,amount_cents,created_by_user_id) VALUES(exp,g,'Shared dinner',1200,owner_id);
  INSERT INTO settleup.expense_payers(expense_id,member_id,paid_cents) VALUES(exp,owner_member,1200);
  INSERT INTO settleup.expense_participants(expense_id,member_id,share_cents) VALUES(exp,owner_member,600),(exp,other_member,600);
  INSERT INTO settleup.user_payment_profiles(user_id,payer_display_name,bank_account_number) VALUES(owner_id,'Owner','private-test-number');
  result:=settleup.create_group_with_owner('Transferred group',gen_random_uuid());
  transferred:=(result->'group'->>'id')::uuid;
  INSERT INTO settleup.group_members(group_id,display_name,slug,share_token,user_id) VALUES(transferred,'New owner','new-owner',gen_random_uuid()::text,other_id) RETURNING id INTO other_member;
  PERFORM settleup.transfer_group_ownership(transferred,other_member);
  PERFORM settleup.close_account();
  PERFORM settleup.close_account(); -- idempotent
  ASSERT settleup.is_account_closed(), 'Closed status is authoritative';
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.user_payment_profiles WHERE user_id=owner_id), 'Payment identity must be removed';
  denied:=false;
  BEGIN PERFORM settleup.create_group_with_owner('Stale JWT',gen_random_uuid()); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied, 'Existing JWT must not restore access';
  PERFORM set_config('request.jwt.claim.sub',other_id::text,true);
  ASSERT EXISTS(SELECT 1 FROM settleup.groups WHERE id=g AND owner_user_id IS NULL), 'Other member must retain read access';
  ASSERT EXISTS(SELECT 1 FROM settleup.expenses WHERE id=exp AND amount_cents=1200), 'Ledger amount must be preserved';
  ASSERT EXISTS(SELECT 1 FROM settleup.group_members WHERE id=owner_member AND user_id IS NULL AND departed_at IS NOT NULL AND display_name='Former member'), 'Identity must be anonymized';
  ASSERT EXISTS(SELECT 1 FROM settleup.groups WHERE id=transferred AND owner_user_id=other_id), 'Earlier ownership transfer must be honored';
  UPDATE settleup.groups SET name='Still editable' WHERE id=transferred;
  denied:=false;
  BEGIN UPDATE settleup.expenses SET amount_cents=1300 WHERE id=exp; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied, 'Read-only expense must reject direct updates';
  denied:=false;
  BEGIN UPDATE settleup.expense_participants SET share_cents=700 WHERE expense_id=exp; GET DIAGNOSTICS changed=ROW_COUNT; denied:=changed=0; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied, 'Read-only allocations must reject direct updates';
  denied:=false;
  BEGIN UPDATE settleup.group_members SET user_id=other_id WHERE id=owner_member; GET DIAGNOSTICS changed=ROW_COUNT; denied:=changed=0; EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied, 'Departed identity must never be reclaimed';
  PERFORM set_config('role','none',true);
  ASSERT EXISTS(SELECT 1 FROM auth.users WHERE id=owner_id), 'Shared Auth user must survive app closure';
  ASSERT EXISTS(SELECT 1 FROM public.profiles WHERE id=owner_id), 'Shared public profile must survive app closure';
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.account_closure_transactions), 'No closure capability may remain';
  DELETE FROM auth.users WHERE id=owner_id;
  ASSERT EXISTS(SELECT 1 FROM settleup.groups WHERE id=g), 'Global Auth deletion must also preserve ledgers';
  DELETE FROM auth.users WHERE id=other_id;
  ASSERT EXISTS(SELECT 1 FROM settleup.groups WHERE id=transferred AND owner_user_id IS NULL), 'Direct Auth deletion must preserve an active owner ledger';
END $$;
ROLLBACK;
