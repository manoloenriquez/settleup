-- Rename Member RPC
-- Allows the group owner OR the member themselves to update a member's display name.
-- Also regenerates the slug to match the new name.

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

  -- Auth check: must be the group owner OR the member themselves
  IF v_member.owner_user_id <> v_user_id AND v_member.user_id IS DISTINCT FROM v_user_id THEN
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

GRANT EXECUTE ON FUNCTION settleup.rename_member(UUID, TEXT) TO authenticated;
