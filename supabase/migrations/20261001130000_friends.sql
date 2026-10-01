-- Friends and one-to-one shared expenses (audit phase 7).
--
-- A friendship's ledger is an ordinary group with kind = 'direct' and
-- exactly two linked members, so expenses, payments, per-currency balances,
-- the offline outbox, RLS and share links all work unchanged. Friends are
-- added only through an invite link the inviter shares — there is no user
-- search, so nobody can be found or enumerated by name or email.

ALTER TABLE settleup.groups ADD COLUMN kind text NOT NULL DEFAULT 'shared'
  CHECK (kind IN ('shared', 'direct'));

-- A direct ledger never gains a third member (join codes, admin adds, claims).
CREATE FUNCTION settleup.guard_direct_group_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM settleup.groups WHERE id = NEW.group_id AND kind = 'direct')
     AND (SELECT count(*) FROM settleup.group_members WHERE group_id = NEW.group_id) >= 2 THEN
    RAISE EXCEPTION 'A friend ledger has exactly two people. Create a group to add more.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION settleup.guard_direct_group_members() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER group_members_guard_direct
  BEFORE INSERT ON settleup.group_members
  FOR EACH ROW EXECUTE FUNCTION settleup.guard_direct_group_members();

CREATE TABLE settleup.friend_invites (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash           text NOT NULL UNIQUE,
  inviter_display_name text NOT NULL CHECK (char_length(btrim(inviter_display_name)) BETWEEN 1 AND 80),
  currency_code        settleup.currency_code NOT NULL DEFAULT 'PHP',
  expires_at           timestamptz NOT NULL,
  accepted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at          timestamptz,
  revoked_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX friend_invites_inviter ON settleup.friend_invites (inviter_id, created_at DESC);
ALTER TABLE settleup.friend_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.friend_invites FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, inviter_id, inviter_display_name, currency_code, expires_at, accepted_at, revoked_at, created_at)
  ON settleup.friend_invites TO authenticated;
CREATE POLICY friend_invites_select_own ON settleup.friend_invites
  FOR SELECT TO authenticated USING (inviter_id = (SELECT auth.uid()));

CREATE TABLE settleup.friendships (
  user_low        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_high       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  direct_group_id uuid NOT NULL UNIQUE REFERENCES settleup.groups(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_low, user_high),
  CHECK (user_low < user_high)
);
ALTER TABLE settleup.friendships ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.friendships FROM PUBLIC, anon, authenticated;
GRANT SELECT ON settleup.friendships TO authenticated;
CREATE POLICY friendships_select_own ON settleup.friendships
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) IN (user_low, user_high));

-- Create a single-use invite link (token returned once, only its hash stored).
CREATE FUNCTION settleup.create_friend_invite(p_display_name text, p_currency_code settleup.currency_code)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_token text; v_id uuid; v_expires timestamptz := now() + interval '14 days';
BEGIN
  IF auth.uid() IS NULL OR settleup.is_account_closed() THEN
    RAISE EXCEPTION 'Sign in to invite friends.' USING ERRCODE = '42501';
  END IF;
  IF p_display_name IS NULL OR char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Enter the name your friend will see.' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM settleup.friend_invites
      WHERE inviter_id = auth.uid() AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()) >= 20 THEN
    RAISE EXCEPTION 'You have 20 open invites. Cancel some before making more.' USING ERRCODE = '22023';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO settleup.friend_invites (inviter_id, token_hash, inviter_display_name, currency_code, expires_at)
  VALUES (auth.uid(), encode(extensions.digest(v_token, 'sha256'), 'hex'), btrim(p_display_name), p_currency_code, v_expires)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'token', v_token, 'expires_at', v_expires);
END;
$$;
REVOKE ALL ON FUNCTION settleup.create_friend_invite(text, settleup.currency_code) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_friend_invite(text, settleup.currency_code) TO authenticated;

CREATE FUNCTION settleup.revoke_friend_invite(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE settleup.friend_invites SET revoked_at = coalesce(revoked_at, now())
    WHERE id = p_id AND inviter_id = auth.uid() AND accepted_at IS NULL;
  RETURN jsonb_build_object('revoked', FOUND);
END;
$$;
REVOKE ALL ON FUNCTION settleup.revoke_friend_invite(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.revoke_friend_invite(uuid) TO authenticated;

-- What an invite page may show before anyone signs in: the inviter's chosen
-- name and whether the link still works. Nothing else, no ids.
CREATE FUNCTION settleup.get_friend_invite_preview(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'inviter_name', i.inviter_display_name,
      'currency_code', i.currency_code,
      'status', CASE
        WHEN i.revoked_at IS NOT NULL OR i.expires_at <= now() THEN 'expired'
        WHEN i.accepted_at IS NOT NULL THEN 'used'
        ELSE 'open' END)
    FROM settleup.friend_invites i
    WHERE p_token ~ '^[0-9a-f]{64}$' AND i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  ), jsonb_build_object('status', 'invalid'));
$$;
REVOKE ALL ON FUNCTION settleup.get_friend_invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_friend_invite_preview(text) TO anon, authenticated;

-- Accept an invite: creates the two-person ledger once. Safe to repeat.
CREATE FUNCTION settleup.accept_friend_invite(p_token text, p_display_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_me uuid := auth.uid();
  i settleup.friend_invites%ROWTYPE;
  v_low uuid; v_high uuid;
  f settleup.friendships%ROWTYPE;
  v_group uuid := gen_random_uuid();
BEGIN
  IF v_me IS NULL OR settleup.is_account_closed() THEN
    RAISE EXCEPTION 'Sign in to accept this invite.' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'This invite link is not valid.' USING ERRCODE = '22023';
  END IF;
  IF p_display_name IS NULL OR char_length(btrim(p_display_name)) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'Enter the name your friend will see.' USING ERRCODE = '22023';
  END IF;
  -- Lock the invite: two simultaneous accepts cannot both use it.
  SELECT * INTO i FROM settleup.friend_invites
    WHERE token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'This invite link is not valid.' USING ERRCODE = '22023'; END IF;
  IF i.inviter_id = v_me THEN RAISE EXCEPTION 'This is your own invite. Send it to a friend.' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM settleup.closed_accounts WHERE user_id = i.inviter_id) THEN
    RAISE EXCEPTION 'This invite is no longer available.' USING ERRCODE = '22023';
  END IF;
  v_low := least(v_me, i.inviter_id); v_high := greatest(v_me, i.inviter_id);
  PERFORM pg_advisory_xact_lock(hashtextextended(v_low::text || v_high::text, 714));
  SELECT * INTO f FROM settleup.friendships WHERE user_low = v_low AND user_high = v_high;
  IF i.accepted_at IS NOT NULL THEN
    IF i.accepted_by = v_me AND f.direct_group_id IS NOT NULL THEN
      RETURN jsonb_build_object('direct_group_id', f.direct_group_id, 'replayed', true);
    END IF;
    RAISE EXCEPTION 'This invite has already been used.' USING ERRCODE = '22023';
  END IF;
  IF i.revoked_at IS NOT NULL OR i.expires_at <= now() THEN
    RAISE EXCEPTION 'This invite has expired. Ask for a new link.' USING ERRCODE = '22023';
  END IF;
  IF f.direct_group_id IS NOT NULL THEN
    -- Already friends: use the invite up and return the existing ledger.
    UPDATE settleup.friend_invites SET accepted_by = v_me, accepted_at = now() WHERE id = i.id;
    RETURN jsonb_build_object('direct_group_id', f.direct_group_id, 'replayed', true);
  END IF;

  INSERT INTO settleup.groups (id, name, owner_user_id, kind, default_currency_code, budget_currency_code)
  VALUES (v_group, left(i.inviter_display_name || ' & ' || btrim(p_display_name), 100), i.inviter_id, 'direct',
          i.currency_code, i.currency_code);
  INSERT INTO settleup.group_members (group_id, display_name, slug, share_token, user_id, role)
  VALUES
    (v_group, i.inviter_display_name, settleup.generate_unique_slug(i.inviter_display_name, v_group),
     encode(extensions.gen_random_bytes(32), 'hex'), i.inviter_id, 'owner');
  INSERT INTO settleup.group_members (group_id, display_name, slug, share_token, user_id, role)
  VALUES
    (v_group, btrim(p_display_name), settleup.generate_unique_slug(btrim(p_display_name), v_group),
     encode(extensions.gen_random_bytes(32), 'hex'), v_me, 'admin');
  INSERT INTO settleup.friendships (user_low, user_high, direct_group_id) VALUES (v_low, v_high, v_group);
  UPDATE settleup.friend_invites SET accepted_by = v_me, accepted_at = now() WHERE id = i.id;
  RETURN jsonb_build_object('direct_group_id', v_group);
END;
$$;
REVOKE ALL ON FUNCTION settleup.accept_friend_invite(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.accept_friend_invite(text, text) TO authenticated;

-- My friends: the name they use in our shared ledger (never an email).
CREATE FUNCTION settleup.list_friends()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'friend_user_id', other.user_id,
    'display_name', other.display_name,
    'direct_group_id', f.direct_group_id,
    'default_currency_code', g.default_currency_code,
    'since', f.created_at) ORDER BY lower(other.display_name)), '[]'::jsonb)
  FROM settleup.friendships f
  JOIN settleup.groups g ON g.id = f.direct_group_id
  JOIN settleup.group_members other
    ON other.group_id = f.direct_group_id
   AND other.user_id = CASE WHEN f.user_low = auth.uid() THEN f.user_high ELSE f.user_low END
  WHERE auth.uid() IN (f.user_low, f.user_high);
$$;
REVOKE ALL ON FUNCTION settleup.list_friends() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.list_friends() TO authenticated;

-- Removing a friend never touches money: the ledger stays, becomes an
-- ordinary two-person group, and balances can still be settled there.
CREATE FUNCTION settleup.remove_friend(p_friend_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_group uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  DELETE FROM settleup.friendships
    WHERE user_low = least(auth.uid(), p_friend_user_id) AND user_high = greatest(auth.uid(), p_friend_user_id)
    RETURNING direct_group_id INTO v_group;
  IF v_group IS NOT NULL THEN
    UPDATE settleup.groups SET kind = 'shared' WHERE id = v_group;
  END IF;
  RETURN jsonb_build_object('removed', v_group IS NOT NULL, 'group_id', v_group);
END;
$$;
REVOKE ALL ON FUNCTION settleup.remove_friend(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.remove_friend(uuid) TO authenticated;

-- Leaving the ledger or closing an account ends the friendship the same way.
CREATE FUNCTION settleup.end_friendship_on_departure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
    DELETE FROM settleup.friendships WHERE direct_group_id = NEW.group_id;
    UPDATE settleup.groups SET kind = 'shared' WHERE id = NEW.group_id AND kind = 'direct';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION settleup.end_friendship_on_departure() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER group_members_end_friendship
  AFTER UPDATE OF user_id ON settleup.group_members
  FOR EACH ROW EXECUTE FUNCTION settleup.end_friendship_on_departure();

CREATE FUNCTION settleup.revoke_friend_invites_on_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE settleup.friend_invites SET revoked_at = coalesce(revoked_at, now())
    WHERE inviter_id = NEW.user_id AND accepted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION settleup.revoke_friend_invites_on_closure() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER closed_accounts_revoke_friend_invites
  AFTER INSERT ON settleup.closed_accounts
  FOR EACH ROW EXECUTE FUNCTION settleup.revoke_friend_invites_on_closure();
