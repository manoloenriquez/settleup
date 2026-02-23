-- Add share_token column to groups
ALTER TABLE settleup.groups
  ADD COLUMN IF NOT EXISTS share_token TEXT DEFAULT NULL;

-- Backfill existing groups
UPDATE settleup.groups
  SET share_token = encode(gen_random_bytes(8), 'hex')
  WHERE share_token IS NULL;

-- Enforce NOT NULL
ALTER TABLE settleup.groups
  ALTER COLUMN share_token SET NOT NULL;

-- Add UNIQUE constraint
ALTER TABLE settleup.groups
  ADD CONSTRAINT groups_share_token_key UNIQUE (share_token);

-- Trigger: auto-generate for new groups
CREATE OR REPLACE FUNCTION settleup.set_group_share_token()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = settleup AS $$
BEGIN
  IF NEW.share_token IS NULL THEN
    NEW.share_token := encode(gen_random_bytes(8), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER groups_share_token_before_insert
  BEFORE INSERT ON settleup.groups
  FOR EACH ROW EXECUTE FUNCTION settleup.set_group_share_token();

-- RPC: get_group_overview (callable with anon key)
CREATE OR REPLACE FUNCTION settleup.get_group_overview(p_share_token TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = settleup AS $$
DECLARE
  v_group_id   UUID;
  v_group_name TEXT;
  v_members    JSONB;
  v_expenses   JSONB;
  v_profile    JSONB;
BEGIN
  SELECT id, name INTO v_group_id, v_group_name
  FROM groups WHERE share_token = p_share_token LIMIT 1;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Not found');
  END IF;

  -- Per-member balances (clamped to 0, sorted highest owed first)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'member_id',    gm.id,
      'display_name', gm.display_name,
      'owed_cents',   bal.owed_cents
    ) ORDER BY bal.owed_cents DESC
  ), '[]'::jsonb)
  INTO v_members
  FROM group_members gm
  CROSS JOIN LATERAL (
    SELECT GREATEST(0,
      COALESCE((SELECT SUM(ep.share_cents) FROM expense_participants ep WHERE ep.member_id = gm.id), 0) -
      COALESCE((SELECT SUM(p.amount_cents)  FROM payments p             WHERE p.member_id  = gm.id), 0)
    ) AS owed_cents
  ) bal
  WHERE gm.group_id = v_group_id;

  -- All expenses with per-participant breakdown
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'item_name',    e.item_name,
      'amount_cents', e.amount_cents,
      'created_at',   e.created_at,
      'participants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('display_name', gm2.display_name, 'share_cents', ep2.share_cents)
        ), '[]'::jsonb)
        FROM expense_participants ep2
        JOIN group_members gm2 ON gm2.id = ep2.member_id
        WHERE ep2.expense_id = e.id
      )
    ) ORDER BY e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM expenses e WHERE e.group_id = v_group_id;

  -- Payment profile
  SELECT jsonb_build_object(
    'payer_display_name',  pp.payer_display_name,
    'gcash_name',          pp.gcash_name,
    'gcash_number',        pp.gcash_number,
    'bank_name',           pp.bank_name,
    'bank_account_name',   pp.bank_account_name,
    'bank_account_number', pp.bank_account_number,
    'notes',               pp.notes
  ) INTO v_profile
  FROM payment_profiles pp WHERE pp.group_id = v_group_id;

  RETURN jsonb_build_object(
    'group',           jsonb_build_object('id', v_group_id, 'name', v_group_name),
    'members',         v_members,
    'expenses',        v_expenses,
    'payment_profile', v_profile
  );
END;
$$;

GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION settleup.get_group_overview(TEXT) TO authenticated;
