-- =============================================================================
-- Move SettleUp tables from public schema to settleup schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Create settleup schema and grant access
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS settleup;
GRANT USAGE ON SCHEMA settleup TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA settleup
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;

-- ---------------------------------------------------------------------------
-- Drop SettleUp objects from public (created by prior migration)
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_friend_view(TEXT);
DROP TABLE IF EXISTS public.payment_profiles CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.expense_participants CASCADE;
DROP TABLE IF EXISTS public.expenses CASCADE;
DROP TABLE IF EXISTS public.group_members CASCADE;
DROP TABLE IF EXISTS public.groups CASCADE;

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.groups (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  owner_user_id  UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  invite_code    TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  is_archived    BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settleup.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "groups_owner_all"
  ON settleup.groups FOR ALL
  TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.group_members (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES settleup.groups(id) ON DELETE CASCADE,
  display_name  TEXT        NOT NULL,
  slug          TEXT        NOT NULL,
  share_token   TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, slug)
);

ALTER TABLE settleup.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "group_members_owner_all"
  ON settleup.group_members FOR ALL
  TO authenticated
  USING (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()))
  WITH CHECK (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.expenses (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES settleup.groups(id) ON DELETE CASCADE,
  item_name     TEXT        NOT NULL,
  amount_cents  BIGINT      NOT NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settleup.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_owner_all"
  ON settleup.expenses FOR ALL
  TO authenticated
  USING (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()))
  WITH CHECK (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- expense_participants
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.expense_participants (
  expense_id   UUID   NOT NULL REFERENCES settleup.expenses(id) ON DELETE CASCADE,
  member_id    UUID   NOT NULL REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  share_cents  BIGINT NOT NULL,
  PRIMARY KEY (expense_id, member_id)
);

ALTER TABLE settleup.expense_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expense_participants_owner_all"
  ON settleup.expense_participants FOR ALL
  TO authenticated
  USING (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      JOIN settleup.groups g ON g.id = e.group_id
      WHERE g.owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    expense_id IN (
      SELECT e.id FROM settleup.expenses e
      JOIN settleup.groups g ON g.id = e.group_id
      WHERE g.owner_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.payments (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID        NOT NULL REFERENCES settleup.groups(id) ON DELETE CASCADE,
  member_id     UUID        NOT NULL REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  amount_cents  BIGINT      NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settleup.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payments_owner_all"
  ON settleup.payments FOR ALL
  TO authenticated
  USING (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()))
  WITH CHECK (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- payment_profiles
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.payment_profiles (
  group_id             UUID    PRIMARY KEY REFERENCES settleup.groups(id) ON DELETE CASCADE,
  payer_display_name   TEXT,
  gcash_name           TEXT,
  gcash_number         TEXT,
  bank_name            TEXT,
  bank_account_name    TEXT,
  bank_account_number  TEXT,
  notes                TEXT,
  gcash_qr_url         TEXT,
  bank_qr_url          TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE settleup.payment_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_profiles_owner_all"
  ON settleup.payment_profiles FOR ALL
  TO authenticated
  USING (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()))
  WITH CHECK (group_id IN (SELECT id FROM settleup.groups WHERE owner_user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- SECURITY DEFINER function: get_friend_view
-- Callable with anon key — returns the friend's balance and expense breakdown.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.get_friend_view(p_share_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = settleup
AS $$
DECLARE
  v_member_id    UUID;
  v_group_id     UUID;
  v_display_name TEXT;
  v_group_name   TEXT;
  v_owed_cents   BIGINT;
  v_profile      JSONB;
  v_expenses     JSONB;
BEGIN
  -- Resolve member from token
  SELECT gm.id, gm.group_id, gm.display_name, g.name
  INTO v_member_id, v_group_id, v_display_name, v_group_name
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.share_token = p_share_token
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  -- Compute owed_cents
  SELECT GREATEST(0,
    COALESCE((
      SELECT SUM(ep.share_cents)
      FROM expense_participants ep
      WHERE ep.member_id = v_member_id
    ), 0)
    - COALESCE((
      SELECT SUM(p.amount_cents)
      FROM payments p
      WHERE p.member_id = v_member_id
    ), 0)
  )
  INTO v_owed_cents;

  -- Payment profile
  SELECT jsonb_build_object(
    'payer_display_name', pp.payer_display_name,
    'gcash_name',         pp.gcash_name,
    'gcash_number',       pp.gcash_number,
    'bank_name',          pp.bank_name,
    'bank_account_name',  pp.bank_account_name,
    'bank_account_number', pp.bank_account_number,
    'notes',              pp.notes,
    'gcash_qr_url',       pp.gcash_qr_url,
    'bank_qr_url',        pp.bank_qr_url
  )
  INTO v_profile
  FROM payment_profiles pp
  WHERE pp.group_id = v_group_id;

  -- Expense items for this member
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_name',   e.item_name,
      'share_cents', ep.share_cents,
      'created_at',  e.created_at
    ) ORDER BY e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expense_participants ep
  JOIN expenses e ON e.id = ep.expense_id
  WHERE ep.member_id = v_member_id;

  RETURN jsonb_build_object(
    'group',           jsonb_build_object('id', v_group_id, 'name', v_group_name),
    'member',          jsonb_build_object('id', v_member_id, 'display_name', v_display_name),
    'owed_cents',      v_owed_cents,
    'payment_profile', v_profile,
    'expenses',        v_expenses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION settleup.get_friend_view(TEXT) TO authenticated;
