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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expenses_amount_positive'
  ) THEN
    ALTER TABLE settleup.expenses
      ADD CONSTRAINT expenses_amount_positive CHECK (amount_cents > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. payments.amount_cents must be positive
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_amount_positive'
  ) THEN
    ALTER TABLE settleup.payments
      ADD CONSTRAINT payments_amount_positive CHECK (amount_cents > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. expense_participants.share_cents must be positive
--    (Prevents zero-share ghost rows that confuse balance calculations)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'expense_participants_share_positive'
  ) THEN
    ALTER TABLE settleup.expense_participants
      ADD CONSTRAINT expense_participants_share_positive CHECK (share_cents > 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. payments.from_member_id / to_member_id: tighten to NOT NULL when safe
--    Legacy directional-payment rows may still have NULL to_member_id because
--    20260225000002 only backfilled from_member_id from the deprecated
--    member_id column. Do not fail the entire migration on those rows.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM settleup.payments
    WHERE from_member_id IS NULL OR to_member_id IS NULL
  ) THEN
    RAISE NOTICE
      'Skipping NOT NULL on payments.from_member_id / to_member_id because legacy rows still contain nulls.';
  ELSE
    ALTER TABLE settleup.payments
      ALTER COLUMN from_member_id SET NOT NULL,
      ALTER COLUMN to_member_id   SET NOT NULL;
  END IF;
END $$;
