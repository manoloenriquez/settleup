-- A member who appears in any expense or payment cannot be deleted.
--
-- Deleting a group_members row cascades to expense_participants,
-- expense_payers, expense_item_participants and payments. For a member with
-- history that silently rewrites the ledger: a ₱300 expense split between two
-- people keeps its ₱300 total while its shares drop to ₱150, so balances no
-- longer sum to zero. The apps' "Remove from group" did exactly that.
--
-- Still allowed: members with no expenses or payments; deleting a whole group
-- (the cascade runs after the group row is gone); account closure, which keeps
-- members as departed and never deletes them anyway.

CREATE OR REPLACE FUNCTION settleup.guard_member_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM settleup.account_closure_transactions WHERE transaction_id = txid_current()) THEN
    RETURN OLD;
  END IF;
  -- Cascading from a deleted group: the whole ledger goes with it.
  IF NOT EXISTS (SELECT 1 FROM settleup.groups WHERE id = OLD.group_id) THEN
    RETURN OLD;
  END IF;
  IF EXISTS (SELECT 1 FROM settleup.expense_participants WHERE member_id = OLD.id)
     OR EXISTS (SELECT 1 FROM settleup.expense_payers WHERE member_id = OLD.id)
     OR EXISTS (SELECT 1 FROM settleup.expense_item_participants WHERE member_id = OLD.id)
     OR EXISTS (SELECT 1 FROM settleup.payments WHERE from_member_id = OLD.id OR to_member_id = OLD.id)
  THEN
    RAISE EXCEPTION '% is part of expenses or payments in this group, so they can''t be removed. Their balance would change for everyone.', OLD.display_name
      USING ERRCODE = '23503', HINT = 'member_has_history';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION settleup.guard_member_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS group_members_guard_history ON settleup.group_members;
CREATE TRIGGER group_members_guard_history
  BEFORE DELETE ON settleup.group_members
  FOR EACH ROW EXECUTE FUNCTION settleup.guard_member_history();
