-- Before joining with a group code, say whether the group already lists
-- someone with your name who isn't on Talli yet.
--
-- join_group_by_invite always adds a new member named after the caller's
-- profile. When the organizer already listed that person, the group ends up
-- with two "Bob"s and the real balance stays on the old entry; the personal
-- invitation (claim_member_with_token) is the right way in for them. The apps
-- call this first and explain the choice. It returns no member list: only
-- whether *your* name is already taken by someone without an account.

CREATE OR REPLACE FUNCTION settleup.preview_group_invite(p_invite_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_group_id uuid;
  v_group_name text;
  v_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_invite_code IS NULL OR length(trim(p_invite_code)) NOT BETWEEN 4 AND 128 THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  SELECT g.id, g.name INTO v_group_id, v_group_name
  FROM settleup.groups g
  WHERE g.invite_code = trim(p_invite_code) AND g.is_archived = false
  LIMIT 1;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite code';
  END IF;

  -- The same name join_group_by_invite would use.
  SELECT COALESCE(p.full_name, split_part(p.email, '@', 1), 'Member') INTO v_name
  FROM public.profiles p WHERE p.id = v_user;
  v_name := COALESCE(v_name, 'Member');

  RETURN jsonb_build_object(
    'group_name', v_group_name,
    'member_count', (SELECT count(*) FROM settleup.group_members m WHERE m.group_id = v_group_id AND m.departed_at IS NULL),
    'already_member', EXISTS (SELECT 1 FROM settleup.group_members m WHERE m.group_id = v_group_id AND m.user_id = v_user),
    -- Only for members, so the app can open the group they already belong to.
    'group_id', CASE WHEN EXISTS (SELECT 1 FROM settleup.group_members m WHERE m.group_id = v_group_id AND m.user_id = v_user)
                     THEN v_group_id END,
    'your_name', v_name,
    'name_taken', EXISTS (
      SELECT 1 FROM settleup.group_members m
      WHERE m.group_id = v_group_id
        AND m.user_id IS NULL
        AND m.departed_at IS NULL
        AND lower(btrim(m.display_name)) = lower(btrim(v_name))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION settleup.preview_group_invite(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.preview_group_invite(text) TO authenticated;
