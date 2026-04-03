-- =============================================================================
-- Phase 2.2: Collaboration RPCs
--
-- join_group_by_invite(p_invite_code TEXT)
--   Authenticated user joins a group using its invite code.
--   Creates a new group_member linked to the caller's user account.
--
-- claim_member(p_member_id UUID)
--   Authenticated user claims an existing unlinked placeholder member.
--   Useful when the group owner pre-created a member slot.
--
-- rotate_member_share_token(p_member_id UUID)
--   Regenerates the share_token for a member.
--   Caller must own the member (user_id = auth.uid()) or be the group owner.
--
-- regenerate_invite_code(p_group_id UUID)
--   Regenerates the invite_code for a group.
--   Caller must be the group owner.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- RPC 1: join_group_by_invite
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.join_group_by_invite(p_invite_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id     UUID;
  v_group_id    UUID;
  v_group_name  TEXT;
  v_member_id   UUID;
  v_owner_name  TEXT;
  v_slug        TEXT;
  v_share_token TEXT;
  v_group       JSONB;
  v_member      JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up group by invite code
  SELECT id, name
  INTO v_group_id, v_group_name
  FROM groups
  WHERE invite_code = trim(p_invite_code)
    AND is_archived = FALSE
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- Verify caller is not already a member of this group
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'You are already a member of this group';
  END IF;

  -- Fetch caller display name from profiles
  SELECT COALESCE(full_name, split_part(email, '@', 1), 'Member')
  INTO v_owner_name
  FROM public.profiles
  WHERE id = v_user_id;

  v_owner_name := COALESCE(v_owner_name, 'Member');

  -- Generate unique slug and share token
  v_slug        := settleup.generate_unique_slug(v_owner_name, v_group_id);
  v_share_token := replace(replace(replace(
    encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '');

  -- Insert new member
  INSERT INTO group_members (group_id, display_name, slug, share_token, user_id, role)
  VALUES (v_group_id, v_owner_name, v_slug, v_share_token, v_user_id, 'member')
  RETURNING id INTO v_member_id;

  -- Return group + new member
  SELECT row_to_json(g)::JSONB INTO v_group FROM groups g WHERE g.id = v_group_id;
  SELECT row_to_json(m)::JSONB INTO v_member FROM group_members m WHERE m.id = v_member_id;

  RETURN jsonb_build_object('group', v_group, 'member', v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.join_group_by_invite(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC 2: claim_member
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.claim_member(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id   UUID;
  v_group_id  UUID;
  v_member    JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up the target member
  SELECT group_id INTO v_group_id
  FROM group_members
  WHERE id = p_member_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Verify the target member is currently unlinked
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE id = p_member_id AND user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This member slot is already claimed';
  END IF;

  -- Verify caller is not already linked to a different member in this group
  IF EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = v_group_id AND user_id = v_user_id AND id <> p_member_id
  ) THEN
    RAISE EXCEPTION 'You are already linked to a member in this group';
  END IF;

  -- Link the member to the caller
  UPDATE group_members
  SET user_id = v_user_id
  WHERE id = p_member_id;

  SELECT row_to_json(m)::JSONB INTO v_member
  FROM group_members m WHERE m.id = p_member_id;

  RETURN jsonb_build_object('member', v_member);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.claim_member(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC 3: rotate_member_share_token
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.rotate_member_share_token(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id     UUID;
  v_group_id    UUID;
  v_new_token   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Look up the member's group
  SELECT group_id INTO v_group_id
  FROM group_members WHERE id = p_member_id;

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Caller must own the member or be the group owner
  IF NOT EXISTS (
    SELECT 1 FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.id = p_member_id
      AND (gm.user_id = v_user_id OR g.owner_user_id = v_user_id)
  ) THEN
    RAISE EXCEPTION 'Not authorized to rotate this member''s share token';
  END IF;

  -- Generate new token
  v_new_token := replace(replace(replace(
    encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '');

  UPDATE group_members SET share_token = v_new_token WHERE id = p_member_id;

  RETURN jsonb_build_object('share_token', v_new_token);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.rotate_member_share_token(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC 4: regenerate_invite_code
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.regenerate_invite_code(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id    UUID;
  v_new_code   TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Only the group owner can regenerate the invite code
  IF NOT EXISTS (
    SELECT 1 FROM groups
    WHERE id = p_group_id AND owner_user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Only the group owner can regenerate the invite code';
  END IF;

  -- New 12-char hex code (6 random bytes)
  v_new_code := encode(gen_random_bytes(6), 'hex');

  UPDATE groups SET invite_code = v_new_code WHERE id = p_group_id;

  RETURN jsonb_build_object('invite_code', v_new_code);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.regenerate_invite_code(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Update create_group_with_owner RPC to set role = 'owner' on the first member
-- (20260403000002 was written before the role column existed)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.create_group_with_owner(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id     UUID;
  v_group_id    UUID;
  v_member_id   UUID;
  v_owner_name  TEXT;
  v_slug        TEXT;
  v_share_token TEXT;
  v_group       JSONB;
  v_member      JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF trim(p_name) IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Group name is required';
  END IF;
  IF length(trim(p_name)) > 100 THEN
    RAISE EXCEPTION 'Group name must be at most 100 characters';
  END IF;

  SELECT COALESCE(full_name, split_part(email, '@', 1), 'Me')
  INTO v_owner_name
  FROM public.profiles
  WHERE id = v_user_id;

  v_owner_name := COALESCE(v_owner_name, 'Me');

  INSERT INTO groups (name, owner_user_id)
  VALUES (trim(p_name), v_user_id)
  RETURNING id INTO v_group_id;

  v_slug        := settleup.generate_unique_slug(v_owner_name, v_group_id);
  v_share_token := replace(replace(replace(
    encode(gen_random_bytes(16), 'base64'), '+', '-'), '/', '_'), '=', '');

  -- role = 'owner' now that the column exists
  INSERT INTO group_members (group_id, display_name, slug, share_token, user_id, role)
  VALUES (v_group_id, v_owner_name, v_slug, v_share_token, v_user_id, 'owner')
  RETURNING id INTO v_member_id;

  SELECT row_to_json(g)::JSONB INTO v_group FROM groups g WHERE g.id = v_group_id;
  SELECT row_to_json(m)::JSONB INTO v_member FROM group_members m WHERE m.id = v_member_id;

  RETURN jsonb_build_object('group', v_group, 'member', v_member);
END;
$$;
