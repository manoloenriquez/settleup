-- Leave Group RPC
-- Allows a non-owner linked member to leave a group.
-- Sets user_id = NULL (unlinks) rather than deleting the row,
-- so all financial history (expense shares, payments) is preserved.
-- Access is revoked because user_group_ids() checks user_id = auth.uid().

CREATE OR REPLACE FUNCTION settleup.leave_group(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup, public
AS $$
DECLARE
  v_user_id  UUID;
  v_member   RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, role INTO v_member
  FROM settleup.group_members
  WHERE group_id = p_group_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'You are not a member of this group';
  END IF;

  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'Owners cannot leave. Transfer ownership first.';
  END IF;

  UPDATE settleup.group_members
  SET user_id = NULL
  WHERE id = v_member.id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.leave_group(UUID) TO authenticated;
