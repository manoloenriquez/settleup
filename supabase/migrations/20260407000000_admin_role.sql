-- =============================================================================
-- Widen group_members.role to include 'admin'
-- Create is_group_admin_or_owner() helper
-- Create promote_member() RPC (owner only)
-- Update regenerate_invite_code, rotate_member_share_token, rename_member
-- to also allow admin role
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Widen role CHECK constraint
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.group_members
  DROP CONSTRAINT group_members_role_check;

ALTER TABLE settleup.group_members
  ADD CONSTRAINT group_members_role_check
  CHECK (role IN ('owner', 'admin', 'member'));

-- ---------------------------------------------------------------------------
-- 2. Helper: is_group_admin_or_owner(p_group_id)
--    Returns TRUE if the caller is the group owner or has role = 'admin'.
--    SECURITY DEFINER to avoid RLS recursion.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.is_group_admin_or_owner(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = settleup
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
$$;

GRANT EXECUTE ON FUNCTION settleup.is_group_admin_or_owner(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. promote_member(p_member_id, p_role) — owner only
--    Sets a member's role to 'admin' or 'member'.
--    Cannot change the owner's role or promote to 'owner'.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.promote_member(
  p_member_id UUID,
  p_role      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id   UUID;
  v_member    RECORD;
  v_result    JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate role
  IF p_role NOT IN ('admin', 'member') THEN
    RAISE EXCEPTION 'Role must be admin or member';
  END IF;

  -- Fetch the target member + group info
  SELECT gm.id, gm.group_id, gm.user_id, gm.role,
         g.owner_user_id
  INTO v_member
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Only the group owner can promote/demote
  IF v_member.owner_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the group owner can change member roles';
  END IF;

  -- Cannot change the owner's own role
  IF v_member.user_id = v_user_id THEN
    RAISE EXCEPTION 'Cannot change your own role';
  END IF;

  -- Cannot promote/demote another owner (shouldn't happen, but guard)
  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'Cannot change the role of another owner';
  END IF;

  -- No-op if already the target role
  IF v_member.role = p_role THEN
    SELECT row_to_json(m)::JSONB INTO v_result
    FROM group_members m WHERE m.id = p_member_id;
    RETURN jsonb_build_object('member', v_result);
  END IF;

  UPDATE group_members
  SET role = p_role
  WHERE id = p_member_id;

  SELECT row_to_json(m)::JSONB INTO v_result
  FROM group_members m WHERE m.id = p_member_id;

  RETURN jsonb_build_object('member', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.promote_member(UUID, TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Update regenerate_invite_code — allow admin
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

  -- Owner or admin can regenerate the invite code
  IF NOT settleup.is_group_admin_or_owner(p_group_id) THEN
    RAISE EXCEPTION 'Only the group owner or admin can regenerate the invite code';
  END IF;

  -- New 12-char hex code (6 random bytes)
  v_new_code := encode(gen_random_bytes(6), 'hex');

  UPDATE groups SET invite_code = v_new_code WHERE id = p_group_id;

  RETURN jsonb_build_object('invite_code', v_new_code);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Update rotate_member_share_token — allow admin
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

  -- Caller must own the member, be the group owner, or be a group admin
  IF NOT EXISTS (
    SELECT 1 FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.id = p_member_id
      AND (
        gm.user_id = v_user_id
        OR g.owner_user_id = v_user_id
        OR settleup.is_group_admin_or_owner(v_group_id)
      )
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

-- ---------------------------------------------------------------------------
-- 6. Update rename_member — allow admin
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.rename_member(
  p_member_id UUID,
  p_new_name  TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup, public
AS $$
DECLARE
  v_user_id   UUID;
  v_member    RECORD;
  v_new_name  TEXT;
  v_new_slug  TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_new_name := trim(p_new_name);
  IF length(v_new_name) = 0 THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;
  IF length(v_new_name) > 80 THEN
    RAISE EXCEPTION 'Name must be at most 80 characters';
  END IF;

  SELECT gm.id, gm.group_id, gm.user_id, gm.role,
         g.owner_user_id
  INTO v_member
  FROM settleup.group_members gm
  JOIN settleup.groups g ON g.id = gm.group_id
  WHERE gm.id = p_member_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found';
  END IF;

  -- Auth check: group owner, group admin, OR the member themselves
  IF v_member.owner_user_id <> v_user_id
     AND v_member.user_id IS DISTINCT FROM v_user_id
     AND NOT settleup.is_group_admin_or_owner(v_member.group_id)
  THEN
    RAISE EXCEPTION 'Not authorized to rename this member';
  END IF;

  -- Generate a new unique slug
  v_new_slug := settleup.generate_unique_slug(v_new_name, v_member.group_id);

  UPDATE settleup.group_members
  SET display_name = v_new_name,
      slug = v_new_slug
  WHERE id = p_member_id
  RETURNING id, group_id, display_name, slug, share_token, user_id, role, created_at
  INTO v_member;

  RETURN jsonb_build_object(
    'member', row_to_json(v_member)::jsonb
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. RLS policies: allow admin INSERT/DELETE on group_members
--    (Owner already has full access via group_members_owner_all)
-- ---------------------------------------------------------------------------

CREATE POLICY "group_members_admin_insert"
  ON settleup.group_members FOR INSERT
  TO authenticated
  WITH CHECK (settleup.is_group_admin_or_owner(group_id));

CREATE POLICY "group_members_admin_delete"
  ON settleup.group_members FOR DELETE
  TO authenticated
  USING (
    settleup.is_group_admin_or_owner(group_id)
    AND role <> 'owner'
  );
