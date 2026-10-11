-- Sharing controls and payment-detail privacy (audit phase 6).
--
-- A. Group share links can be regenerated or turned off. Turning a link off
--    also rotates the token, so the old link dies at once and nobody holds
--    the new one; turning it on issues a brand-new link (256-bit).
-- B. Payment details appear on shared links only when their owner opted in
--    (show_on_shared_links), only for people owed money in that currency,
--    never when the member hid them in that group, and masked to the last
--    four digits unless the owner chose to share full numbers.
-- C. Organizers can add payment details for members without an account;
--    shared pages label them as added by the organizer. When such a member
--    claims their record with an account, their own profile takes over.
--
-- Money logic of the redefined public functions is unchanged from
-- 20260908163441_currency_ledger; only their payment-detail parts differ.

-- ---------------------------------------------------------------------------
-- A. Share link controls
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.groups ADD COLUMN share_enabled boolean NOT NULL DEFAULT true;

CREATE FUNCTION settleup.rotate_group_share_token(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT settleup.is_group_admin_or_owner(p_group_id) THEN
    RAISE EXCEPTION 'Only group admins can change the shared link.' USING ERRCODE = '42501';
  END IF;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  UPDATE settleup.groups SET share_token = v_token WHERE id = p_group_id AND owner_user_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This group is read-only.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('share_token', v_token,
    'share_enabled', (SELECT share_enabled FROM settleup.groups WHERE id = p_group_id));
END;
$$;
REVOKE ALL ON FUNCTION settleup.rotate_group_share_token(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.rotate_group_share_token(uuid) TO authenticated;

CREATE FUNCTION settleup.set_group_share_enabled(p_group_id uuid, p_enabled boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_token text;
BEGIN
  IF auth.uid() IS NULL OR NOT settleup.is_group_admin_or_owner(p_group_id) THEN
    RAISE EXCEPTION 'Only group admins can change the shared link.' USING ERRCODE = '42501';
  END IF;
  IF p_enabled IS NULL THEN RAISE EXCEPTION 'Choose on or off.' USING ERRCODE = '22023'; END IF;
  -- Both directions rotate: off kills the old link, on issues a new one.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  UPDATE settleup.groups SET share_token = v_token, share_enabled = p_enabled
    WHERE id = p_group_id AND owner_user_id IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'This group is read-only.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('share_enabled', p_enabled, 'share_token', CASE WHEN p_enabled THEN v_token END);
END;
$$;
REVOKE ALL ON FUNCTION settleup.set_group_share_enabled(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.set_group_share_enabled(uuid, boolean) TO authenticated;

-- A disabled group's token is unknown to everyone, but refuse it anyway.
CREATE OR REPLACE FUNCTION settleup.get_share_currencies(p_share_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH target AS (
    SELECT g.id, g.default_currency_code FROM settleup.groups g
    WHERE p_share_token IS NOT NULL AND length(p_share_token) <= 128
      AND g.share_token = p_share_token AND g.share_enabled
    UNION
    SELECT g.id, g.default_currency_code FROM settleup.group_members m
    JOIN settleup.groups g ON g.id = m.group_id
    WHERE p_share_token IS NOT NULL AND length(p_share_token) <= 128
      AND m.share_token = p_share_token AND m.departed_at IS NULL
  ),
  codes AS (
    SELECT t.default_currency_code::text AS code, 0 AS rank FROM target t
    UNION SELECT e.currency_code::text, 1 FROM settleup.expenses e JOIN target t ON t.id = e.group_id
    UNION SELECT p.currency_code::text, 1 FROM settleup.payments p JOIN target t ON t.id = p.group_id
  )
  SELECT coalesce(jsonb_agg(code ORDER BY rank, code), '[]'::jsonb)
  FROM (SELECT code, min(rank) AS rank FROM codes GROUP BY code) ranked;
$$;

-- ---------------------------------------------------------------------------
-- B. Payment-detail privacy settings
-- ---------------------------------------------------------------------------

ALTER TABLE settleup.user_payment_profiles
  ADD COLUMN show_on_shared_links boolean NOT NULL DEFAULT false,
  ADD COLUMN share_full_numbers boolean NOT NULL DEFAULT false;
-- Profiles saved before this setting existed were already shown on links.
UPDATE settleup.user_payment_profiles SET show_on_shared_links = true;

ALTER TABLE settleup.group_members ADD COLUMN hide_payment_details boolean NOT NULL DEFAULT false;

-- A member chooses to hide their own details in one group.
CREATE FUNCTION settleup.set_hide_payment_details(p_group_id uuid, p_hidden boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE settleup.group_members SET hide_payment_details = coalesce(p_hidden, false)
    WHERE group_id = p_group_id AND user_id = auth.uid() AND departed_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not in this group.' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object('hide_payment_details', coalesce(p_hidden, false));
END;
$$;
REVOKE ALL ON FUNCTION settleup.set_hide_payment_details(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.set_hide_payment_details(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- C. Payment details for members without an account
-- ---------------------------------------------------------------------------

CREATE TABLE settleup.member_payment_details (
  member_id            uuid PRIMARY KEY REFERENCES settleup.group_members(id) ON DELETE CASCADE,
  payer_display_name   text CHECK (payer_display_name IS NULL OR char_length(payer_display_name) <= 80),
  gcash_name           text CHECK (gcash_name IS NULL OR char_length(gcash_name) <= 80),
  gcash_number         text CHECK (gcash_number IS NULL OR char_length(gcash_number) <= 40),
  gcash_qr_url         text CHECK (gcash_qr_url IS NULL OR char_length(gcash_qr_url) <= 500),
  bank_name            text CHECK (bank_name IS NULL OR char_length(bank_name) <= 80),
  bank_account_name    text CHECK (bank_account_name IS NULL OR char_length(bank_account_name) <= 80),
  bank_account_number  text CHECK (bank_account_number IS NULL OR char_length(bank_account_number) <= 40),
  bank_qr_url          text CHECK (bank_qr_url IS NULL OR char_length(bank_qr_url) <= 500),
  notes                text CHECK (notes IS NULL OR char_length(notes) <= 280),
  show_on_shared_links boolean NOT NULL DEFAULT true,
  share_full_numbers   boolean NOT NULL DEFAULT false,
  added_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE settleup.member_payment_details ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON settleup.member_payment_details FROM PUBLIC, anon, authenticated;
GRANT SELECT ON settleup.member_payment_details TO authenticated;
CREATE POLICY member_payment_details_select_group ON settleup.member_payment_details
  FOR SELECT TO authenticated
  USING (member_id IN (SELECT m.id FROM settleup.group_members m WHERE m.group_id IN (SELECT settleup.user_group_ids())));

CREATE FUNCTION settleup.upsert_member_payment_details(p_member_id uuid, p_details jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE m settleup.group_members%ROWTYPE;
BEGIN
  SELECT * INTO m FROM settleup.group_members WHERE id = p_member_id;
  IF auth.uid() IS NULL OR m.id IS NULL OR NOT settleup.is_group_admin_or_owner(m.group_id) THEN
    RAISE EXCEPTION 'Only group admins can add payment details for others.' USING ERRCODE = '42501';
  END IF;
  IF m.user_id IS NOT NULL OR m.departed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This person manages their own payment details.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM settleup.groups WHERE id = m.group_id AND owner_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'This group is read-only.' USING ERRCODE = '42501';
  END IF;
  INSERT INTO settleup.member_payment_details AS d (
    member_id, payer_display_name, gcash_name, gcash_number, gcash_qr_url, bank_name,
    bank_account_name, bank_account_number, bank_qr_url, notes, show_on_shared_links,
    share_full_numbers, added_by_user_id, updated_at)
  VALUES (
    p_member_id, nullif(btrim(p_details->>'payer_display_name'), ''), nullif(btrim(p_details->>'gcash_name'), ''),
    nullif(btrim(p_details->>'gcash_number'), ''), nullif(btrim(p_details->>'gcash_qr_url'), ''),
    nullif(btrim(p_details->>'bank_name'), ''), nullif(btrim(p_details->>'bank_account_name'), ''),
    nullif(btrim(p_details->>'bank_account_number'), ''), nullif(btrim(p_details->>'bank_qr_url'), ''),
    nullif(btrim(p_details->>'notes'), ''), coalesce((p_details->>'show_on_shared_links')::boolean, true),
    coalesce((p_details->>'share_full_numbers')::boolean, false), auth.uid(), now())
  ON CONFLICT (member_id) DO UPDATE SET
    payer_display_name = EXCLUDED.payer_display_name, gcash_name = EXCLUDED.gcash_name,
    gcash_number = EXCLUDED.gcash_number, gcash_qr_url = EXCLUDED.gcash_qr_url,
    bank_name = EXCLUDED.bank_name, bank_account_name = EXCLUDED.bank_account_name,
    bank_account_number = EXCLUDED.bank_account_number, bank_qr_url = EXCLUDED.bank_qr_url,
    notes = EXCLUDED.notes, show_on_shared_links = EXCLUDED.show_on_shared_links,
    share_full_numbers = EXCLUDED.share_full_numbers, added_by_user_id = auth.uid(), updated_at = now();
  RETURN jsonb_build_object('member_id', p_member_id, 'saved', true);
END;
$$;
REVOKE ALL ON FUNCTION settleup.upsert_member_payment_details(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.upsert_member_payment_details(uuid, jsonb) TO authenticated;

CREATE FUNCTION settleup.delete_member_payment_details(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_group uuid;
BEGIN
  SELECT group_id INTO v_group FROM settleup.group_members WHERE id = p_member_id;
  IF auth.uid() IS NULL OR v_group IS NULL OR NOT settleup.is_group_admin_or_owner(v_group) THEN
    RAISE EXCEPTION 'Only group admins can remove payment details for others.' USING ERRCODE = '42501';
  END IF;
  DELETE FROM settleup.member_payment_details WHERE member_id = p_member_id;
  RETURN jsonb_build_object('member_id', p_member_id, 'deleted', true);
END;
$$;
REVOKE ALL ON FUNCTION settleup.delete_member_payment_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION settleup.delete_member_payment_details(uuid) TO authenticated;

-- When an account claims a member record, the person's own profile replaces
-- whatever an organizer entered for them.
CREATE FUNCTION settleup.drop_organizer_details_on_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    DELETE FROM settleup.member_payment_details WHERE member_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION settleup.drop_organizer_details_on_claim() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER group_members_drop_organizer_details
  AFTER UPDATE OF user_id ON settleup.group_members
  FOR EACH ROW EXECUTE FUNCTION settleup.drop_organizer_details_on_claim();

-- ---------------------------------------------------------------------------
-- One place that decides which payment details a viewer may see.
-- p_public = true for anonymous shared pages: only opted-in details, never
-- for a member who hid them in this group, masked unless full numbers are
-- shared. p_public = false for signed-in members of the group: full details.
-- ---------------------------------------------------------------------------

CREATE FUNCTION settleup.member_payment_profile(p_member_id uuid, p_public boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  m settleup.group_members%ROWTYPE;
  u settleup.user_payment_profiles%ROWTYPE;
  d settleup.member_payment_details%ROWTYPE;
  v_full boolean;
BEGIN
  SELECT * INTO m FROM settleup.group_members WHERE id = p_member_id;
  IF m.id IS NULL OR m.departed_at IS NOT NULL THEN RETURN NULL; END IF;
  IF m.user_id IS NOT NULL THEN
    SELECT * INTO u FROM settleup.user_payment_profiles WHERE user_id = m.user_id;
    IF u.user_id IS NULL THEN RETURN NULL; END IF;
    IF p_public AND (NOT u.show_on_shared_links OR m.hide_payment_details) THEN RETURN NULL; END IF;
    v_full := NOT p_public OR u.share_full_numbers;
    RETURN jsonb_build_object(
      'source', 'self',
      'payer_display_name', u.payer_display_name,
      'gcash_name', u.gcash_name,
      'gcash_number', CASE WHEN v_full THEN u.gcash_number ELSE settleup.mask_account(u.gcash_number) END,
      'gcash_qr_url', u.gcash_qr_url,
      'bank_name', u.bank_name,
      'bank_account_name', u.bank_account_name,
      'bank_account_number', CASE WHEN v_full THEN u.bank_account_number ELSE settleup.mask_account(u.bank_account_number) END,
      'bank_qr_url', u.bank_qr_url,
      'notes', u.notes,
      'numbers_masked', NOT v_full);
  END IF;
  SELECT * INTO d FROM settleup.member_payment_details WHERE member_id = p_member_id;
  IF d.member_id IS NULL THEN RETURN NULL; END IF;
  IF p_public AND NOT d.show_on_shared_links THEN RETURN NULL; END IF;
  v_full := NOT p_public OR d.share_full_numbers;
  RETURN jsonb_build_object(
    'source', 'organizer',
    'payer_display_name', d.payer_display_name,
    'gcash_name', d.gcash_name,
    'gcash_number', CASE WHEN v_full THEN d.gcash_number ELSE settleup.mask_account(d.gcash_number) END,
    'gcash_qr_url', d.gcash_qr_url,
    'bank_name', d.bank_name,
    'bank_account_name', d.bank_account_name,
    'bank_account_number', CASE WHEN v_full THEN d.bank_account_number ELSE settleup.mask_account(d.bank_account_number) END,
    'bank_qr_url', d.bank_qr_url,
    'notes', d.notes,
    'numbers_masked', NOT v_full);
END;
$$;
REVOKE ALL ON FUNCTION settleup.member_payment_profile(uuid, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Redefined readers (bodies from 20260908163441; payment parts replaced)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION settleup.get_creditor_profiles_v2(p_group_id uuid, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
DECLARE
  v_user_id UUID;
  v_result  JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Auth: caller must be a linked group member
  IF NOT EXISTS (
    SELECT 1 FROM group_members
    WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Payment details of every member owed money in this currency: their own
  -- profile (if they chose to share it) or details an organizer entered.
  SELECT COALESCE(jsonb_agg(
    pp.profile || jsonb_build_object('currency_code', p_currency_code, 'member_id', gm.id, 'display_name', gm.display_name)
  ), '[]'::jsonb)
  INTO v_result
  FROM group_members gm
  CROSS JOIN LATERAL (SELECT settleup.member_payment_profile(gm.id, false) AS profile) pp
  WHERE gm.group_id = p_group_id
    AND gm.departed_at IS NULL
    AND pp.profile IS NOT NULL
    AND (
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION settleup.get_group_overview_v2(p_share_token text, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
DECLARE
  v_group_id   UUID;
  v_group_name TEXT;
  v_owner_id   UUID;
  v_members    JSONB;
  v_expenses   JSONB;
  v_payments   JSONB;
  v_profile    JSONB;
  v_creditor_profiles JSONB;
BEGIN
  SELECT id, name, owner_user_id
  INTO v_group_id, v_group_name, v_owner_id
  FROM groups WHERE share_token = p_share_token AND share_enabled LIMIT 1;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('currency_code', p_currency_code, 'error', 'Not found');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'member_id', gm.id,
      'display_name', gm.display_name,
      'net_cents', bal.net_cents,
      'owed_cents', GREATEST(0, -bal.net_cents)
    ) ORDER BY bal.net_cents ASC
  ), '[]'::jsonb)
  INTO v_members
  FROM group_members gm
  CROSS JOIN LATERAL (
    SELECT (
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) AS net_cents
  ) bal
  WHERE gm.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'id', e.id,
      'item_name', e.item_name,
      'amount_cents', e.amount_cents,
      'created_at', e.created_at,
      'expense_date', e.expense_date,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object('currency_code', p_currency_code, 
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'payers', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 'member_id', ep3.member_id, 'display_name', gm3.display_name, 'paid_cents', ep3.paid_cents)
          ORDER BY ep3.paid_cents DESC
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep3
        JOIN group_members gm3 ON gm3.id = ep3.member_id
        WHERE ep3.expense_id = e.id
      ),
      'participants', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 'member_id', ep2.member_id, 'display_name', gm2.display_name, 'share_cents', ep2.share_cents)
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep2
        JOIN group_members gm2 ON gm2.id = ep2.member_id
        WHERE ep2.expense_id = e.id
      ),
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 
            'name', ei.name,
            'amount_cents', ei.amount_cents,
            'participants', (
              SELECT COALESCE(jsonb_agg(
                jsonb_build_object('currency_code', p_currency_code, 'member_id', eip.member_id, 'display_name', gm4.display_name, 'share_cents', eip.share_cents)
              ), '[]'::jsonb)
              FROM (SELECT x.* FROM settleup.expense_item_participants x JOIN settleup.expense_items xi ON xi.id=x.item_id JOIN settleup.expenses xe ON xe.id=xi.expense_id WHERE xe.currency_code=p_currency_code) eip
              JOIN group_members gm4 ON gm4.id = eip.member_id
              WHERE eip.item_id = ei.id
            )
          )
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_items x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ei WHERE ei.expense_id = e.id
      )
    ) ORDER BY e.expense_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM (SELECT * FROM settleup.expenses WHERE currency_code=p_currency_code) e
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE e.group_id = v_group_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'from_member_id', p.from_member_id,
      'from_display_name', gmf.display_name,
      'to_member_id', p.to_member_id,
      'to_display_name', gmt.display_name,
      'amount_cents', p.amount_cents,
      'created_at', p.created_at
    ) ORDER BY p.created_at DESC
  ), '[]'::jsonb)
  INTO v_payments
  FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p
  JOIN group_members gmf ON gmf.id = p.from_member_id
  JOIN group_members gmt ON gmt.id = p.to_member_id
  WHERE p.group_id = v_group_id AND p.status = 'PAID';

  -- Payment details of every member owed money in this currency: their own
  -- profile (if they chose to share it) or details an organizer entered.
  SELECT COALESCE(jsonb_agg(
    pp.profile || jsonb_build_object('currency_code', p_currency_code, 'member_id', gm.id, 'display_name', gm.display_name)
  ), '[]'::jsonb)
  INTO v_creditor_profiles
  FROM group_members gm
  CROSS JOIN LATERAL (SELECT settleup.member_payment_profile(gm.id, true) AS profile) pp
  WHERE gm.group_id = v_group_id
    AND gm.departed_at IS NULL
    AND pp.profile IS NOT NULL
    AND (
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  -- The organizer's details, only while the organizer is owed money in this
  -- currency and has chosen to show them on shared links.
  SELECT settleup.member_payment_profile(gm.id, true) || jsonb_build_object('currency_code', p_currency_code)
  INTO v_profile
  FROM group_members gm
  WHERE gm.group_id = v_group_id AND gm.user_id = v_owner_id AND gm.departed_at IS NULL
    AND (
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  RETURN jsonb_build_object('currency_code', p_currency_code, 
    'group', jsonb_build_object('currency_code', p_currency_code, 'id', v_group_id, 'name', v_group_name),
    'members', v_members,
    'expenses', v_expenses,
    'payments', v_payments,
    'payment_profile', v_profile,
    'creditor_profiles', v_creditor_profiles
  );
END;
$function$;

CREATE OR REPLACE FUNCTION settleup.get_friend_view_v2(p_share_token text, p_currency_code settleup.currency_code DEFAULT 'PHP')
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'settleup'
AS $function$
DECLARE
  v_member_id    UUID;
  v_group_id     UUID;
  v_display_name TEXT;
  v_group_name   TEXT;
  v_owner_id     UUID;
  v_net_cents    BIGINT;
  v_profile      JSONB;
  v_expenses     JSONB;
  v_all_balances JSONB;
  v_creditor_profiles JSONB;
BEGIN
  SELECT gm.id, gm.group_id, gm.display_name, g.name, g.owner_user_id
  INTO v_member_id, v_group_id, v_display_name, v_group_name, v_owner_id
  FROM group_members gm
  JOIN groups g ON g.id = gm.group_id
  WHERE gm.share_token = p_share_token
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('currency_code', p_currency_code, 'error', 'Not found');
  END IF;

  SELECT (
    COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = v_member_id), 0)
    - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = v_member_id AND p.status = 'PAID'), 0)
    + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = v_member_id AND p.status = 'PAID'), 0)
  ) INTO v_net_cents;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'member_id', gm.id,
      'display_name', gm.display_name,
      'net_cents', (
        COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
        - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
        + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
      )
    )
  ), '[]'::jsonb)
  INTO v_all_balances
  FROM group_members gm
  WHERE gm.group_id = v_group_id;

  -- Payment details of every member owed money in this currency: their own
  -- profile (if they chose to share it) or details an organizer entered.
  SELECT COALESCE(jsonb_agg(
    pp.profile || jsonb_build_object('currency_code', p_currency_code, 'member_id', gm.id, 'display_name', gm.display_name)
  ), '[]'::jsonb)
  INTO v_creditor_profiles
  FROM group_members gm
  CROSS JOIN LATERAL (SELECT settleup.member_payment_profile(gm.id, true) AS profile) pp
  WHERE gm.group_id = v_group_id
    AND gm.departed_at IS NULL
    AND pp.profile IS NOT NULL
    AND (
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  -- The organizer's details, only while the organizer is owed money in this
  -- currency and has chosen to show them on shared links.
  SELECT settleup.member_payment_profile(gm.id, true) || jsonb_build_object('currency_code', p_currency_code)
  INTO v_profile
  FROM group_members gm
  WHERE gm.group_id = v_group_id AND gm.user_id = v_owner_id AND gm.departed_at IS NULL
    AND (
      COALESCE((SELECT SUM(ep.paid_cents) FROM (SELECT x.* FROM settleup.expense_payers x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep WHERE ep.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(epa.share_cents) FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) epa WHERE epa.member_id = gm.id), 0)
      - COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.to_member_id = gm.id AND p.status = 'PAID'), 0)
      + COALESCE((SELECT SUM(p.amount_cents) FROM (SELECT * FROM settleup.payments WHERE currency_code=p_currency_code) p WHERE p.from_member_id = gm.id AND p.status = 'PAID'), 0)
    ) > 0;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('currency_code', p_currency_code, 
      'item_name', e.item_name,
      'share_cents', ep.share_cents,
      'created_at', e.created_at,
      'expense_date', e.expense_date,
      'category', CASE WHEN ec.id IS NULL THEN NULL ELSE jsonb_build_object('currency_code', p_currency_code, 
        'id', ec.id,
        'name', ec.name,
        'slug', ec.slug,
        'icon', ec.icon,
        'color', ec.color,
        'is_default', ec.is_default
      ) END,
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object('currency_code', p_currency_code, 'name', ei.name, 'share_cents', eip.share_cents)
          ORDER BY ei.created_at
        ), '[]'::jsonb)
        FROM (SELECT x.* FROM settleup.expense_item_participants x JOIN settleup.expense_items xi ON xi.id=x.item_id JOIN settleup.expenses xe ON xe.id=xi.expense_id WHERE xe.currency_code=p_currency_code) eip
        JOIN (SELECT x.* FROM settleup.expense_items x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ei ON ei.id = eip.item_id
        WHERE ei.expense_id = e.id AND eip.member_id = v_member_id
      )
    ) ORDER BY e.expense_date DESC, e.created_at DESC
  ), '[]'::jsonb)
  INTO v_expenses
  FROM (SELECT x.* FROM settleup.expense_participants x JOIN settleup.expenses xe ON xe.id=x.expense_id WHERE xe.currency_code=p_currency_code) ep
  JOIN (SELECT * FROM settleup.expenses WHERE currency_code=p_currency_code) e ON e.id = ep.expense_id
  LEFT JOIN expense_categories ec ON ec.id = e.category_id
  WHERE ep.member_id = v_member_id;

  RETURN jsonb_build_object('currency_code', p_currency_code, 
    'group', jsonb_build_object('currency_code', p_currency_code, 'id', v_group_id, 'name', v_group_name),
    'member', jsonb_build_object('currency_code', p_currency_code, 'id', v_member_id, 'display_name', v_display_name),
    'net_cents', v_net_cents,
    'owed_cents', GREATEST(0, -v_net_cents),
    'payment_profile', v_profile,
    'all_balances', v_all_balances,
    'creditor_profiles', v_creditor_profiles,
    'expenses', v_expenses
  );
END;
$function$;
