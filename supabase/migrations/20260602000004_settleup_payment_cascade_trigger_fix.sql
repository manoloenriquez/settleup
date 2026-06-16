-- Deferred payment validation can fire after a payment was already removed
-- by an account/group deletion cascade. Skip validation for rows no longer
-- present, or whose parent group is also being deleted.

CREATE OR REPLACE FUNCTION settleup.check_payment_member_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_from_group UUID;
  v_to_group   UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM settleup.payments WHERE id = NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM settleup.groups WHERE id = NEW.group_id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT group_id INTO v_from_group
  FROM settleup.group_members WHERE id = NEW.from_member_id;

  SELECT group_id INTO v_to_group
  FROM settleup.group_members WHERE id = NEW.to_member_id;

  IF v_from_group IS DISTINCT FROM NEW.group_id THEN
    RAISE EXCEPTION
      'from_member % belongs to group % but payment group_id is %',
      NEW.from_member_id, v_from_group, NEW.group_id;
  END IF;

  IF v_to_group IS DISTINCT FROM NEW.group_id THEN
    RAISE EXCEPTION
      'to_member % belongs to group % but payment group_id is %',
      NEW.to_member_id, v_to_group, NEW.group_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION settleup.check_payment_member_group() FROM PUBLIC, anon, authenticated;
