-- Transfer Group Ownership RPC
-- Allows the current owner to transfer ownership to another linked member.
-- Both the caller's and the target's roles are updated atomically.

CREATE OR REPLACE FUNCTION settleup.transfer_group_ownership(
  p_group_id           UUID,
  p_new_owner_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup, public
AS $$
DECLARE
  v_user_id     UUID;
  v_group       RECORD;
  v_new_member  RECORD;
  v_old_member  RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is the current owner
  SELECT id, owner_user_id INTO v_group
  FROM settleup.groups
  WHERE id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Group not found';
  END IF;

  IF v_group.owner_user_id <> v_user_id THEN
    RAISE EXCEPTION 'Only the group owner can transfer ownership';
  END IF;

  -- Verify target member exists, belongs to this group, and has a linked user_id
  SELECT id, user_id INTO v_new_member
  FROM settleup.group_members
  WHERE id = p_new_owner_member_id
    AND group_id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target member not found in this group';
  END IF;

  IF v_new_member.user_id IS NULL THEN
    RAISE EXCEPTION 'Cannot transfer ownership to an unlinked member';
  END IF;

  IF v_new_member.user_id = v_user_id THEN
    RAISE EXCEPTION 'You are already the owner';
  END IF;

  -- Find the caller's member row
  SELECT id INTO v_old_member
  FROM settleup.group_members
  WHERE group_id = p_group_id
    AND user_id = v_user_id;

  -- Perform transfer atomically
  UPDATE settleup.groups
  SET owner_user_id = v_new_member.user_id
  WHERE id = p_group_id;

  UPDATE settleup.group_members
  SET role = 'owner'
  WHERE id = v_new_member.id;

  IF v_old_member.id IS NOT NULL THEN
    UPDATE settleup.group_members
    SET role = 'member'
    WHERE id = v_old_member.id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.transfer_group_ownership(UUID, UUID) TO authenticated;
