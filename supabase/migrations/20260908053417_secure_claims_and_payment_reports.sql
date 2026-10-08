-- Separate read-only balance links from invitations that grant membership.
ALTER TABLE settleup.group_members ADD COLUMN departed_at timestamptz;
CREATE TABLE settleup.member_claim_invitations (
  member_id uuid PRIMARY KEY REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz
);
ALTER TABLE settleup.member_claim_invitations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.member_claim_invitations FROM anon, authenticated;

CREATE OR REPLACE FUNCTION settleup.create_member_claim_invitation(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m settleup.group_members%ROWTYPE; token text;
BEGIN
  SELECT * INTO m FROM settleup.group_members WHERE id=p_member_id FOR UPDATE;
  IF auth.uid() IS NULL OR m.id IS NULL OR NOT settleup.is_group_admin_or_owner(m.group_id) THEN
    RAISE EXCEPTION 'Only a group admin can invite this member' USING ERRCODE='42501';
  END IF;
  IF m.user_id IS NOT NULL OR m.departed_at IS NOT NULL THEN RAISE EXCEPTION 'Member is not available to claim'; END IF;
  token := encode(extensions.gen_random_bytes(32),'hex');
  INSERT INTO settleup.member_claim_invitations(member_id,token_hash,expires_at)
  VALUES(m.id,encode(extensions.digest(token,'sha256'),'hex'),now()+interval '7 days')
  ON CONFLICT(member_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, expires_at=EXCLUDED.expires_at, claimed_by=NULL, claimed_at=NULL;
  RETURN jsonb_build_object('token',token,'expires_at',now()+interval '7 days');
END; $$;
REVOKE ALL ON FUNCTION settleup.create_member_claim_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.create_member_claim_invitation(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION settleup.revoke_member_claim_invitation(p_member_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM settleup.group_members m WHERE m.id=p_member_id AND settleup.is_group_admin_or_owner(m.group_id)) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';
  END IF;
  DELETE FROM settleup.member_claim_invitations WHERE member_id=p_member_id;
END; $$;
REVOKE ALL ON FUNCTION settleup.revoke_member_claim_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.revoke_member_claim_invitation(uuid) TO authenticated;

-- Keep the legacy entry point fail-closed for installed clients.
CREATE OR REPLACE FUNCTION settleup.claim_member(p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RAISE EXCEPTION 'Ask the group admin for a personal claim invitation' USING ERRCODE='42501'; END; $$;
REVOKE ALL ON FUNCTION settleup.claim_member(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION settleup.claim_member_with_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE invitation settleup.member_claim_invitations%ROWTYPE; m settleup.group_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to accept this invitation' USING ERRCODE='42501'; END IF;
  IF p_token IS NULL OR length(p_token)<>64 THEN RAISE EXCEPTION 'Invalid or expired invitation'; END IF;
  SELECT * INTO invitation FROM settleup.member_claim_invitations
    WHERE token_hash=encode(extensions.digest(p_token,'sha256'),'hex') FOR UPDATE;
  IF invitation.member_id IS NULL OR invitation.expires_at<=now() THEN RAISE EXCEPTION 'Invalid or expired invitation'; END IF;
  SELECT * INTO m FROM settleup.group_members WHERE id=invitation.member_id FOR UPDATE;
  IF invitation.claimed_by=auth.uid() AND m.user_id=auth.uid() THEN RETURN jsonb_build_object('member',to_jsonb(m)); END IF;
  IF invitation.claimed_at IS NOT NULL OR m.user_id IS NOT NULL OR m.departed_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation is no longer available'; END IF;
  IF NOT EXISTS(SELECT 1 FROM settleup.groups WHERE id=m.group_id AND NOT is_archived AND owner_user_id IS NOT NULL) THEN RAISE EXCEPTION 'This group is read-only'; END IF;
  IF EXISTS(SELECT 1 FROM settleup.group_members WHERE group_id=m.group_id AND user_id=auth.uid()) THEN RAISE EXCEPTION 'You already belong to this group. Ask the organizer to reconcile the member records.'; END IF;
  UPDATE settleup.group_members SET user_id=auth.uid() WHERE id=m.id RETURNING * INTO m;
  UPDATE settleup.member_claim_invitations SET claimed_by=auth.uid(),claimed_at=now() WHERE member_id=m.id;
  RETURN jsonb_build_object('member',to_jsonb(m));
END; $$;
REVOKE ALL ON FUNCTION settleup.claim_member_with_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.claim_member_with_token(text) TO authenticated;

-- Database-side counters cannot be bypassed by calling the Data API directly.
CREATE TABLE settleup.public_write_limits (
  member_id uuid PRIMARY KEY REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK(attempts>=0)
);
ALTER TABLE settleup.public_write_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.public_write_limits FROM anon, authenticated;
ALTER TABLE settleup.payments ADD COLUMN report_request_id uuid;
CREATE UNIQUE INDEX payments_report_request_unique ON settleup.payments(from_member_id,report_request_id) WHERE report_request_id IS NOT NULL;
DROP FUNCTION settleup.submit_friend_payment(text,uuid,bigint,text);
CREATE FUNCTION settleup.submit_friend_payment(p_share_token text,p_to_member_id uuid,p_amount_cents bigint,p_request_id uuid,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m settleup.group_members%ROWTYPE; previous settleup.payments%ROWTYPE; payment_id uuid; attempts integer;
BEGIN
  IF p_share_token IS NULL OR length(p_share_token)>128 OR p_request_id IS NULL OR p_amount_cents IS NULL OR p_amount_cents<=0 OR p_amount_cents>100000000 OR length(p_note)>280 THEN RAISE EXCEPTION 'Invalid payment report'; END IF;
  -- Serialize reports for the member, including retries with the same id.
  SELECT * INTO m FROM settleup.group_members WHERE share_token=p_share_token FOR UPDATE;
  IF m.id IS NULL OR m.departed_at IS NOT NULL THEN RAISE EXCEPTION 'Invalid share link'; END IF;
  IF NOT EXISTS(SELECT 1 FROM settleup.groups WHERE id=m.group_id AND NOT is_archived AND owner_user_id IS NOT NULL) THEN RAISE EXCEPTION 'This group is read-only'; END IF;
  SELECT * INTO previous FROM settleup.payments WHERE from_member_id=m.id AND report_request_id=p_request_id;
  IF previous.id IS NOT NULL THEN
    IF previous.to_member_id<>p_to_member_id OR previous.amount_cents<>p_amount_cents OR previous.note IS DISTINCT FROM nullif(trim(p_note),'') THEN RAISE EXCEPTION 'Payment report differs from the original submission' USING ERRCODE='PT409'; END IF;
    RETURN jsonb_build_object('payment_id',previous.id,'status',previous.status);
  END IF;
  IF p_to_member_id=m.id OR NOT EXISTS(SELECT 1 FROM settleup.group_members WHERE id=p_to_member_id AND group_id=m.group_id AND departed_at IS NULL) THEN RAISE EXCEPTION 'Invalid recipient'; END IF;
  INSERT INTO settleup.public_write_limits AS limits(member_id,window_start,attempts) VALUES(m.id,now(),1)
  ON CONFLICT(member_id) DO UPDATE SET
    attempts=CASE WHEN limits.window_start<=now()-interval '5 minutes' THEN 1 ELSE limits.attempts+1 END,
    window_start=CASE WHEN limits.window_start<=now()-interval '5 minutes' THEN now() ELSE limits.window_start END
  RETURNING limits.attempts INTO attempts;
  IF attempts>5 THEN RAISE EXCEPTION 'Too many reports. Try again in five minutes.' USING ERRCODE='PT429'; END IF;
  INSERT INTO settleup.payments(group_id,from_member_id,to_member_id,amount_cents,status,note,report_request_id)
  VALUES(m.group_id,m.id,p_to_member_id,p_amount_cents,'PENDING',nullif(trim(p_note),''),p_request_id) RETURNING id INTO payment_id;
  RETURN jsonb_build_object('payment_id',payment_id,'status','PENDING');
END; $$;
REVOKE ALL ON FUNCTION settleup.submit_friend_payment(text,uuid,bigint,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.submit_friend_payment(text,uuid,bigint,uuid,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION settleup.resolve_pending_payment(p_payment_id uuid,p_new_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE payment settleup.payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('PAID','REJECTED') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  SELECT * INTO payment FROM settleup.payments WHERE id=p_payment_id FOR UPDATE;
  IF payment.id IS NULL THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE='PT404'; END IF;
  IF NOT EXISTS(SELECT 1 FROM settleup.group_members WHERE id=payment.to_member_id AND user_id=auth.uid()) AND NOT settleup.is_group_admin_or_owner(payment.group_id) THEN RAISE EXCEPTION 'Only the recipient or a group admin can resolve this payment' USING ERRCODE='42501'; END IF;
  IF payment.status=p_new_status THEN RETURN jsonb_build_object('success',true,'replayed',true); END IF;
  IF payment.status<>'PENDING' THEN RAISE EXCEPTION 'Payment was resolved differently elsewhere' USING ERRCODE='PT409'; END IF;
  UPDATE settleup.payments SET status=p_new_status WHERE id=p_payment_id;
  RETURN jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION settleup.resolve_pending_payment(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.resolve_pending_payment(uuid,text) TO authenticated;

CREATE FUNCTION settleup.get_friend_payment_reports(p_share_token text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(to_jsonb(reports) ORDER BY reports.created_at DESC),'[]'::jsonb)
  FROM (SELECT p.id,p.to_member_id,p.amount_cents,p.status,p.created_at
    FROM settleup.payments p JOIN settleup.group_members m ON m.id=p.from_member_id
    WHERE m.share_token=p_share_token AND m.departed_at IS NULL AND p.report_request_id IS NOT NULL
    ORDER BY p.created_at DESC LIMIT 50) reports;
$$;
REVOKE ALL ON FUNCTION settleup.get_friend_payment_reports(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settleup.get_friend_payment_reports(text) TO anon,authenticated;

-- Internal functions should not be callable as public API endpoints.
ALTER FUNCTION settleup.touch_updated_at() SET search_path = public;
REVOKE ALL ON FUNCTION settleup.notify_push_event() FROM PUBLIC,anon,authenticated;

-- Table updates must obey the same final-state rules as the resolution RPC.
CREATE FUNCTION settleup.guard_payment_resolution()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status<>'PENDING' OR NEW.status NOT IN ('PAID','REJECTED') THEN
      RAISE EXCEPTION 'A resolved payment cannot change status' USING ERRCODE='PT409';
    END IF;
    IF auth.uid() IS NULL OR (NOT settleup.is_group_admin_or_owner(OLD.group_id) AND NOT EXISTS(SELECT 1 FROM settleup.group_members WHERE id=OLD.to_member_id AND user_id=auth.uid())) THEN
      RAISE EXCEPTION 'Only the recipient or a group admin can resolve this payment' USING ERRCODE='42501';
    END IF;
  END IF;
  IF OLD.report_request_id IS NOT NULL AND
    (NEW.report_request_id IS DISTINCT FROM OLD.report_request_id OR NEW.from_member_id<>OLD.from_member_id OR NEW.to_member_id<>OLD.to_member_id OR NEW.amount_cents<>OLD.amount_cents OR NEW.note IS DISTINCT FROM OLD.note) THEN
    RAISE EXCEPTION 'Payment report details are immutable; reject an incorrect report' USING ERRCODE='PT409';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION settleup.guard_payment_resolution() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_payment_resolution BEFORE UPDATE ON settleup.payments FOR EACH ROW EXECUTE FUNCTION settleup.guard_payment_resolution();
