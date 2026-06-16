-- =============================================================================
-- Phase 1.2: Deferred constraint triggers for financial integrity
--
-- All triggers are CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED so
-- they fire at transaction COMMIT rather than mid-transaction. This is
-- critical because the mutation RPCs (Phase 1.3) insert expense rows first
-- and then participants/payers within the same transaction — a non-deferred
-- trigger would see a partial sum and incorrectly reject valid inserts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Check function: payer sum == expense amount
CREATE OR REPLACE FUNCTION settleup.check_payer_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id     UUID;
  v_expense_amount BIGINT;
  v_payer_sum      BIGINT;
BEGIN
  v_expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.expense_id ELSE NEW.expense_id END;

  SELECT amount_cents INTO v_expense_amount
  FROM settleup.expenses WHERE id = v_expense_id;

  SELECT COALESCE(SUM(paid_cents), 0) INTO v_payer_sum
  FROM settleup.expense_payers WHERE expense_id = v_expense_id;

  IF v_payer_sum <> v_expense_amount THEN
    RAISE EXCEPTION
      'Payer total (%) does not match expense amount (%) for expense %',
      v_payer_sum, v_expense_amount, v_expense_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Check function: participant share sum == expense amount
CREATE OR REPLACE FUNCTION settleup.check_participant_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id     UUID;
  v_expense_amount BIGINT;
  v_share_sum      BIGINT;
BEGIN
  v_expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.expense_id ELSE NEW.expense_id END;

  SELECT amount_cents INTO v_expense_amount
  FROM settleup.expenses WHERE id = v_expense_id;

  SELECT COALESCE(SUM(share_cents), 0) INTO v_share_sum
  FROM settleup.expense_participants WHERE expense_id = v_expense_id;

  IF v_share_sum <> v_expense_amount THEN
    RAISE EXCEPTION
      'Participant share total (%) does not match expense amount (%) for expense %',
      v_share_sum, v_expense_amount, v_expense_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Check function: line item sum == parent expense amount
CREATE OR REPLACE FUNCTION settleup.check_item_sum()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_id     UUID;
  v_expense_amount BIGINT;
  v_item_sum       BIGINT;
BEGIN
  v_expense_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.expense_id ELSE NEW.expense_id END;

  SELECT amount_cents INTO v_expense_amount
  FROM settleup.expenses WHERE id = v_expense_id;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_item_sum
  FROM settleup.expense_items WHERE expense_id = v_expense_id;

  IF v_item_sum <> v_expense_amount THEN
    RAISE EXCEPTION
      'Line item total (%) does not match expense amount (%) for expense %',
      v_item_sum, v_expense_amount, v_expense_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Check function: expense participant/payer member belongs to same group as expense
CREATE OR REPLACE FUNCTION settleup.check_expense_member_group()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_expense_group UUID;
  v_member_group  UUID;
BEGIN
  SELECT group_id INTO v_expense_group
  FROM settleup.expenses WHERE id = NEW.expense_id;

  SELECT group_id INTO v_member_group
  FROM settleup.group_members WHERE id = NEW.member_id;

  IF v_expense_group IS DISTINCT FROM v_member_group THEN
    RAISE EXCEPTION
      'Member % belongs to group % but expense % belongs to group %',
      NEW.member_id, v_member_group, NEW.expense_id, v_expense_group;
  END IF;

  RETURN NEW;
END;
$$;

-- Check function: payment from/to members belong to the payment's group
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

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- 1. Validate payer sum after expense_payers DML
DROP TRIGGER IF EXISTS trg_validate_payer_sum ON settleup.expense_payers;
CREATE CONSTRAINT TRIGGER trg_validate_payer_sum
  AFTER INSERT OR UPDATE OR DELETE ON settleup.expense_payers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settleup.check_payer_sum();

-- 2. Validate participant share sum after expense_participants DML
DROP TRIGGER IF EXISTS trg_validate_participant_sum ON settleup.expense_participants;
CREATE CONSTRAINT TRIGGER trg_validate_participant_sum
  AFTER INSERT OR UPDATE OR DELETE ON settleup.expense_participants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settleup.check_participant_sum();

-- 3. Validate line item sum after expense_items DML
DROP TRIGGER IF EXISTS trg_validate_item_sum ON settleup.expense_items;
CREATE CONSTRAINT TRIGGER trg_validate_item_sum
  AFTER INSERT OR UPDATE OR DELETE ON settleup.expense_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settleup.check_item_sum();

-- 4. Validate participant member belongs to expense's group (immediate check is fine here,
--    as it only validates the new row, not a sum that spans multiple rows)
DROP TRIGGER IF EXISTS trg_expense_participant_group ON settleup.expense_participants;
CREATE CONSTRAINT TRIGGER trg_expense_participant_group
  AFTER INSERT OR UPDATE ON settleup.expense_participants
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settleup.check_expense_member_group();

-- 5. Validate payer member belongs to expense's group
DROP TRIGGER IF EXISTS trg_expense_payer_group ON settleup.expense_payers;
CREATE CONSTRAINT TRIGGER trg_expense_payer_group
  AFTER INSERT OR UPDATE ON settleup.expense_payers
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settleup.check_expense_member_group();

-- 6. Validate payment members belong to payment's group
DROP TRIGGER IF EXISTS trg_payment_member_group ON settleup.payments;
CREATE CONSTRAINT TRIGGER trg_payment_member_group
  AFTER INSERT OR UPDATE ON settleup.payments
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION settleup.check_payment_member_group();
