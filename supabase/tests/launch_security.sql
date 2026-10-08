-- Transactional fixtures: no users, groups, or payments survive this test.
BEGIN;
DO $$
DECLARE
  owner_id uuid:=gen_random_uuid(); guest_id uuid:=gen_random_uuid(); outsider_id uuid:=gen_random_uuid();
  v_group_id uuid; member_id uuid:=gen_random_uuid(); owner_member uuid;
  token text; old_token text; view_token text; request_id uuid:=gen_random_uuid(); payment_id uuid;
  result jsonb; denied boolean; i integer;
BEGIN
  INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
    (owner_id,'launch-owner-'||owner_id||'@example.invalid','{}'),
    (guest_id,'launch-guest-'||guest_id||'@example.invalid','{}'),
    (outsider_id,'launch-outsider-'||outsider_id||'@example.invalid','{}');
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM set_config('role','authenticated',true);
  result:=settleup.create_group_with_owner('Launch verification',gen_random_uuid());
  v_group_id:=(result->'group'->>'id')::uuid;
  SELECT id INTO owner_member FROM settleup.group_members WHERE group_members.group_id=v_group_id AND user_id=owner_id;
  INSERT INTO settleup.group_members(id,group_id,display_name,slug,share_token)
    VALUES(member_id,v_group_id,'Guest','launch-guest',encode(extensions.gen_random_bytes(16),'hex'));
  SELECT share_token INTO view_token FROM settleup.group_members WHERE id=member_id;
  old_token:=settleup.create_member_claim_invitation(member_id)->>'token';
  token:=settleup.create_member_claim_invitation(member_id)->>'token';
  ASSERT old_token<>token, 'Invitation rotation must generate a new token';
  ASSERT NOT has_function_privilege('authenticated','settleup.claim_member(uuid)','EXECUTE'), 'Legacy claiming must not be callable';
  PERFORM set_config('request.jwt.claim.sub',guest_id::text,true);
  denied:=false;
  BEGIN PERFORM settleup.claim_member_with_token(old_token); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Rotated invitations must fail';
  denied:=false;
  BEGIN PERFORM settleup.claim_member_with_token(view_token); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Viewing token must not grant membership';
  result:=settleup.claim_member_with_token(token);
  ASSERT (result->'member'->>'user_id')::uuid=guest_id, 'Invitation must attach the intended member';
  PERFORM settleup.claim_member_with_token(token); -- retry is safe
  PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
  denied:=false;
  BEGIN PERFORM settleup.claim_member_with_token(token); EXCEPTION WHEN OTHERS THEN denied:=true; END;
  ASSERT denied, 'Claimed invitation cannot be reused by another account';
  ASSERT NOT EXISTS(SELECT 1 FROM settleup.groups WHERE id=v_group_id), 'Outsider must not read the group';
  PERFORM set_config('role','anon',true);
  PERFORM set_config('request.jwt.claim.sub','',true);
  result:=settleup.submit_friend_payment(view_token,owner_member,100,request_id,'test');
  payment_id:=(result->>'payment_id')::uuid;
  ASSERT (settleup.submit_friend_payment(view_token,owner_member,100,request_id,'test')->>'payment_id')::uuid=payment_id, 'Retry must return the same report';
  denied:=false;
  BEGIN PERFORM settleup.submit_friend_payment(view_token,owner_member,101,request_id,'test'); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied, 'Changed replay must conflict';
  FOR i IN 1..4 LOOP PERFORM settleup.submit_friend_payment(view_token,owner_member,100,gen_random_uuid()); END LOOP;
  denied:=false;
  BEGIN PERFORM settleup.submit_friend_payment(view_token,owner_member,100,gen_random_uuid()); EXCEPTION WHEN SQLSTATE 'PT429' THEN denied:=true; END;
  ASSERT denied, 'Direct anonymous RPC calls must be rate limited';
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
  denied:=false;
  BEGIN PERFORM settleup.resolve_pending_payment(payment_id,'PAID'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied, 'Outsider must not resolve reports';
  PERFORM set_config('request.jwt.claim.sub',owner_id::text,true);
  PERFORM settleup.resolve_pending_payment(payment_id,'PAID');
  PERFORM settleup.resolve_pending_payment(payment_id,'PAID');
  denied:=false;
  BEGIN PERFORM settleup.resolve_pending_payment(payment_id,'REJECTED'); EXCEPTION WHEN SQLSTATE 'PT409' THEN denied:=true; END;
  ASSERT denied, 'Contradictory resolution must conflict';
  PERFORM set_config('request.jwt.claim.sub',outsider_id::text,true);
  denied:=false;
  BEGIN PERFORM settleup.resolve_pending_payment(payment_id,'PAID'); EXCEPTION WHEN insufficient_privilege THEN denied:=true; END;
  ASSERT denied, 'Even successful replays require authorization';
  PERFORM set_config('role','none',true);
END $$;
ROLLBACK;
