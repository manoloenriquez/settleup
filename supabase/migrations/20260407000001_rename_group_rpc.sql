-- =============================================================================
-- rename_group RPC — any linked group member can rename the group
-- =============================================================================

CREATE OR REPLACE FUNCTION settleup.rename_group(
  p_group_id UUID,
  p_name     TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_user_id  UUID;
  v_new_name TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_new_name := trim(p_name);
  IF length(v_new_name) = 0 THEN
    RAISE EXCEPTION 'Name cannot be empty';
  END IF;
  IF length(v_new_name) > 100 THEN
    RAISE EXCEPTION 'Group name must be at most 100 characters';
  END IF;

  -- Any linked member can rename the group
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to rename this group';
  END IF;

  UPDATE groups SET name = v_new_name WHERE id = p_group_id;

  RETURN jsonb_build_object('success', true, 'name', v_new_name);
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.rename_group(UUID, TEXT) TO authenticated;
