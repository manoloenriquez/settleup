-- preview_group_invite (migration 20261009140000): tells a joiner whether the
-- group already lists someone with their name who has no account.
-- Transactional fixtures: nothing survives this test.
BEGIN;
DO $$
DECLARE
  alice uuid := gen_random_uuid(); bob uuid := gen_random_uuid(); carl uuid := gen_random_uuid();
  g uuid; code text; p jsonb; failed boolean;
BEGIN
  INSERT INTO auth.users(id, email, raw_user_meta_data) VALUES
    (alice, 'preview-a@' || alice || '.example.invalid', '{}'),
    (bob, 'preview-b@' || bob || '.example.invalid', '{}'),
    (carl, 'preview-c@' || carl || '.example.invalid', '{}');
  UPDATE public.profiles SET full_name = 'Alice' WHERE id = alice;
  UPDATE public.profiles SET full_name = 'bob ' WHERE id = bob;
  UPDATE public.profiles SET full_name = 'Carl' WHERE id = carl;
  PERFORM set_config('request.headers', '{"x-ledger-version":"2"}', true);
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
  g := (settleup.create_group_v2('Preview Trip', gen_random_uuid(), 'PHP', 'Alice')->'group'->>'id')::uuid;
  PERFORM set_config('role', 'postgres', true);
  INSERT INTO settleup.group_members(group_id, display_name, slug, share_token)
    VALUES (g, 'Bob', 'preview-bob-' || left(g::text, 8), encode(extensions.gen_random_bytes(16), 'hex'));
  SELECT invite_code INTO code FROM settleup.groups WHERE id = g;
  PERFORM set_config('role', 'authenticated', true);

  -- Bob: an unlinked "Bob" exists (case and spaces ignored).
  PERFORM set_config('request.jwt.claim.sub', bob::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', bob, 'role', 'authenticated')::text, true);
  p := settleup.preview_group_invite(code);
  ASSERT (p->>'name_taken')::boolean, 'Bob sees that a Bob is already listed';
  ASSERT NOT (p->>'already_member')::boolean, 'Bob is not a member yet';
  ASSERT p->>'group_name' = 'Preview Trip', 'Group name is returned';
  ASSERT NOT (p ? 'members'), 'No member list is returned';
  ASSERT p->'group_id' = 'null'::jsonb, 'Non-members don''t get the group id';

  -- Carl: nobody by that name.
  PERFORM set_config('request.jwt.claim.sub', carl::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', carl, 'role', 'authenticated')::text, true);
  p := settleup.preview_group_invite(code);
  ASSERT NOT (p->>'name_taken')::boolean, 'Carl''s name is free';

  -- Alice already belongs.
  PERFORM set_config('request.jwt.claim.sub', alice::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', alice, 'role', 'authenticated')::text, true);
  p := settleup.preview_group_invite(code);
  ASSERT (p->>'already_member')::boolean, 'Alice is already a member';
  ASSERT (p->>'group_id')::uuid = g, 'Members get the group id to open it';

  -- A wrong code fails like join does.
  failed := false;
  BEGIN
    PERFORM settleup.preview_group_invite('not-a-real-code');
  EXCEPTION WHEN OTHERS THEN failed := SQLERRM = 'Invalid or expired invite code';
  END;
  ASSERT failed, 'Unknown code is rejected';

  -- Not available without signing in.
  PERFORM set_config('role', 'anon', true);
  failed := false;
  BEGIN
    PERFORM settleup.preview_group_invite(code);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  ASSERT failed, 'Anonymous callers cannot preview';
  RAISE NOTICE 'preview_group_invite: all assertions passed';
END $$;
ROLLBACK;
