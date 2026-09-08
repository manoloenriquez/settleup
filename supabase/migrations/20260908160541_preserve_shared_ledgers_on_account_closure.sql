-- Closing an app account must never delete another member's financial history
-- or a login/profile used by another application in this shared Auth project.
CREATE TABLE settleup.closed_accounts (
  user_id uuid PRIMARY KEY,
  closed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE settleup.closed_accounts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.closed_accounts FROM PUBLIC, anon, authenticated;

-- A private transaction-scoped capability, not a client-settable session flag.
CREATE TABLE settleup.account_closure_transactions (transaction_id bigint PRIMARY KEY);
ALTER TABLE settleup.account_closure_transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.account_closure_transactions FROM PUBLIC, anon, authenticated;

ALTER TABLE settleup.groups DROP CONSTRAINT groups_owner_user_id_fkey;
ALTER TABLE settleup.groups ADD CONSTRAINT groups_owner_user_id_fkey
  FOREIGN KEY(owner_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE FUNCTION settleup.is_account_closed()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM settleup.closed_accounts WHERE user_id=auth.uid());
$$;
REVOKE ALL ON FUNCTION settleup.is_account_closed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.is_account_closed() TO authenticated;

CREATE FUNCTION settleup.guard_ledger_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE row_data jsonb; old_data jsonb; group_id uuid; owner_id uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM settleup.account_closure_transactions WHERE transaction_id=txid_current()) THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF auth.uid() IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text,711)); END IF;
  IF settleup.is_account_closed() THEN RAISE EXCEPTION 'This app account has been closed' USING ERRCODE='42501'; END IF;
  IF TG_OP='DELETE' THEN row_data:=to_jsonb(OLD); ELSE row_data:=to_jsonb(NEW); END IF;
  old_data:=to_jsonb(OLD);
  IF TG_OP='UPDATE' AND (old_data->>'group_id' IS DISTINCT FROM row_data->>'group_id' OR old_data->>'expense_id' IS DISTINCT FROM row_data->>'expense_id' OR old_data->>'item_id' IS DISTINCT FROM row_data->>'item_id') THEN RAISE EXCEPTION 'Records cannot be moved between ledgers' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='group_members' AND TG_OP IN ('UPDATE','DELETE') AND old_data->>'departed_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Departed members are retained only for history' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME='groups' THEN
    IF TG_OP<>'INSERT' AND OLD.owner_user_id IS NULL THEN RAISE EXCEPTION 'This group is read-only because its owner left' USING ERRCODE='42501'; END IF;
    IF TG_OP='INSERT' AND NEW.owner_user_id IS NULL THEN RAISE EXCEPTION 'A new group needs an owner'; END IF;
  ELSE
    group_id := (row_data->>'group_id')::uuid;
    IF group_id IS NULL AND row_data ? 'expense_id' THEN
      SELECT e.group_id INTO group_id FROM settleup.expenses e WHERE e.id=(row_data->>'expense_id')::uuid;
    ELSIF group_id IS NULL AND row_data ? 'item_id' THEN
      SELECT e.group_id INTO group_id FROM settleup.expense_items i JOIN settleup.expenses e ON e.id=i.expense_id WHERE i.id=(row_data->>'item_id')::uuid;
    END IF;
    IF group_id IS NOT NULL THEN
      SELECT g.owner_user_id INTO owner_id FROM settleup.groups g WHERE g.id=group_id FOR SHARE;
      IF FOUND AND owner_id IS NULL THEN RAISE EXCEPTION 'This group is read-only because its owner left' USING ERRCODE='42501'; END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;
REVOKE ALL ON FUNCTION settleup.guard_ledger_write() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['groups','group_members','expenses','expense_payers','expense_participants','expense_items','expense_item_participants','payments','recurring_expenses','expense_categories','expense_comments','user_payment_profiles','push_tokens'] LOOP
    EXECUTE format('CREATE TRIGGER guard_ledger_write BEFORE INSERT OR UPDATE OR DELETE ON settleup.%I FOR EACH ROW EXECUTE FUNCTION settleup.guard_ledger_write()',table_name);
  END LOOP;
END; $$;

-- Internal only. Also called before Auth deletion if an operator deletes a login.
CREATE FUNCTION settleup.close_app_account(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'Missing account'; END IF;
  -- Serialize repeated closure requests and group mutations against closure.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,711));
  INSERT INTO settleup.account_closure_transactions VALUES(txid_current()) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM settleup.groups g WHERE g.owner_user_id=p_user_id ORDER BY g.id FOR UPDATE;
  INSERT INTO settleup.closed_accounts(user_id) VALUES(p_user_id) ON CONFLICT DO NOTHING;
  DELETE FROM settleup.member_claim_invitations i USING settleup.group_members m
    WHERE i.member_id=m.id AND (m.user_id=p_user_id OR m.group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id=p_user_id));
  DELETE FROM settleup.push_tokens WHERE user_id=p_user_id;
  DELETE FROM settleup.user_payment_profiles WHERE user_id=p_user_id;
  DELETE FROM settleup.expense_comments WHERE author_user_id=p_user_id;
  UPDATE settleup.recurring_expenses SET active=false,created_by_user_id=NULL
    WHERE created_by_user_id=p_user_id OR group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id=p_user_id)
      OR payer_member_id IN (SELECT id FROM settleup.group_members WHERE user_id=p_user_id)
      OR participant_member_ids && ARRAY(SELECT id FROM settleup.group_members WHERE user_id=p_user_id);
  UPDATE settleup.expenses SET created_by_user_id=NULL WHERE created_by_user_id=p_user_id;
  UPDATE settleup.payments SET created_by_user_id=NULL WHERE created_by_user_id=p_user_id;
  UPDATE settleup.expense_categories SET created_by_user_id=NULL WHERE created_by_user_id=p_user_id;
  UPDATE settleup.group_members SET user_id=NULL,display_name='Former member',slug='departed-'||id::text,
    share_token=encode(extensions.gen_random_bytes(32),'hex'),departed_at=now(),role='member'
    WHERE user_id=p_user_id;
  UPDATE settleup.groups SET owner_user_id=NULL,invite_code=encode(extensions.gen_random_bytes(16),'hex') WHERE owner_user_id=p_user_id;
  DELETE FROM settleup.account_closure_transactions WHERE transaction_id=txid_current();
END; $$;
REVOKE ALL ON FUNCTION settleup.close_app_account(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION settleup.close_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  PERFORM settleup.close_app_account(auth.uid());
END; $$;
REVOKE ALL ON FUNCTION settleup.close_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.close_account() TO authenticated;

CREATE FUNCTION settleup.preserve_ledger_before_auth_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM settleup.close_app_account(OLD.id);
  RETURN OLD;
END; $$;
REVOKE ALL ON FUNCTION settleup.preserve_ledger_before_auth_delete() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER settleup_preserve_ledger BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION settleup.preserve_ledger_before_auth_delete();

-- Reconcile the ownership-transfer RPC missing from the connected project.
CREATE OR REPLACE FUNCTION settleup.transfer_group_ownership(p_group_id uuid,p_new_owner_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; member settleup.group_members%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR settleup.is_account_closed() THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT g.owner_user_id INTO owner_id FROM settleup.groups g WHERE g.id=p_group_id FOR UPDATE;
  IF owner_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Only the owner can transfer ownership' USING ERRCODE='42501'; END IF;
  SELECT * INTO member FROM settleup.group_members WHERE id=p_new_owner_member_id AND group_id=p_group_id FOR UPDATE;
  IF member.user_id IS NULL OR member.departed_at IS NOT NULL OR EXISTS(SELECT 1 FROM settleup.closed_accounts WHERE user_id=member.user_id) THEN RAISE EXCEPTION 'Choose an active linked member'; END IF;
  UPDATE settleup.groups SET owner_user_id=member.user_id WHERE id=p_group_id;
  UPDATE settleup.group_members SET role=CASE WHEN id=member.id THEN 'owner' ELSE 'member' END
    WHERE group_id=p_group_id AND (user_id=auth.uid() OR id=member.id);
  RETURN jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION settleup.transfer_group_ownership(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.transfer_group_ownership(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION settleup.leave_group(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m settleup.group_members%ROWTYPE; owner_id uuid;
BEGIN
  IF auth.uid() IS NULL OR settleup.is_account_closed() THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE='42501'; END IF;
  SELECT g.owner_user_id INTO owner_id FROM settleup.groups g WHERE g.id=p_group_id FOR UPDATE;
  IF owner_id=auth.uid() THEN RAISE EXCEPTION 'Transfer ownership before leaving'; END IF;
  SELECT * INTO m FROM settleup.group_members WHERE group_id=p_group_id AND user_id=auth.uid() FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'You are not a member' USING ERRCODE='42501'; END IF;
  INSERT INTO settleup.account_closure_transactions VALUES(txid_current());
  DELETE FROM settleup.member_claim_invitations WHERE member_id=m.id;
  UPDATE settleup.recurring_expenses SET active=false WHERE group_id=p_group_id AND
    (payer_member_id=m.id OR m.id=ANY(participant_member_ids));
  UPDATE settleup.group_members SET user_id=NULL,role='member',departed_at=now(),
    share_token=encode(extensions.gen_random_bytes(32),'hex') WHERE id=m.id;
  DELETE FROM settleup.account_closure_transactions WHERE transaction_id=txid_current();
  RETURN jsonb_build_object('success',true);
END; $$;
REVOKE ALL ON FUNCTION settleup.leave_group(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION settleup.leave_group(uuid) TO authenticated;
