-- =============================================================================
-- Phase 1.1: DB-level integrity constraints
--
-- Adds CHECK constraints that should have been on the schema from the start.
-- Also tightens nullability on payments.from_member_id / to_member_id, which
-- were added as nullable columns in migration 20260225000002 but all new
-- payments set both fields.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. expenses.amount_cents must be positive
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.expenses
  ADD CONSTRAINT expenses_amount_positive CHECK (amount_cents > 0);

-- ---------------------------------------------------------------------------
-- 2. payments.amount_cents must be positive
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.payments
  ADD CONSTRAINT payments_amount_positive CHECK (amount_cents > 0);

-- ---------------------------------------------------------------------------
-- 3. expense_participants.share_cents must be positive
--    (Prevents zero-share ghost rows that confuse balance calculations)
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.expense_participants
  ADD CONSTRAINT expense_participants_share_positive CHECK (share_cents > 0);

-- ---------------------------------------------------------------------------
-- 4. payments.from_member_id / to_member_id: tighten to NOT NULL
--    The legacy member_id column was dropped in 20260224000004.
--    All rows created since 20260225000002 have both fields set.
--    Pre-check to avoid silent failure on existing nulls.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM settleup.payments
    WHERE from_member_id IS NULL OR to_member_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Cannot add NOT NULL to payments.from_member_id / to_member_id: '
      'null rows exist. Backfill first.';
  END IF;
END $$;

ALTER TABLE settleup.payments
  ALTER COLUMN from_member_id SET NOT NULL,
  ALTER COLUMN to_member_id   SET NOT NULL;
